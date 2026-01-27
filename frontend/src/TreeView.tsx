import React, { useCallback, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { getBranchColorFromTree, BRANCH_COLORS, getRandomBranchColor } from './utils/branchColors';
import { generateUniqueBranchName } from './utils/branchNaming';
import ContextMenu from './components/ContextMenu';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children?: Message[] | string[];
}

interface TreeViewProps {
  messages: { [key: string]: Message };
  rootMessages: string[];
  onMessageSelect: (messageId: string) => void;
  onSwitchToChatView: (branchName: string, messageId: string) => void;
  onCreateBranch: (messageId: string, branchName: string, color?: string, switchToChat?: boolean) => void;
  onRegenerate?: (messageId: string, type: 'branch' | 'place', branchName?: string, switchToChat?: boolean) => void;
  onBeginEdit?: (messageId: string, originalContent: string, originView?: 'chat' | 'tree') => void;
  onDeselectMessage?: () => void;
  onRequestDelete?: (message: Message) => void;
  selectedMessage?: string;
  conversationTree?: any;
  pendingUserMessage?: { id: string; content: string; created_at: string; error?: string; retryCount?: number } | null;
  onRetrySendMessage?: () => void;
}

const TreeView: React.FC<TreeViewProps> = ({
  messages,
  rootMessages,
  onMessageSelect,
  onSwitchToChatView,
  onCreateBranch,
  onRegenerate,
  onBeginEdit,
  onDeselectMessage,
  selectedMessage,
  conversationTree,
  pendingUserMessage,
  onRetrySendMessage
  ,onRequestDelete
}) => {
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contextMenuMessage, setContextMenuMessage] = useState<Message | null>(null);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showRegenBranchDialog, setShowRegenBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [regenBranchName, setRegenBranchName] = useState('');
  const [branchColor, setBranchColor] = useState('#3B82F6');
  const [branchDialogSource, setBranchDialogSource] = useState<Message | null>(null);
  const [regenDialogSource, setRegenDialogSource] = useState<Message | null>(null);
  const lastActionTimeRef = React.useRef<number | null>(null);

  const handleRightClick = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuMessage(message);
  }, []);

  const handleCloseContextMenu = () => {
    setContextMenuMessage(null);
  };


  // Path to root for highlighting
  const pathToRoot = useMemo(() => {
    if (!selectedMessage || !messages) return new Set<string>();
    const path = new Set<string>();
    const visited = new Set<string>();
    const parentMap: { [childId: string]: string } = {};
    Object.values(messages).forEach(message => {
      const children = message.children || [];
      (children as any[]).forEach(child => {
        const childId = typeof child === 'string' ? child : child.id;
        parentMap[childId] = message.id;
      });
    });
    let currentId: string | undefined = selectedMessage;
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      path.add(currentId);
      currentId = parentMap[currentId];
    }
    return path;
  }, [selectedMessage, messages]);

  // Branch dialog handler
  const handleCreateBranch = () => {
    if (branchName.trim() && contextMenuMessage) {
  // When creating a branch from the tree view, don't switch to chat view — keep the user in the tree
  onCreateBranch(contextMenuMessage.id, branchName.trim(), branchColor, false as any);
      setShowBranchDialog(false);
      setBranchName('');
      setBranchColor('#3B82F6');
      setContextMenuMessage(null);
    }
  };

  // Robust, type-safe node/edge creation
  const { flowNodes, flowEdges } = useMemo(() => {
  // PERF logging removed to avoid console.errors when time markers mismatch
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const positions: Record<string, { x: number; y: number }> = {};
    const spacingX = 300;
    const spacingYBase = 160;
    const spacingAssistantToUser = 220; // larger gap between AI response and next human message
    const spacingUserToAssistant = 120; // smaller gap between human message and AI response

    function computeSpacing(parentId: string, childId: string) {
      const parentRole = messages[parentId]?.role || '';
      const childRole = messages[childId]?.role || '';
      if (parentRole === 'assistant' && childRole === 'user') return spacingAssistantToUser;
      if (parentRole === 'user' && childRole === 'assistant') return spacingUserToAssistant;
      return spacingYBase;
    }
    // Helper to recursively layout the tree
    function layoutTree(messageId: string, x: number, y: number, visited: Set<string>) {
      if (visited.has(messageId)) return x;
      visited.add(messageId);
      positions[messageId] = { x, y };
      const message = messages[messageId];
      if (!message) return x;
      const childrenRaw = message.children || [];
      const childIds: string[] = (childrenRaw as any[]).map(child => typeof child === 'string' ? child : child.id);
      let currentX = x;
      childIds.forEach((childId, idx) => {
        const deltaY = computeSpacing(messageId, childId);
        currentX = layoutTree(childId, currentX, y + deltaY, visited);
        if (idx < childIds.length - 1) currentX += spacingX;
      });
      if (childIds.length > 1) {
        const firstX = positions[childIds[0]]?.x ?? x;
        const lastX = positions[childIds[childIds.length - 1]]?.x ?? x;
        positions[messageId].x = (firstX + lastX) / 2;
      }
      return positions[messageId].x;
    }
    // Layout all root messages
    let rootX = 0;
    rootMessages.forEach((rootId, idx) => {
      rootX = layoutTree(rootId, rootX, 0, new Set());
      if (idx < rootMessages.length - 1) rootX += spacingX;
    });
    // Build nodes
    Object.values(messages).forEach(message => {
      const pos = positions[message.id] || { x: 0, y: 0 };
      const isSelected = selectedMessage === message.id;
      const isInPath = pathToRoot.has(message.id);
      const isRoot = rootMessages.includes(message.id);
      let nodeClasses = `tree-node ${message.role}`;
      if (isSelected) nodeClasses += ' selected';
      else if (isInPath) {
        nodeClasses += ' in-path';
        if (isRoot) nodeClasses += ' root-in-path';
      }
      nodes.push({
        id: message.id,
        type: 'default',
        position: pos,
        data: {
          label: (
            <div
              className={nodeClasses}
              onClick={() => onMessageSelect(message.id)}
              onDoubleClick={() => onSwitchToChatView(message.branch_name, message.id)}
              onContextMenu={e => handleRightClick(e, message)}
              title={message.role === 'assistant' ? "Click to select. Double-click to switch to chat view. Right-click to create branch." : "Click to select. Double-click to switch to chat view."}
            >
              <div className="tree-node-header"></div>
              <div className="tree-node-content">{message.content}</div>
              {message.llm_model && <div className="tree-node-model">{message.llm_model}</div>}
            </div>
          ),
        },
        style: { background: 'transparent', border: 'none', padding: 0 },
      });
      // Edges
      const childrenRaw = message.children || [];
      const childIds: string[] = (childrenRaw as any[]).map(child => typeof child === 'string' ? child : child.id);
      childIds.forEach(childId => {
        const childBranch = messages[childId]?.branch_name ?? 'main';
        const isDirect = selectedMessage === childId || selectedMessage === message.id;
        const isPath = pathToRoot.has(message.id) && pathToRoot.has(childId);
        let edgeStyle: any = { stroke: getBranchColorFromTree(childBranch, conversationTree), strokeWidth: 2 };
        let animated = false;
        if (isDirect) { edgeStyle.strokeWidth = 4; edgeStyle.stroke = '#667eea'; animated = true; }
        else if (isPath) { /* Optionally highlight path */ }
        edges.push({
          id: `${message.id}-${childId}`,
          source: message.id,
          target: childId,
          type: 'smoothstep',
          style: edgeStyle,
          animated,
        });
      });
    });
    // Pending user message node (only if not already in messages and not duplicated by content)
    if (pendingUserMessage) {
      const branchName = conversationTree?.currentBranch || 'main';
      // Check for duplicate user message in same branch with same content
      const duplicate = Object.values(messages).some(msg =>
        msg.role === 'user' &&
        msg.branch_name === branchName &&
        msg.content.trim() === pendingUserMessage.content.trim() &&
        new Date(msg.created_at).getTime() >= new Date(pendingUserMessage.created_at).getTime()
      );
      if (!duplicate) {
        let lastMsgId: string | null = null;
        let lastMsgDate = 0;
        Object.values(messages).forEach(msg => {
          if (msg.branch_name === branchName) {
            const msgDate = new Date(msg.created_at).getTime();
            if (!lastMsgId || msgDate > lastMsgDate) {
              lastMsgId = msg.id;
              lastMsgDate = msgDate;
            }
          }
        });
        const pendingDeltaY = lastMsgId ? computeSpacing(lastMsgId, pendingUserMessage.id) : spacingYBase;
        const pendingPos = lastMsgId ? {
          x: (positions[lastMsgId]?.x || 0),
          y: (positions[lastMsgId]?.y || 0) + pendingDeltaY,
        } : { x: 0, y: 0 };
        nodes.push({
          id: pendingUserMessage.id,
          type: 'default',
          position: pendingPos,
          data: {
            label: (
              <div className={`tree-node user pending`} style={{ opacity: pendingUserMessage.error ? 1 : 0.7 }}>
                <div className="tree-node-header"></div>
                <div className="tree-node-content">
                  {pendingUserMessage.content}
                  {pendingUserMessage.error && (
                    <div className="message-error" style={{ color: '#e53e3e', marginTop: 8, fontSize: '0.95em' }}>
                      <span>❌ {pendingUserMessage.error}</span>
                      {onRetrySendMessage && (
                        <button
                          onClick={e => { e.stopPropagation(); onRetrySendMessage(); }}
                          style={{ marginLeft: 12, background: '#e53e3e', color: 'white', border: 'none', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: '0.95em' }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ),
          },
          style: { background: 'transparent', border: 'none', padding: 0 },
        });
        if (lastMsgId) {
          edges.push({
            id: `${lastMsgId}-${pendingUserMessage.id}`,
            source: lastMsgId,
            target: pendingUserMessage.id,
            type: 'smoothstep',
            style: { stroke: '#a0aec0', strokeWidth: 2, strokeDasharray: '4 2' },
            animated: false,
          });
        }
      }
    }
    return { flowNodes: nodes, flowEdges: edges };
  }, [messages, rootMessages, selectedMessage, onMessageSelect, onSwitchToChatView, pathToRoot, pendingUserMessage, onRetrySendMessage, conversationTree]);

  // ReactFlow state
  const [, , onNodesChange] = useNodesState([]);
  const [, setEdges, onEdgesChange] = useEdgesState([]);
  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );
  const onPaneClick = useCallback(() => {
    if (onDeselectMessage) {
      onDeselectMessage();
    }
  }, [onDeselectMessage]);

  function getDefaultBranchName(type: 'branch' | 'regen', parentBranchName: string, branches: { name: string }[]) {
    const suffix = type === 'branch' ? 'branch' : 'regen';
    return generateUniqueBranchName(`${parentBranchName}-${suffix}`, branches);
  }

  // Regeneration helpers
  const canRegenerate = useCallback(() => {
    if (!contextMenuMessage || contextMenuMessage.role !== 'assistant') return false;
    const children = contextMenuMessage.children || [];
    return (children as any[]).length === 0;
  }, [contextMenuMessage]);

  const isResponseToFirstMessage = useCallback(() => {
    if (!contextMenuMessage) return false;
    // For now, allow both options
    return false;
  }, [contextMenuMessage]);

  // Handlers to open dialogs with sensible defaults (fast)
  const handleOpenBranchDialog = useCallback((messageId: string) => {
  const start = Date.now();
  lastActionTimeRef.current = start;
  console.debug('[TIMING] handleOpenBranchDialog start', { messageId, ts: start });
  const msg = messages[messageId] || null;
  const parentBranchName = msg?.branch_name || 'main';
  const defaultName = getDefaultBranchName('branch', parentBranchName, conversationTree?.branches || []);
  setBranchName(defaultName);
  setBranchColor(getRandomBranchColor());
  setBranchDialogSource(msg);
  setShowBranchDialog(true);
  console.debug('[TIMING] handleOpenBranchDialog end', { messageId, elapsed: Date.now() - start });
  }, [messages, conversationTree]);

  const handleOpenRegenBranchDialog = useCallback((messageId: string) => {
    const start = Date.now();
    lastActionTimeRef.current = start;
    console.debug('[TIMING] handleOpenRegenBranchDialog start', { messageId, ts: start });
    const msg = messages[messageId] || null;
    const parentBranchName = msg?.branch_name || 'main';
    const defaultName = getDefaultBranchName('regen', parentBranchName, conversationTree?.branches || []);
    setRegenBranchName(defaultName);
    setRegenDialogSource(msg);
    setShowRegenBranchDialog(true);
    console.debug('[TIMING] handleOpenRegenBranchDialog end', { messageId, elapsed: Date.now() - start });
  }, [messages, conversationTree]);

  React.useEffect(() => {
    if (showBranchDialog && lastActionTimeRef.current) {
      const now = Date.now();
      console.debug('[TIMING] branch dialog visible after (ms):', now - lastActionTimeRef.current);
    }
  }, [showBranchDialog]);

  React.useEffect(() => {
    if (showRegenBranchDialog && lastActionTimeRef.current) {
      const now = Date.now();
      console.debug('[TIMING] regen dialog visible after (ms):', now - lastActionTimeRef.current);
    }
  }, [showRegenBranchDialog]);

  // Lightweight portal modal to decouple from ReactFlow rendering
  const PortalModal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
    if (typeof document === 'undefined') return null;
    return ReactDOM.createPortal(
      (
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        </div>
      ),
      document.body
    );
  };

  // Regeneration dialog handlers
  const handleRegenInPlace = useCallback(() => {
    if (contextMenuMessage && onRegenerate) {
      onRegenerate(contextMenuMessage.id, 'place');
      setContextMenuMessage(null);
    }
  }, [contextMenuMessage, onRegenerate]);

  const handleRegenInBranch = useCallback(() => {
    if (contextMenuMessage && onRegenerate) {
        // When regen is triggered from the tree view, keep the user in the tree (do not switch to chat)
        onRegenerate(contextMenuMessage.id, 'branch', regenBranchName.trim(), false);
        setShowRegenBranchDialog(false);
        setRegenBranchName('');
        setContextMenuMessage(null);
      }
  }, [contextMenuMessage, onRegenerate, regenBranchName]);

  // Render
  return (
    <div className="tree-view">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 50 }}
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
      {contextMenuMessage && (
        <ContextMenu
          message={{
            ...contextMenuMessage,
            children: (contextMenuMessage.children || []) as Message[],
          }}
          contextMenuPos={contextMenuPos}
          onClose={handleCloseContextMenu}
          onBeginEdit={(messageId: string, originalContent: string) => onBeginEdit && onBeginEdit(messageId, originalContent, 'tree')}
          onSelectMessage={onMessageSelect}
          onBranch={onCreateBranch}
          onOpenBranchDialog={handleOpenBranchDialog}
          onOpenRegenBranchDialog={handleOpenRegenBranchDialog}
          onRegenerate={onRegenerate}
          onRequestDelete={onRequestDelete}
          conversationTree={conversationTree}
        />
      )}
      {/* Branch Creation Dialog */}
      {showBranchDialog && branchDialogSource && (
        <PortalModal onClose={() => { setShowBranchDialog(false); setBranchName(''); setBranchDialogSource(null); }}>
          <h3>Create New Branch</h3>
          <p>Branching from: "{branchDialogSource?.content.substring(0, 50)}..."</p>
          <input
            type="text"
            placeholder="Enter branch name"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleCreateBranch()}
            autoFocus
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
          <div className="color-selection" style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Branch Color:</label>
            <div className="color-options" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="color"
                value={branchColor}
                onChange={(e) => setBranchColor(e.target.value)}
                className="color-picker"
                style={{
                  width: '40px',
                  height: '40px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              />
              <div className="color-presets" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {BRANCH_COLORS.presets.map(color => (
                  <button
                    key={color}
                    className={`color-preset ${branchColor === color ? 'selected' : ''}`}
                    style={{
                      backgroundColor: color,
                      width: '32px',
                      height: '32px',
                      border: branchColor === color ? '3px solid #000' : '2px solid #ccc',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'border 0.2s'
                    }}
                    onClick={() => setBranchColor(color)}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '8px' }}>
              Current color: <span style={{ backgroundColor: branchColor, padding: '2px 8px', borderRadius: '4px', color: 'white' }}>{branchColor}</span>
            </p>
          </div>
          <div className="modal-buttons">
            <button
              onClick={() => {
                const src = branchDialogSource || contextMenuMessage;
                if (src) onCreateBranch && onCreateBranch(src.id, branchName.trim(), branchColor, false);
                setShowBranchDialog(false);
                setBranchName('');
                setBranchDialogSource(null);
              }}
              disabled={!branchName.trim()}
              style={{ marginRight: '8px' }}
            >
              Create Branch
            </button>
            <button onClick={() => {
              setShowBranchDialog(false);
              setBranchName('');
              setBranchDialogSource(null);
            }}>
              Cancel
            </button>
          </div>
        </PortalModal>
      )}
      {/* Regeneration Branch Dialog */}
      {showRegenBranchDialog && regenDialogSource && (
        <PortalModal onClose={() => { setShowRegenBranchDialog(false); setRegenBranchName(''); setRegenDialogSource(null); }}>
          <h3>Re-generate in New Branch</h3>
          <p>Re-generating: "{regenDialogSource?.content.substring(0, 50)}..."</p>
          <input
            type="text"
            placeholder="Enter branch name for regeneration"
            value={regenBranchName}
            onChange={(e) => setRegenBranchName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleRegenInBranch()}
            autoFocus
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
          />
          <div className="modal-buttons">
            <button
              onClick={() => {
                const src = regenDialogSource || contextMenuMessage;
                if (src && onRegenerate) onRegenerate(src.id, 'branch', regenBranchName.trim(), false);
                setShowRegenBranchDialog(false);
                setRegenBranchName('');
                setRegenDialogSource(null);
              }}
              disabled={!regenBranchName.trim()}
              style={{ marginRight: '8px' }}
            >
              Re-generate
            </button>
            <button onClick={() => {
              setShowRegenBranchDialog(false);
              setRegenBranchName('');
              setRegenDialogSource(null);
            }}>
              Cancel
            </button>
          </div>
        </PortalModal>
      )}
    </div>
  );
};

export default TreeView;

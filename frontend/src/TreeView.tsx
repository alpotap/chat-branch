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
import StarRating from './components/StarRating';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  is_summary?: boolean;
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
  onSummarizeMessage?: (messageId: string) => void;
  onSummarizeBranch?: (branchName: string) => void;
  onDuplicateBranch?: (branchName: string) => void;
  onDuplicateFullContext?: (messageId: string) => void;
  onRateBranch?: (branchName: string, rating: number) => void;
  selectedMessage?: string;
  conversationTree?: any;
  pendingUserMessage?: { id: string; content: string; created_at: string; error?: string; retryCount?: number } | null;
  onRetrySendMessage?: () => void;
}

const PortalModal: React.FC<{ onClose: () => void; children: React.ReactNode }> = ({ onClose, children }) => {
  if (typeof document === 'undefined') return null;
  return ReactDOM.createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

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
  ,onSummarizeMessage
  ,onSummarizeBranch
  ,onDuplicateBranch
  ,onDuplicateFullContext
  ,onRateBranch
}) => {
  const TRUNCATE_LENGTH = 140;
  const normalizeContent = (s?: string) => (s || '').replace(/\s+/g, ' ').trim();
  const truncate = (s?: string, len = TRUNCATE_LENGTH) => {
    const text = normalizeContent(s);
    if (text.length <= len) return text;
    return text.slice(0, len - 1) + '…';
  };
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contextMenuMessage, setContextMenuMessage] = useState<Message | null>(null);
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [showRegenBranchDialog, setShowRegenBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [regenBranchName, setRegenBranchName] = useState('');
  const [branchColor, setBranchColor] = useState('#3B82F6');
  const [branchDialogSource, setBranchDialogSource] = useState<Message | null>(null);
  const [regenDialogSource, setRegenDialogSource] = useState<Message | null>(null);
  const [expandedBranches, setExpandedBranches] = useState<string[]>([]);
  const lastActionTimeRef = React.useRef<number | null>(null);

  const handleRightClick = useCallback((e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 280;
    const menuHeight = 420;
    const viewportPadding = 8;
    setContextMenuPos({
      x: Math.max(viewportPadding, Math.min(e.clientX, window.innerWidth - menuWidth - viewportPadding)),
      y: Math.max(viewportPadding, Math.min(e.clientY, window.innerHeight - menuHeight - viewportPadding)),
    });
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

  const getBranchRating = useCallback((branchName: string): number => {
    const branch = conversationTree?.branches?.find((b: any) => b.name === branchName);
    return branch?.rating || 0;
  }, [conversationTree]);

  // Branch structure: ordered messages per branch and the parent branch each one grew out of
  const branchModel = useMemo(() => {
    const messagesByBranch: { [branch: string]: Message[] } = {};
    Object.values(messages).forEach(message => {
      (messagesByBranch[message.branch_name] ||= []).push(message);
    });
    Object.values(messagesByBranch).forEach(list =>
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    );

    const parentMap: { [childId: string]: string } = {};
    Object.values(messages).forEach(message => {
      ((message.children || []) as any[]).forEach(child => {
        const childId = typeof child === 'string' ? child : child.id;
        parentMap[childId] = message.id;
      });
    });

    const branchPoint: { [branch: string]: string | null } = {};
    const parentBranch: { [branch: string]: string | null } = {};
    Object.keys(messagesByBranch).forEach(branch => {
      const meta = conversationTree?.branches?.find((b: any) => b.name === branch);
      let pointId: string | null = meta?.created_from_message_id || null;
      if (!pointId) {
        const first = messagesByBranch[branch][0];
        pointId = first ? parentMap[first.id] || null : null;
      }
      branchPoint[branch] = pointId;
      const point = pointId ? messages[pointId] : undefined;
      parentBranch[branch] = point && point.branch_name !== branch ? point.branch_name : null;
    });

    const children: { [branch: string]: string[] } = {};
    const roots: string[] = [];
    Object.keys(messagesByBranch).forEach(branch => {
      const parent = parentBranch[branch];
      if (parent && messagesByBranch[parent]) (children[parent] ||= []).push(branch);
      else roots.push(branch);
    });
    Object.values(children).forEach(list => list.sort());
    roots.sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)));

    return { messagesByBranch, children, roots, branchPoint, parentBranch };
  }, [messages, conversationTree]);

  const isExpanded = useCallback((branch: string) => expandedBranches.includes(branch), [expandedBranches]);

  const toggleBranch = useCallback((branch: string) => {
    setExpandedBranches(prev => prev.includes(branch) ? prev.filter(b => b !== branch) : [...prev, branch]);
  }, []);

  // Robust, type-safe node/edge creation - one node per branch unless the branch is expanded
  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const spacingX = 320;
    const messageHeight = 120;
    const promptToAnswerGap = 20;
    const answerToPromptGap = 50;
    const branchGapY = 100;
    const { messagesByBranch, children, roots, branchPoint } = branchModel;

    const nodeIdForBranch = (branch: string) => `branch:${branch}`;
    const lastMessage = (branch: string) => {
      const list = messagesByBranch[branch] || [];
      return list[list.length - 1];
    };
    // Where an edge into a branch should attach when the parent branch is expanded
    const sourceNodeFor = (branch: string) => {
      const pointId = branchPoint[branch];
      const point = pointId ? messages[pointId] : undefined;
      if (!point) return null;
      return isExpanded(point.branch_name) ? point.id : nodeIdForBranch(point.branch_name);
    };
    const targetNodeFor = (branch: string) => {
      const list = messagesByBranch[branch] || [];
      return isExpanded(branch) && list.length ? list[0].id : nodeIdForBranch(branch);
    };

    const subtreeWidth = (branch: string): number => {
      const kids = children[branch] || [];
      if (!kids.length) return 1;
      return kids.reduce((sum, kid) => sum + subtreeWidth(kid), 0);
    };

    const positions: { [nodeId: string]: { x: number; y: number } } = {};
    const layoutBranch = (branch: string, colStart: number, y: number) => {
      const list = messagesByBranch[branch] || [];
      const width = subtreeWidth(branch);
      const centerCol = colStart + width / 2 - 0.5;
      const x = centerCol * spacingX;

      if (isExpanded(branch) && list.length) {
        let messageY = y;
        list.forEach((message, index) => {
          positions[message.id] = { x, y: messageY };
          if (index < list.length - 1) {
            const gap = message.role === 'user' ? promptToAnswerGap : answerToPromptGap;
            messageY += messageHeight + gap;
          }
        });
      } else {
        positions[nodeIdForBranch(branch)] = { x, y };
      }

      const lastMessageY = isExpanded(branch) && list.length
        ? positions[list[list.length - 1].id].y
        : y;
      const nextY = lastMessageY + messageHeight + branchGapY;
      let col = colStart;
      (children[branch] || []).forEach(kid => {
        layoutBranch(kid, col, nextY);
        col += subtreeWidth(kid);
      });
    };

    let rootCol = 0;
    roots.forEach(branch => {
      layoutBranch(branch, rootCol, 0);
      rootCol += subtreeWidth(branch);
    });

    const branchColorOf = (branch: string) => getBranchColorFromTree(branch, conversationTree);

    Object.keys(messagesByBranch).forEach(branch => {
      const list = messagesByBranch[branch];
      const expanded = isExpanded(branch);
      const color = branchColorOf(branch);

      if (!expanded) {
        const last = lastMessage(branch);
        const nodeId = nodeIdForBranch(branch);
        const isSelected = !!selectedMessage && list.some(m => m.id === selectedMessage);
        const collapsedCount = Math.max(0, list.length - 1);
        nodes.push({
          id: nodeId,
          type: 'default',
          position: positions[nodeId] || { x: 0, y: 0 },
          data: {
            label: (
              <div
                className={`tree-node branch-node ${last?.role || 'assistant'} ${isSelected ? 'selected' : ''} ${last?.is_summary ? 'summary' : ''}`}
                style={{ borderTop: `4px solid ${color}` }}
                onClick={() => last && onMessageSelect(last.id)}
                onDoubleClick={() => last && onSwitchToChatView(branch, last.id)}
                onContextMenu={e => last && handleRightClick(e, last)}
                title="Click to select the latest message. Double-click to open this branch in chat. Right-click for actions."
              >
                <div className="tree-node-branch-title" style={{ color }}>
                  🌿 {branch}
                </div>
                <div className="tree-node-rating" onClick={e => e.stopPropagation()}>
                  <StarRating
                    value={getBranchRating(branch)}
                    onChange={onRateBranch ? (rating) => onRateBranch(branch, rating) : undefined}
                    title={`Branch '${branch}' rating`}
                  />
                </div>
                <button
                  className="tree-expand-btn"
                  onClick={e => { e.stopPropagation(); toggleBranch(branch); }}
                  title={`Expand ${list.length} message(s) in this branch`}
                >
                  ＋ {collapsedCount > 0 ? `${collapsedCount} hidden` : 'expand'}
                </button>
                <div className="tree-node-content" title={normalizeContent(last?.content)}>
                  {truncate(last?.content)}
                </div>
                {last?.role === 'assistant' && last.llm_model && <div className="tree-node-model">{last.llm_model}</div>}
              </div>
            ),
          },
          style: { background: 'transparent', border: 'none', padding: 0 },
        });
      } else {
        list.forEach((message, index) => {
          const isSelected = selectedMessage === message.id;
          const isInPath = pathToRoot.has(message.id);
          let nodeClasses = `tree-node ${message.role}`;
          if (message.is_summary) nodeClasses += ' summary';
          if (isSelected) nodeClasses += ' selected';
          else if (isInPath) nodeClasses += ' in-path';

          nodes.push({
            id: message.id,
            type: 'default',
            position: positions[message.id] || { x: 0, y: 0 },
            data: {
              label: (
                <div
                  className={nodeClasses}
                  style={index === 0 ? { borderTop: `4px solid ${color}` } : undefined}
                  onClick={() => onMessageSelect(message.id)}
                  onDoubleClick={() => onSwitchToChatView(message.branch_name, message.id)}
                  onContextMenu={e => handleRightClick(e, message)}
                  title="Click to select. Double-click to switch to chat view. Right-click for actions."
                >
                  {index === 0 && (
                    <>
                      <div className="tree-node-branch-title" style={{ color }}>🌿 {branch}</div>
                      <div className="tree-node-rating" onClick={e => e.stopPropagation()}>
                        <StarRating
                          value={getBranchRating(branch)}
                          onChange={onRateBranch ? (rating) => onRateBranch(branch, rating) : undefined}
                          title={`Branch '${branch}' rating`}
                        />
                      </div>
                      <button
                        className="tree-expand-btn"
                        onClick={e => { e.stopPropagation(); toggleBranch(branch); }}
                        title="Collapse this branch"
                      >
                        － collapse
                      </button>
                    </>
                  )}
                  <div className="tree-node-content" title={normalizeContent(message.content)}>{truncate(message.content)}</div>
                  {message.role === 'assistant' && message.llm_model && <div className="tree-node-model">{message.llm_model}</div>}
                </div>
              ),
            },
            style: { background: 'transparent', border: 'none', padding: 0 },
          });

          if (index > 0) {
            edges.push({
              id: `${list[index - 1].id}-${message.id}`,
              source: list[index - 1].id,
              target: message.id,
              type: 'smoothstep',
              style: { stroke: color, strokeWidth: 2 },
            });
          }
        });
      }
    });

    // Branch-to-branch edges are always drawn, so the branch structure is never hidden
    Object.keys(messagesByBranch).forEach(branch => {
      const source = sourceNodeFor(branch);
      const target = targetNodeFor(branch);
      if (!source || source === target) return;
      edges.push({
        id: `branchlink-${source}-${target}`,
        source,
        target,
        type: 'smoothstep',
        style: { stroke: branchColorOf(branch), strokeWidth: 3 },
        animated: false,
      });
    });

    // Pending user message node (only if not already in messages and not duplicated by content)
    if (pendingUserMessage) {
      const branchName = conversationTree?.currentBranch || 'main';
      const branchList = branchModel.messagesByBranch[branchName] || [];
      const duplicate = branchList.some(msg =>
        msg.role === 'user' &&
        msg.content.trim() === pendingUserMessage.content.trim() &&
        new Date(msg.created_at).getTime() >= new Date(pendingUserMessage.created_at).getTime()
      );
      if (!duplicate) {
        const anchorId = isExpanded(branchName) && branchList.length
          ? branchList[branchList.length - 1].id
          : nodeIdForBranch(branchName);
        const anchorPos = positions[anchorId];
        const anchorMessage = anchorId === nodeIdForBranch(branchName)
          ? branchList[branchList.length - 1]
          : messages[anchorId];
        const pendingGap = anchorMessage?.role === 'user' ? promptToAnswerGap : answerToPromptGap;
        const pendingPos = anchorPos
          ? { x: anchorPos.x, y: anchorPos.y + messageHeight + pendingGap }
          : { x: 0, y: 0 };
        nodes.push({
          id: pendingUserMessage.id,
          type: 'default',
          position: pendingPos,
          data: {
            label: (
              <div className={`tree-node user pending`} style={{ opacity: pendingUserMessage.error ? 1 : 0.7 }}>
                <div className="tree-node-header"></div>
                <div className="tree-node-content" title={normalizeContent(pendingUserMessage.content)}>
                  {truncate(pendingUserMessage.content)}
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
        if (anchorPos) {
          edges.push({
            id: `${anchorId}-${pendingUserMessage.id}`,
            source: anchorId,
            target: pendingUserMessage.id,
            type: 'smoothstep',
            style: { stroke: '#a0aec0', strokeWidth: 2, strokeDasharray: '4 2' },
            animated: false,
          });
        }
      }
    }
    return { flowNodes: nodes, flowEdges: edges };
  }, [messages, branchModel, isExpanded, toggleBranch, selectedMessage, onMessageSelect, onSwitchToChatView, handleRightClick, pathToRoot, pendingUserMessage, onRetrySendMessage, conversationTree, getBranchRating, onRateBranch, normalizeContent, truncate]);

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
          onSummarize={onSummarizeMessage}
          onSummarizeBranch={onSummarizeBranch}
          onDuplicateBranch={onDuplicateBranch}
          onDuplicateFullContext={onDuplicateFullContext}
          onRateBranch={onRateBranch}
          branchRating={getBranchRating(contextMenuMessage.branch_name)}
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

import React, { useCallback, useMemo } from 'react';
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

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children?: Message[];
}

interface TreeViewProps {
  messages: { [key: string]: Message };
  rootMessages: string[];
  onMessageSelect: (messageId: string) => void;
  onSwitchToChatView: (branchName: string, messageId: string) => void;
  onCreateBranch: (messageId: string, branchName: string) => void;
  selectedMessage?: string;
}

const TreeView: React.FC<TreeViewProps> = ({ 
  messages, 
  rootMessages, 
  onMessageSelect, 
  onSwitchToChatView,
  onCreateBranch,
  selectedMessage 
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showContextMenu, setShowContextMenu] = React.useState(false);
  const [contextMenuPos, setContextMenuPos] = React.useState({ x: 0, y: 0 });
  const [contextMenuMessage, setContextMenuMessage] = React.useState<Message | null>(null);
  const [showBranchDialog, setShowBranchDialog] = React.useState(false);
  const [branchName, setBranchName] = React.useState('');

  const handleRightClick = (e: React.MouseEvent, message: Message) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuMessage(message);
    setShowContextMenu(true);
  };

  const handleCreateBranch = () => {
    if (branchName.trim() && contextMenuMessage) {
      onCreateBranch(contextMenuMessage.id, branchName.trim());
      setShowBranchDialog(false);
      setBranchName('');
      setShowContextMenu(false);
      setContextMenuMessage(null);
    }
  };

  const getBranchColor = (branchName: string) => {
    const colors = {
      'main': '#3B82F6',
      'alternative': '#10B981',
      'exploration': '#F59E0B',
      'comparison': '#EF4444',
    };
    
    let hash = 0;
    for (let i = 0; i < branchName.length; i++) {
      hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorKeys = Object.keys(colors);
    const colorKey = colorKeys[Math.abs(hash) % colorKeys.length];
    return colors[colorKey as keyof typeof colors] || '#6B7280';
  };

  const { flowNodes, flowEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const positions: { [key: string]: { x: number; y: number } } = {};
    
    // Calculate positions using a simple tree layout
    const calculatePositions = (messageId: string, x: number, y: number, visited: Set<string> = new Set()) => {
      if (visited.has(messageId)) return x;
      visited.add(messageId);
      
      const message = messages[messageId];
      if (!message) return x;
      
      positions[messageId] = { x, y };
      
      let currentX = x;
      const childSpacing = 300;
      const levelHeight = 150;
      
      const children = message.children || [];
      children.forEach((child, index) => {
        const childX = currentX;
        currentX = calculatePositions(child.id, childX, y + levelHeight, visited);
        if (index < children.length - 1) {
          currentX += childSpacing;
        }
      });
      
      // Center parent over children if it has multiple children
      if (children.length > 1) {
        const firstChildX = positions[children[0].id]?.x || x;
        const lastChildX = positions[children[children.length - 1].id]?.x || x;
        positions[messageId].x = (firstChildX + lastChildX) / 2;
      }
      
      return Math.max(currentX, x + 200);
    };

    // Start layout from root messages
    let globalX = 0;
    rootMessages.forEach((rootId, index) => {
      globalX = calculatePositions(rootId, globalX, 0);
      if (index < rootMessages.length - 1) {
        globalX += 400;
      }
    });

    // Create nodes and edges
    Object.values(messages).forEach(message => {
      const pos = positions[message.id] || { x: 0, y: 0 };
      
      nodes.push({
        id: message.id,
        type: 'default',
        position: pos,
        data: {
          label: (
            <div 
              className={`tree-node ${message.role} ${selectedMessage === message.id ? 'selected' : ''}`}
              onClick={() => onMessageSelect(message.id)}
              onDoubleClick={() => onSwitchToChatView(message.branch_name, message.id)}
              onContextMenu={(e) => message.role === 'assistant' ? handleRightClick(e, message) : undefined}
              title={message.role === 'assistant' ? "Double-click to open chat view for this branch. Right-click to create branch." : "Double-click to open chat view for this branch"}
            >
              <div className="tree-node-header">
                <span className="role-badge">{message.role}</span>
                <span 
                  className="branch-badge"
                  style={{ backgroundColor: getBranchColor(message.branch_name) }}
                >
                  {message.branch_name}
                </span>
              </div>
              <div className="tree-node-content">
                {message.content.length > 60 
                  ? message.content.substring(0, 60) + '...'
                  : message.content
                }
              </div>
              {message.llm_model && (
                <div className="tree-node-model">{message.llm_model}</div>
              )}
            </div>
          ),
        },
        style: {
          background: 'transparent',
          border: 'none',
          padding: 0,
        },
      });

      // Create edges to children
      const children = message.children || [];
      children.forEach(child => {
        edges.push({
          id: `${message.id}-${child.id}`,
          source: message.id,
          target: child.id,
          type: 'smoothstep',
          style: { 
            stroke: getBranchColor(child.branch_name),
            strokeWidth: 2 
          },
          animated: selectedMessage === child.id || selectedMessage === message.id,
        });
      });
    });

    return { flowNodes: nodes, flowEdges: edges };
  }, [messages, rootMessages, selectedMessage, onMessageSelect]);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="tree-view">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        fitViewOptions={{ padding: 50 }}
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div 
            className="context-menu-overlay" 
            onClick={() => setShowContextMenu(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1000
            }}
          />
          <div 
            className="context-menu"
            style={{ 
              position: 'fixed',
              left: contextMenuPos.x, 
              top: contextMenuPos.y,
              zIndex: 1001,
              background: 'white',
              border: '1px solid #ccc',
              borderRadius: '4px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              padding: '8px 0'
            }}
          >
            <button 
              onClick={() => {
                setShowContextMenu(false);
                setShowBranchDialog(true);
                setBranchName(`Branch-${Date.now()}`);
              }}
              style={{
                width: '100%',
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                textAlign: 'left',
                cursor: 'pointer'
              }}
            >
              🌿 Create Branch Here
            </button>
          </div>
        </>
      )}

      {/* Branch Creation Dialog */}
      {showBranchDialog && contextMenuMessage && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1002
        }}>
          <div className="modal" style={{
            background: 'white',
            padding: '24px',
            borderRadius: '8px',
            minWidth: '400px',
            maxWidth: '600px'
          }}>
            <h3>Create New Branch</h3>
            <p>Branching from: "{contextMenuMessage.content.substring(0, 50)}..."</p>
            <input
              type="text"
              placeholder="Enter branch name"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateBranch()}
              autoFocus
              style={{
                width: '100%',
                padding: '8px',
                marginBottom: '16px',
                border: '1px solid #ccc',
                borderRadius: '4px'
              }}
            />
            <div className="modal-buttons">
              <button 
                onClick={handleCreateBranch} 
                disabled={!branchName.trim()}
                style={{ marginRight: '8px' }}
              >
                Create Branch
              </button>
              <button onClick={() => {
                setShowBranchDialog(false);
                setBranchName('');
                setContextMenuMessage(null);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TreeView;

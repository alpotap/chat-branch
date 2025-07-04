import React, { useState, memo, useCallback } from 'react';
import { getBranchColor as getUtilBranchColor, getBranchColorFromTree, getRandomBranchColor, BRANCH_COLORS } from './utils/branchColors';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children: Message[];
}

interface MessageBubbleProps {
  message: Message;
  onBranch: (messageId: string, branchName: string, color?: string) => void;
  onSelectMessage: (messageId: string) => void;
  onBranchSwitch: (messageId: string) => void;
  isSelected: boolean;
  depth: number;
  conversationTree?: any; // Add conversation tree to access branch colors
}

const MessageBubble = memo<MessageBubbleProps>(({ 
  message, 
  onBranch, 
  onSelectMessage, 
  onBranchSwitch,
  isSelected,
  depth,
  conversationTree 
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchColor, setBranchColor] = useState('#3B82F6');

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Only allow branching from assistant messages
    if (message.role !== 'assistant') {
      return;
    }
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  }, [message.role]);

  const handleBranchClick = useCallback(() => {
    setShowContextMenu(false);
    setShowBranchDialog(true);
    setBranchName(`Branch-${Date.now()}`);
    setBranchColor(getRandomBranchColor()); // Set random color as default
  }, []);

  const handleCreateBranch = useCallback(() => {
    if (branchName.trim()) {
      onBranch(message.id, branchName.trim(), branchColor);
      setShowBranchDialog(false);
      setBranchName('');
      setBranchColor('#3B82F6');
    }
  }, [branchName, branchColor, message.id, onBranch]);

  const handleClick = useCallback(() => {
    onSelectMessage(message.id);
  }, [message.id, onSelectMessage]);

  const handleBranchTagClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the message click from firing
    onBranchSwitch(message.id);
  }, [message.id, onBranchSwitch]);

  const getBranchColor = (branchName: string) => {
    return getBranchColorFromTree(branchName, conversationTree);
  };

  return (
    <>
      <div 
        className={`message-bubble ${message.role} ${isSelected ? 'selected' : ''}`}
        style={{ 
          marginLeft: `${depth * 20}px`,
          borderLeft: `4px solid ${getBranchColor(message.branch_name)}`
        }}
        onContextMenu={handleRightClick}
        onClick={handleClick}
        title={message.role === 'assistant' ? 'Click to select message. Right-click to create branch from this AI response' : 'Click to select message'}
      >
        <div className="message-header">
          <span className="role">{message.role}</span>
          <span 
            className="branch-tag" 
            style={{ backgroundColor: getBranchColor(message.branch_name) }}
            onClick={handleBranchTagClick}
            title="Click to switch to this branch and select this message"
          >
            {message.branch_name}
          </span>
          {message.llm_model && <span className="model">{message.llm_model}</span>}
          <span className="time">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
        <div className="content">{message.content}</div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div 
            className="context-menu-overlay" 
            onClick={() => setShowContextMenu(false)}
          />
          <div 
            className="context-menu"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button onClick={handleBranchClick}>
              🌿 Create Branch Here
            </button>
            <button onClick={() => { onSelectMessage(message.id); setShowContextMenu(false); }}>
              📍 Navigate to Here
            </button>
          </div>
        </>
      )}

      {/* Branch Creation Dialog */}
      {showBranchDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Branch</h3>
            <p>Branching from: "{message.content.substring(0, 50)}..."</p>
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
            />
            <div className="color-selection">
              <label>Branch Color:</label>
              <div className="color-options">
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
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                />
                <div className="color-presets">
                  {BRANCH_COLORS.presets.map(color => (
                    <button
                      key={color}
                      className={`color-preset ${branchColor === color ? 'selected' : ''}`}
                      style={{ 
                        backgroundColor: color,
                        border: branchColor === color ? '3px solid #000' : '2px solid #ccc',
                        borderRadius: '8px',
                        width: '32px',
                        height: '32px',
                        cursor: 'pointer',
                        transition: 'border 0.2s'
                      }}
                      onClick={() => setBranchColor(color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                Current color: <span style={{ backgroundColor: branchColor, padding: '2px 8px', borderRadius: '4px', color: 'white' }}>{branchColor}</span>
              </p>
            </div>
            <div className="modal-buttons">
              <button onClick={handleCreateBranch} disabled={!branchName.trim()}>
                Create Branch
              </button>
              <button onClick={() => setShowBranchDialog(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;

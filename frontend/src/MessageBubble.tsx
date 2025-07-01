import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
  onBranch: (messageId: string, branchName: string) => void;
  onSelectMessage: (messageId: string) => void;
  isSelected: boolean;
  depth: number;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  onBranch, 
  onSelectMessage, 
  isSelected,
  depth 
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState('');

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleBranchClick = () => {
    setShowContextMenu(false);
    setShowBranchDialog(true);
    setBranchName(`Branch-${Date.now()}`);
  };

  const handleCreateBranch = () => {
    if (branchName.trim()) {
      onBranch(message.id, branchName.trim());
      setShowBranchDialog(false);
      setBranchName('');
    }
  };

  const handleClick = () => {
    onSelectMessage(message.id);
  };

  const getBranchColor = (branchName: string) => {
    const colors = {
      'main': '#3B82F6',
      'alternative': '#10B981',
      'exploration': '#F59E0B',
      'comparison': '#EF4444',
    };
    
    // Simple hash function for consistent colors
    let hash = 0;
    for (let i = 0; i < branchName.length; i++) {
      hash = branchName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorKeys = Object.keys(colors);
    const colorKey = colorKeys[Math.abs(hash) % colorKeys.length];
    return colors[colorKey as keyof typeof colors] || '#6B7280';
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
      >
        <div className="message-header">
          <span className="role">{message.role}</span>
          <span 
            className="branch-tag" 
            style={{ backgroundColor: getBranchColor(message.branch_name) }}
          >
            {message.branch_name}
          </span>
          {message.llm_model && <span className="model">{message.llm_model}</span>}
          <span className="time">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
        <div className="content">{message.content}</div>
        {message.children.length > 0 && (
          <div className="children-indicator">
            {message.children.length} response{message.children.length > 1 ? 's' : ''}
          </div>
        )}
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
            />
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
};

export default MessageBubble;

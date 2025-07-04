import React, { memo, useState } from 'react';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onLoadConversation: (id: string) => void;
  onCreateConversation: (title?: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
}

const ConversationSidebar = memo(({ 
  conversations, 
  currentConversation, 
  onLoadConversation, 
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation
}: ConversationSidebarProps) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  const handleCreateConversation = () => {
    if (newConversationTitle.trim()) {
      onCreateConversation(newConversationTitle.trim());
    } else {
      onCreateConversation();
    }
    setShowCreateDialog(false);
    setNewConversationTitle('');
  };

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameTitle(conv.title);
  };

  const handleRename = (convId: string) => {
    if (renameTitle.trim()) {
      onRenameConversation(convId, renameTitle.trim());
    }
    setRenamingId(null);
    setRenameTitle('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameTitle('');
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Conversations</h3>
          <button onClick={() => setShowCreateDialog(true)} className="new-conversation-btn">
            + New
          </button>
        </div>
        {conversations.map(conv => (
          <div 
            key={conv.id} 
            className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: '4px',
              margin: '2px 0'
            }}
          >
            {renamingId === conv.id ? (
              <div className="rename-input-container">
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRename(conv.id)}
                  onBlur={() => handleRename(conv.id)}
                  autoFocus
                  className="rename-input"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                />
                <button onClick={() => handleRename(conv.id)} className="rename-save-btn">✓</button>
                <button onClick={cancelRename} className="rename-cancel-btn">✕</button>
              </div>
            ) : (
              <>
                <div 
                  onClick={() => onLoadConversation(conv.id)} 
                  className="conversation-main-content"
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    padding: '8px 0',
                    overflow: 'hidden'
                  }}
                >
                  <span className="conversation-title">
                    {conv.title}
                  </span>
                </div>
                <div className="conversation-actions" style={{
                  display: 'flex',
                  gap: '4px',
                  marginLeft: '8px',
                  flexShrink: 0
                }}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(conv);
                    }}
                    className="rename-btn"
                    title="Rename conversation"
                    style={{
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: '2px'
                    }}
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Are you sure you want to delete "${conv.title}"? This cannot be undone.`)) {
                        onDeleteConversation(conv.id);
                      }
                    }}
                    className="delete-btn"
                    title="Delete conversation"
                    style={{
                      padding: '4px 6px',
                      fontSize: '12px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: '2px',
                      color: '#dc3545'
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Create Conversation Dialog */}
      {showCreateDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Create New Conversation</h3>
            <input
              type="text"
              placeholder="Enter conversation name (optional)"
              value={newConversationTitle}
              onChange={(e) => setNewConversationTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateConversation()}
              autoFocus
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            <div className="modal-buttons">
              <button onClick={handleCreateConversation}>
                Create
              </button>
              <button onClick={() => setShowCreateDialog(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ConversationSidebar.displayName = 'ConversationSidebar';

export default ConversationSidebar;

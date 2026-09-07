import React, { memo, useState, useEffect } from 'react';

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('chatbranch-sidebar-collapsed') === 'true');

  useEffect(() => {
    localStorage.setItem('chatbranch-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

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

  const handleDeleteClick = (conv: Conversation) => {
    setConversationToDelete(conv);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete.id);
    }
    setShowDeleteModal(false);
    setConversationToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setConversationToDelete(null);
  };

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!collapsed && <h3>Conversations</h3>}
          {!collapsed && (
            <button onClick={() => setShowCreateDialog(true)} className="new-conversation-btn">
              + New
            </button>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="sidebar-toggle-btn"
            title={collapsed ? 'Expand conversations' : 'Collapse conversations'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        {!collapsed && conversations.map(conv => (
          <div 
            key={conv.id} 
            className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
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
                    padding: '2px 0',
                    overflow: 'hidden'
                  }}
                >
                  <span className="conversation-title">
                    {conv.title}
                  </span>
                </div>
                <div className="conversation-actions" style={{
                  display: 'flex',
                  gap: '2px',
                  marginLeft: '4px',
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
                      padding: '1px 3px',
                      fontSize: '11px',
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
                      handleDeleteClick(conv);
                    }}
                    className="delete-btn"
                    title="Delete conversation"
                    style={{
                      padding: '1px 3px',
                      fontSize: '11px',
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

      {/* Delete Conversation Confirmation Dialog */}
      {showDeleteModal && conversationToDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Conversation</h3>
            <p>Are you sure you want to delete "<strong>{conversationToDelete.title}</strong>"?</p>
            <p style={{ color: '#dc3545', fontWeight: 'bold' }}>This action cannot be undone.</p>
            <div className="modal-buttons">
              <button 
                onClick={confirmDelete}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '8px'
                }}
              >
                Delete
              </button>
              <button 
                onClick={cancelDelete}
                style={{
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
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

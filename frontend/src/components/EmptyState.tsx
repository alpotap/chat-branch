import React, { memo, useState } from 'react';

interface EmptyStateProps {
  onCreateConversation: (title?: string) => void;
}

const EmptyState = memo(({ onCreateConversation }: EmptyStateProps) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');

  const handleClick = () => {
    console.log('🔧 EmptyState: Start a Conversation button clicked');
    setShowCreateDialog(true);
  };

  const handleCreateConversation = () => {
    if (newConversationTitle.trim()) {
      onCreateConversation(newConversationTitle.trim());
    } else {
      onCreateConversation();
    }
    setShowCreateDialog(false);
    setNewConversationTitle('');
  };

  return (
    <div className="empty-state">
      <h2>🌿 Welcome to ChatBranch</h2>
      <p>Create conversations that branch like a tree!</p>
      <ul>
        <li>💬 <strong>Chat normally</strong> in any branch</li>
        <li>🖱️ <strong>Right-click any message</strong> to create a new branch</li>
        <li>🌳 <strong>Switch to Tree view</strong> to see the full conversation structure</li>
        <li>📝 <strong>Switch between branches</strong> to explore different conversation paths</li>
      </ul>
      <button onClick={handleClick} className="cta-button">
        Start a Conversation
      </button>

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
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;

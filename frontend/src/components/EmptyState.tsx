import React, { memo } from 'react';

interface EmptyStateProps {
  onCreateConversation: () => void;
}

const EmptyState = memo(({ onCreateConversation }: EmptyStateProps) => {
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
      <button onClick={onCreateConversation} className="cta-button">
        Start Your First Conversation
      </button>
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

export default EmptyState;

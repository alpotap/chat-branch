import React, { memo, useState } from 'react';
import MessageBubble from '../MessageBubble';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children: Message[];
}

interface ChatViewProps {
  currentBranch: string;
  selectedMessage: string | null;
  paginatedMessages: Message[];
  currentBranchMessages: Message[];
  messagesPerPage: number;
  showAllMessages: boolean;
  onShowAllMessages: (show: boolean) => void;
  onBranch: (messageId: string, branchName: string, color?: string) => void;
  onSelectMessage: (messageId: string) => void;
  onBranchSwitch: (messageId: string) => void;
  onRenameBranch: (oldName: string, newName: string) => void;
  conversationTree: any;
}

const ChatView = memo(({
  currentBranch,
  selectedMessage,
  paginatedMessages,
  currentBranchMessages,
  messagesPerPage,
  showAllMessages,
  onShowAllMessages,
  onBranch,
  onSelectMessage,
  onBranchSwitch,
  onRenameBranch,
  conversationTree
}: ChatViewProps) => {
  const [isRenamingBranch, setIsRenamingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const startBranchRename = () => {
    setIsRenamingBranch(true);
    setNewBranchName(currentBranch);
  };

  const handleBranchRename = () => {
    if (newBranchName.trim() && newBranchName !== currentBranch) {
      onRenameBranch(currentBranch, newBranchName.trim());
    }
    setIsRenamingBranch(false);
    setNewBranchName('');
  };

  const cancelBranchRename = () => {
    setIsRenamingBranch(false);
    setNewBranchName('');
  };

  return (
    <div className="chat-container">
      <div className="branch-info">
        <div className="branch-name-container">
          {isRenamingBranch ? (
            <div className="branch-rename-container">
              <span>Current Branch: </span>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleBranchRename()}
                onBlur={handleBranchRename}
                autoFocus
                className="branch-rename-input"
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
              />
              <button onClick={handleBranchRename} className="rename-save-btn">✓</button>
              <button onClick={cancelBranchRename} className="rename-cancel-btn">✕</button>
            </div>
          ) : (
            <div className="branch-display">
              <span>Current Branch: <strong>{currentBranch}</strong></span>
              <button 
                onClick={startBranchRename}
                className="branch-rename-btn"
                title="Rename branch"
              >
                ✏️
              </button>
            </div>
          )}
        </div>
      </div>
      
      <div className="messages">
        {paginatedMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onBranch={onBranch}
            onSelectMessage={onSelectMessage}
            onBranchSwitch={onBranchSwitch}
            isSelected={selectedMessage === message.id}
            depth={0}
            conversationTree={conversationTree}
          />
        ))}
      </div>

      {/* Show more / less button */}
      {currentBranchMessages.length > messagesPerPage && (
        <div className="pagination-controls">
          <button onClick={() => onShowAllMessages(!showAllMessages)}>
            {showAllMessages ? 'Show Less' : 'Show All'}
          </button>
        </div>
      )}
    </div>
  );
});

ChatView.displayName = 'ChatView';

export default ChatView;

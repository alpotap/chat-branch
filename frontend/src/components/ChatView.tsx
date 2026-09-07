import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
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
  onBranch: (messageId: string, branchName: string, color?: string, switchToChat?: boolean) => void;
  onSelectMessage: (messageId: string) => void;
  onBranchSwitch: (messageId: string) => void;
  onRegenerate: (messageId: string, type: 'branch' | 'place', branchName?: string, switchToChat?: boolean) => void;
  onRenameBranch: (oldName: string, newName: string) => void;
  onBeginEdit: (messageId: string, originalContent: string) => void;
  onRequestDelete?: (message: Message) => void;
  onDeselectMessage?: () => void;
  conversationTree: any;
  pendingUserMessage?: { id: string; content: string; created_at: string; error?: string; retryCount?: number } | null;
  showAITyping?: boolean;
  onRetrySendMessage?: () => void;
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
  onRegenerate,
  onRenameBranch,
  onDeselectMessage,
  onRequestDelete,
  conversationTree,
  pendingUserMessage,
  showAITyping,
  onRetrySendMessage,
  onBeginEdit
}: ChatViewProps) => {
  const [isRenamingBranch, setIsRenamingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = messagesRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollButton(distanceFromBottom > 200);
  }, []);

  // Land on the latest message when the branch or message set changes (e.g. after a tree node click)
  useEffect(() => {
    scrollToBottom();
    handleScroll();
  }, [currentBranch, paginatedMessages.length, pendingUserMessage, showAITyping, scrollToBottom, handleScroll]);

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

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only deselect if clicking on the container itself, not on child elements
    if (e.target === e.currentTarget && onDeselectMessage) {
      onDeselectMessage();
    }
  };

  return (
    <div className="chat-container" onClick={handleContainerClick}>
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
      
      <div className="messages-wrapper">
      <div className="messages" ref={messagesRef} onScroll={handleScroll} onClick={handleContainerClick}>
        {/* Render all normal messages */}
        {paginatedMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onBranch={onBranch}
            onSelectMessage={onSelectMessage}
            onBranchSwitch={onBranchSwitch}
            onRegenerate={onRegenerate}
            onBeginEdit={onBeginEdit}
                      onRequestDelete={onRequestDelete}
            isSelected={selectedMessage === message.id}
            depth={0}
            conversationTree={conversationTree}
          />
        ))}
        {/* Optimistic user message (pending) */}
        {pendingUserMessage && (
          <MessageBubble
            key={pendingUserMessage.id}
            message={{
              id: pendingUserMessage.id,
              content: pendingUserMessage.content,
              role: 'user',
              branch_name: currentBranch,
              created_at: pendingUserMessage.created_at,
              children: [],
            }}
            onBranch={onBranch}
            onSelectMessage={onSelectMessage}
            onBranchSwitch={onBranchSwitch}
            onRegenerate={onRegenerate}
            onBeginEdit={() => {}} // No-op for pending messages
            isSelected={false}
            depth={0}
            conversationTree={conversationTree}
            error={pendingUserMessage.error}
            onRetrySendMessage={onRetrySendMessage}
          />
        )}
        {/* AI is typing indicator */}
        {showAITyping && (
          <div className="message-bubble assistant typing-indicator" style={{ marginLeft: 0, borderLeft: '4px solid #a0aec0', opacity: 0.7 }}>
            <div className="message-header">
              <span className="role">assistant</span>
              <span className="branch-tag" style={{ backgroundColor: '#a0aec0' }}>{currentBranch}</span>
              <span className="model">...</span>
              <span className="time">AI is typing...</span>
            </div>
            <div className="content"><em>AI is typing...</em></div>
          </div>
        )}
      </div>

      {showScrollButton && (
        <button
          className="scroll-to-bottom-btn"
          onClick={() => scrollToBottom('smooth')}
          title="Scroll to latest message"
        >
          ↓
        </button>
      )}
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

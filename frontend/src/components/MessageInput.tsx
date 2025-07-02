import React, { memo, useCallback, useRef, useEffect } from 'react';

interface MessageInputProps {
  newMessage: string;
  currentBranch: string;
  loading: boolean;
  onMessageChange: (message: string) => void;
  onSendMessage: () => void;
}

const MessageInput = memo(({
  newMessage,
  currentBranch,
  loading,
  onMessageChange,
  onSendMessage
}: MessageInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousLoading = useRef(loading);

  // Focus textarea after message is sent (when loading changes from true to false)
  useEffect(() => {
    if (previousLoading.current && !loading && textareaRef.current) {
      textareaRef.current.focus();
    }
    previousLoading.current = loading;
  }, [loading]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  }, [onSendMessage]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onMessageChange(e.target.value);
  }, [onMessageChange]);

  return (
    <div className="input-area">
      <textarea
        ref={textareaRef}
        value={newMessage}
        onChange={handleChange}
        onKeyPress={handleKeyPress}
        placeholder={`Type your message for branch "${currentBranch}"...`}
        disabled={loading}
      />
      <button 
        onClick={onSendMessage} 
        disabled={loading || !newMessage.trim()}
      >
        {loading ? 'Sending...' : 'Send'}
      </button>
    </div>
  );
});

MessageInput.displayName = 'MessageInput';

export default MessageInput;

import React from 'react';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children?: any[];
}

interface ContextMenuProps {
  message: Message;
  contextMenuPos: { x: number; y: number };
  onClose: () => void;
  onBeginEdit?: (messageId: string, originalContent: string) => void;
  onSelectMessage?: (messageId: string) => void;
  onBranch?: (messageId: string, branchName: string, color?: string) => void;
  // Optional callbacks to request the consumer open a branch/regen dialog
  onOpenBranchDialog?: (messageId: string) => void;
  onOpenRegenBranchDialog?: (messageId: string) => void;
  onRegenerate?: (messageId: string, type: 'branch' | 'place', branchName?: string) => void;
  conversationTree?: any;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  message,
  contextMenuPos,
  onClose,
  onBeginEdit,
  onSelectMessage,
  onBranch,
  onOpenBranchDialog,
  onOpenRegenBranchDialog,
  onRegenerate,
  conversationTree,
}) => {
  const canRegenerate = () => {
    if (!message || message.role !== 'assistant') return false;
    const children = message.children || [];
    return (children as any[]).length === 0;
  };

  const isResponseToFirstMessage = () => {
    if (message.role !== 'assistant' || !conversationTree?.messages || !conversationTree?.root_messages) {
      return false;
    }
    const allMessages = Object.values(conversationTree.messages) as Message[];
    const parentUserMessage = allMessages.find((msg: Message) => 
      msg.role === 'user' && 
      msg.children && 
      msg.children.some((child: Message) => child.id === message.id)
    );
    if (!parentUserMessage) {
      return false;
    }
    return conversationTree.root_messages.includes(parentUserMessage.id);
  };

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} />
      <div
        className="context-menu"
        style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
      >
        {message.role === 'user' && onBeginEdit && (
          <button onClick={() => { onBeginEdit(message.id, message.content); onClose(); }}>
            ✏️ Edit Message
          </button>
        )}
        {message.role === 'assistant' && (
          <button onClick={() => { if (onOpenBranchDialog) onOpenBranchDialog(message.id); else if (onBranch) onBranch(message.id, ''); onClose(); }}>
            🌿 Create Branch Here
          </button>
        )}
        {onSelectMessage && (
          <button onClick={() => { onSelectMessage(message.id); onClose(); }}>
            📍 Select Message
          </button>
        )}
        {message.role === 'assistant' && onRegenerate && (
          <>
            <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #ddd' }} />
            {canRegenerate() ? (
              <>
                {!isResponseToFirstMessage() && (
                  <button onClick={() => { if (onOpenRegenBranchDialog) onOpenRegenBranchDialog(message.id); else if (onRegenerate) onRegenerate(message.id, 'branch'); onClose(); }}>
                    🔄 Re-generate in New Branch
                  </button>
                )}
                <button
                  onClick={() => { onRegenerate(message.id, 'place'); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  title="Warning: This will replace the current response"
                >
                  ⚠️ Re-generate in Place
                  <span style={{ fontSize: '12px', color: '#666' }}>ⓘ</span>
                </button>
              </>
            ) : (
              <button
                disabled
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: 0.5,
                  cursor: 'not-allowed'
                }}
                title="Cannot regenerate: This message has follow-up responses or branches"
              >
                🚫 Cannot Regenerate
                <span style={{ fontSize: '12px', color: '#666' }}>ⓘ</span>
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default ContextMenu;

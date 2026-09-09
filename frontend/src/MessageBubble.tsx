import React, { useState, memo, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getBranchColor as getUtilBranchColor, getBranchColorFromTree, getRandomBranchColor, BRANCH_COLORS } from './utils/branchColors';
import { generateUniqueBranchName } from './utils/branchNaming';
import { markdownFromSelection } from './utils/selectionMarkdown';
import ContextMenu from './components/ContextMenu';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  is_summary?: boolean;
  children: Message[];
}

interface MessageBubbleProps {
  message: Message;
  onBranch: (messageId: string, branchName: string, color?: string, switchToChat?: boolean) => void;
  onSelectMessage: (messageId: string) => void;
  onBranchSwitch: (messageId: string) => void;
  onRegenerate: (messageId: string, type: 'branch' | 'place', branchName?: string, switchToChat?: boolean) => void;
  onBeginEdit: (messageId: string, originalContent: string) => void;
  onRequestDelete?: (message: Message) => void;
  onSummarize?: (messageId: string) => void;
  onAddToNote?: (message: Message) => void;
  onSaveSelectionToNote?: (selectedText: string, message: Message) => void;
  isSelected: boolean;
  depth: number;
  conversationTree?: any;
  error?: string;
  onRetrySendMessage?: () => void;
}

const MessageBubble = memo<MessageBubbleProps>(({ 
  message, 
  onBranch, 
  onSelectMessage, 
  onBranchSwitch,
  onRegenerate,
  onBeginEdit,
  onRequestDelete,
  onSummarize,
  onAddToNote,
  onSaveSelectionToNote,
  isSelected,
  depth,
  conversationTree,
  error,
  onRetrySendMessage
}) => {
  const [regenBranchName, setRegenBranchName] = useState('');
  const [branchColor, setBranchColor] = useState('#3B82F6');
  // Context menu state (for shared ContextMenu component)
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [contextMenuMessage, setContextMenuMessage] = useState<Message | null>(null);

  // Branch dialog state
  const [showBranchDialog, setShowBranchDialog] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [showRegenBranchDialog, setShowRegenBranchDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastSelectionRef = useRef('');

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  }, [message.content]);

  const handleCloseContextMenu = () => {
    setContextMenuMessage(null);
    setShowContextMenu(false);
  };

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Capture any active text selection so the context menu can offer "Save selection to note"
    const selection = window.getSelection();
    lastSelectionRef.current = selection && selection.rangeCount > 0
      ? markdownFromSelection(selection.getRangeAt(0))
      : '';
    // Only allow branching from assistant messages via context menu when appropriate
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuMessage(message);
    setShowContextMenu(true);
  }, [message]);

  const getDefaultBranchName = (type: 'branch' | 'regen', parentBranchName: string, branches: { name: string }[]) => {
    const suffix = type === 'branch' ? 'branch' : 'regen';
    return generateUniqueBranchName(`${parentBranchName}-${suffix}`, branches);
  };

  const handleBranchClick = useCallback(() => {
    setShowContextMenu(false);
    setShowBranchDialog(true);
    const parentBranchName = message.branch_name;
    setBranchName(getDefaultBranchName('branch', parentBranchName, conversationTree?.branches || []));
    setBranchColor(getRandomBranchColor());
  }, [message.branch_name, conversationTree]);

  const handleCreateBranch = useCallback(() => {
    if (branchName.trim()) {
      onBranch(message.id, branchName.trim(), branchColor);
      setShowBranchDialog(false);
      setBranchName('');
      setBranchColor('#3B82F6');
    }
  }, [branchName, branchColor, message.id, onBranch]);

  // Regeneration handlers
  const handleRegenInBranchClick = useCallback(() => {
    setShowContextMenu(false);
    const parentBranchName = message.branch_name;
    setRegenBranchName(getDefaultBranchName('regen', parentBranchName, conversationTree?.branches || []));
    setShowRegenBranchDialog(true);
  }, [message.branch_name, conversationTree]);

  const handleRegenInPlaceClick = useCallback(() => {
    setShowContextMenu(false);
    onRegenerate(message.id, 'place');
  }, [message.id, onRegenerate]);

  const handleCreateRegenBranch = useCallback(() => {
    if (regenBranchName.trim()) {
  onRegenerate(message.id, 'branch', regenBranchName.trim(), true);
      setShowRegenBranchDialog(false);
      setRegenBranchName('');
    }
  }, [regenBranchName, message.id, onRegenerate]);

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

  // Check if this AI message is responding to the very first user message
  const isResponseToFirstMessage = () => {
    if (message.role !== 'assistant' || !conversationTree?.messages || !conversationTree?.root_messages) {
      return false;
    }
    
    // Find the user message that this AI message is responding to
    // We need to search through all messages to find which user message has this AI message as a child
    const allMessages = Object.values(conversationTree.messages) as Message[];
    const parentUserMessage = allMessages.find((msg: Message) => 
      msg.role === 'user' && 
      msg.children && 
      msg.children.some((child: Message) => child.id === message.id)
    );
    
    if (!parentUserMessage) {
      return false;
    }
    
    // Check if the parent user message is a root message (first message in conversation)
    return conversationTree.root_messages.includes(parentUserMessage.id);
  };

  // Check if this message has any children (follow-up messages)
  const hasChildren = () => {
    return message.children && message.children.length > 0;
  };

  // Check if this message has any branches created from it
  const hasBranches = () => {
    if (!conversationTree?.branches) return false;
    return conversationTree.branches.some((branch: any) => 
      branch.created_from_message_id === message.id
    );
  };

  // Check if regeneration is allowed (no children and no branches)
  const canRegenerate = () => {
    return !hasChildren() && !hasBranches();
  };

  return (
    <>
      <div 
        className={`message-bubble ${message.role} ${isSelected ? 'selected' : ''} ${message.is_summary ? 'summary' : ''}`}
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
          {/* Inline delete button for chat view parity */}
          {onRequestDelete && message.role === 'user' && (
            <button
              onClick={(e) => { e.stopPropagation(); onRequestDelete(message); }}
              title="Delete message"
              style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#b22222', cursor: 'pointer' }}
            >
              🗑️
            </button>
          )}
          {message.role === 'assistant' && message.llm_model && <span className="model">{message.llm_model}</span>}
          <span className="time">
            {new Date(message.created_at).toLocaleTimeString()}
          </span>
        </div>
        <div className={`content ${message.role === 'assistant' ? 'markdown' : ''}`}>
          {message.role === 'assistant' ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          ) : (
            message.content
          )}
          {error && (            <div className="message-error" style={{ color: '#e53e3e', marginTop: 8, fontSize: '0.95em' }}>
              <span>❌ {error}</span>
              {onRetrySendMessage && (
                <button
                  onClick={e => { e.stopPropagation(); onRetrySendMessage(); }}
                  style={{
                    marginLeft: 12,
                    background: '#e53e3e',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    padding: '2px 10px',
                    cursor: 'pointer',
                    fontSize: '0.95em',
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
        <div className="message-actions">
          {message.role === 'assistant' && (
            <>
              <button className="msg-action-btn" onClick={(e) => { e.stopPropagation(); handleBranchClick(); }} title="Create a branch from this response">
                🌿 Branch
              </button>
              <button
                className="msg-action-btn"
                onClick={(e) => { e.stopPropagation(); handleRegenInBranchClick(); }}
                disabled={!canRegenerate()}
                title={canRegenerate() ? 'Re-generate in a new branch' : 'Cannot regenerate: this message has follow-ups or branches'}
              >
                🔄 Regen
              </button>
              <button
                className="msg-action-btn"
                onClick={(e) => { e.stopPropagation(); handleRegenInPlaceClick(); }}
                disabled={!canRegenerate()}
                title={canRegenerate() ? 'Replace this response in place' : 'Cannot regenerate: this message has follow-ups or branches'}
              >
                ⚠️ Regen here
              </button>
            </>
          )}
          <button
            className="msg-action-btn"
            onClick={(e) => { e.stopPropagation(); onBeginEdit(message.id, message.content); }}
            title={message.role === 'assistant' ? 'Edit this response - the edited text becomes the context for later messages' : 'Edit message'}
          >
            ✏️ Edit
          </button>
          {onSummarize && (
            <button className="msg-action-btn" onClick={(e) => { e.stopPropagation(); onSummarize(message.id); }} title="Summarize this message">
              🧠 Summarize
            </button>
          )}
          {onRequestDelete && message.role === 'user' && (
            <button className="msg-action-btn" onClick={(e) => { e.stopPropagation(); onRequestDelete(message); }} title="Delete message" style={{ color: '#b22222' }}>
              🗑️ Delete
            </button>
          )}
          {onAddToNote && (
            <button className="msg-action-btn" onClick={(e) => { e.stopPropagation(); onAddToNote(message); }} title="Save this message to a note">
              📝 Add to note
            </button>
          )}
          <button className="copy-btn" onClick={handleCopy} title="Copy message to clipboard">
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        </div>
      </div>

      {contextMenuMessage && (
        <ContextMenu
          message={contextMenuMessage}
          contextMenuPos={contextMenuPos}
          onClose={handleCloseContextMenu}
          onBeginEdit={onBeginEdit}
          onSelectMessage={onSelectMessage}
          onBranch={onBranch}
          onRegenerate={onRegenerate}
          onRequestDelete={onRequestDelete ? ((m: any) => onRequestDelete({ ...m, children: m.children || [] })) : undefined}
          onSummarize={onSummarize}
          onOpenBranchDialog={handleBranchClick}
          onOpenRegenBranchDialog={handleRegenInBranchClick}
          onSaveSelectionToNote={onSaveSelectionToNote ? (() => onSaveSelectionToNote(lastSelectionRef.current, contextMenuMessage)) : undefined}
          selectedText={lastSelectionRef.current}
          conversationTree={conversationTree}
        />
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

      {/* Regeneration Branch Creation Dialog */}
      {showRegenBranchDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Regenerate Response in New Branch</h3>
            <p>This will create a new branch and generate an alternative AI response.</p>
            <p>Regenerating from: "{message.content.substring(0, 50)}..."</p>
            <input
              type="text"
              placeholder="Enter branch name"
              value={regenBranchName}
              onChange={(e) => setRegenBranchName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateRegenBranch()}
              autoFocus
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
            />
            <div className="modal-buttons">
              <button onClick={handleCreateRegenBranch} disabled={!regenBranchName.trim()}>
                Create & Regenerate
              </button>
              <button onClick={() => setShowRegenBranchDialog(false)}>
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

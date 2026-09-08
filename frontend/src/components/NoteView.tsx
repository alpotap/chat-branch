import React, { useState, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note, NoteItem } from '../hooks/useNotes';
import ExpandedEditorModal from './ExpandedEditorModal';

interface NoteViewProps {
  note: Note;
  onRenameNote: (noteId: string, newTitle: string) => void;
  onRecolorNote: (noteId: string, color: string) => void;
  onDeleteNote: (noteId: string) => void;
  onAddManualItem: (noteId: string, content: string) => Promise<any>;
  onUpdateItem: (noteId: string, itemId: string, content: string) => Promise<any>;
  onDeleteItem: (noteId: string, itemId: string) => Promise<any>;
  onReorderItems: (noteId: string, orderedItemIds: string[]) => Promise<any>;
  onNavigateToConversation: (conversationId: string, branchName?: string | null, messageId?: string | null) => void;
}

const DEFAULT_NOTE_COLOR = '#667eea';

const NoteView: React.FC<NoteViewProps> = ({
  note,
  onRenameNote,
  onRecolorNote,
  onDeleteNote,
  onAddManualItem,
  onUpdateItem,
  onDeleteItem,
  onReorderItems,
  onNavigateToConversation
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameTitle, setRenameTitle] = useState(note.title);
  const [editingItem, setEditingItem] = useState<NoteItem | null>(null);
  const [isAddingText, setIsAddingText] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<NoteItem | null>(null);
  const [showDeleteNoteModal, setShowDeleteNoteModal] = useState(false);

  // Drag & drop state for cards
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleStartRename = () => {
    setIsRenaming(true);
    setRenameTitle(note.title);
  };

  const handleCommitRename = () => {
    if (renameTitle.trim() && renameTitle !== note.title) {
      onRenameNote(note.id, renameTitle.trim());
    }
    setIsRenaming(false);
  };

  const handleCopyCard = async (item: NoteItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy card content:', err);
    }
  };

  const handleSaveEditedItem = async (content: string) => {
    if (editingItem) {
      await onUpdateItem(note.id, editingItem.id, content);
      setEditingItem(null);
    }
  };

  const handleSaveNewItem = async (content: string) => {
    if (content.trim()) {
      await onAddManualItem(note.id, content.trim());
      setIsAddingText(false);
    }
  };

  // Drag & Drop reordering of text cards
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedItemId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== id) {
      setDropTargetId(id);
    }
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDropTargetId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedItemId;
    setDraggedItemId(null);
    setDropTargetId(null);

    if (!sourceId || sourceId === targetId) return;

    const items = [...(note.items || [])];
    const sourceIndex = items.findIndex(i => i.id === sourceId);
    const targetIndex = items.findIndex(i => i.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) return;

    // Move source to target index
    const [removed] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, removed);

    const orderedIds = items.map(i => i.id);
    await onReorderItems(note.id, orderedIds);
  };

  const sortedItems = [...(note.items || [])].sort((a, b) => a.position - b.position);

  return (
    <div className="note-view-container">
      {/* Note Header */}
      <div className="note-view-header" style={{ borderLeft: `6px solid ${note.color || DEFAULT_NOTE_COLOR}` }}>
        <div className="note-title-section">
          {isRenaming ? (
            <div className="rename-input-container">
              <input
                type="text"
                value={renameTitle}
                onChange={e => setRenameTitle(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleCommitRename()}
                onBlur={handleCommitRename}
                autoFocus
                className="rename-input note-title-input"
              />
              <button onClick={handleCommitRename} className="rename-save-btn">✓</button>
              <button onClick={() => setIsRenaming(false)} className="rename-cancel-btn">✕</button>
            </div>
          ) : (
            <div className="note-title-display">
              <h2 onDoubleClick={handleStartRename} title="Double-click to rename">
                📝 {note.title}
              </h2>
              <button onClick={handleStartRename} className="rename-btn" title="Rename note">
                ✏️
              </button>
            </div>
          )}
        </div>

        <div className="note-header-actions">
          <input
            type="color"
            className="item-color-picker"
            value={note.color || DEFAULT_NOTE_COLOR}
            onChange={e => onRecolorNote(note.id, e.target.value)}
            title="Note color"
          />
          <button
            onClick={() => setIsAddingText(true)}
            className="add-text-btn"
            title="Add new text card to this note"
          >
            ➕ Add Text
          </button>
          <button
            onClick={() => setShowDeleteNoteModal(true)}
            className="delete-note-btn"
            title="Delete this note"
          >
            🗑️ Delete Note
          </button>
        </div>
      </div>

      {/* Cards Stack */}
      <div className="note-cards-container">
        {sortedItems.length === 0 ? (
          <div className="note-empty-state">
            <p>This note is empty.</p>
            <p style={{ fontSize: '0.85rem', color: '#777' }}>
              Click <strong>➕ Add Text</strong> above to add notes manually, or save prompts and responses from conversations.
            </p>
          </div>
        ) : (
          sortedItems.map(item => (
            <div
              key={item.id}
              className={`note-card ${dropTargetId === item.id ? 'drop-target' : ''} ${draggedItemId === item.id ? 'dragging' : ''}`}
              draggable
              onDragStart={e => handleDragStart(e, item.id)}
              onDragOver={e => handleDragOver(e, item.id)}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={e => handleDrop(e, item.id)}
              onDragEnd={handleDragEnd}
            >
              <div className="note-card-header">
                <div className="note-card-drag-handle" title="Drag to reorder text cards">
                  ⋮⋮
                </div>

                <div className="note-card-source">
                  {item.source_type === 'manual' || !item.source_conversation_id ? (
                    <span className="source-badge manual" title="Manually typed text">
                      ✏️ Manual insert
                    </span>
                  ) : (
                    <button
                      className="source-link"
                      onClick={() => onNavigateToConversation(item.source_conversation_id!, item.source_branch_name, item.source_message_id)}
                      title="Jump to conversation where this text originated"
                    >
                      💬 From: <strong>{item.source_conversation_title || 'Conversation'}</strong> › {item.source_branch_name} ({item.source_message_role || 'message'})
                    </button>
                  )}
                  <span className="note-card-time">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="note-card-actions">
                  <button
                    className="msg-action-btn"
                    onClick={() => setEditingItem(item)}
                    title="Edit this text in full-screen expanded editor"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="copy-btn"
                    onClick={() => handleCopyCard(item)}
                    title="Copy markdown to clipboard"
                  >
                    {copiedId === item.id ? '✓ Copied' : '⧉ Copy'}
                  </button>
                  <button
                    className="msg-action-btn delete"
                    onClick={() => setItemToDelete(item)}
                    title="Delete this text card"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Resolved Markdown Content */}
              <div className="note-card-content markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {item.content}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Expanded Editor for Adding Manual Text */}
      {isAddingText && (
        <ExpandedEditorModal
          isOpen={isAddingText}
          title="Add Text to Note"
          initialContent=""
          placeholder="Type or paste markdown content here..."
          saveButtonLabel="💾 Add Text"
          onSave={handleSaveNewItem}
          onCancel={() => setIsAddingText(false)}
        />
      )}

      {/* Expanded Editor for Editing Existing Text Card */}
      {editingItem && (
        <ExpandedEditorModal
          isOpen={!!editingItem}
          title="Edit Text"
          initialContent={editingItem.content}
          saveButtonLabel="💾 Save Changes"
          onSave={handleSaveEditedItem}
          onCancel={() => setEditingItem(null)}
        />
      )}

      {/* Delete Card Confirmation Modal */}
      {itemToDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Text Card</h3>
            <p>Are you sure you want to delete this text card from the note?</p>
            <div className="modal-buttons">
              <button
                className="confirm-btn"
                onClick={async () => {
                  if (itemToDelete) {
                    await onDeleteItem(note.id, itemToDelete.id);
                    setItemToDelete(null);
                  }
                }}
              >
                Delete
              </button>
              <button className="cancel-btn" onClick={() => setItemToDelete(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation Modal */}
      {showDeleteNoteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Note</h3>
            <p>Are you sure you want to delete <strong>"{note.title}"</strong> and all of its saved text cards? This cannot be undone.</p>
            <div className="modal-buttons">
              <button
                className="confirm-btn"
                onClick={() => {
                  setShowDeleteNoteModal(false);
                  onDeleteNote(note.id);
                }}
              >
                Delete Note
              </button>
              <button className="cancel-btn" onClick={() => setShowDeleteNoteModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteView;

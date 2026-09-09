import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TextEditorModal from './TextEditorModal';
import { NoteWithTexts, NoteText } from '../hooks/useNotes';

interface NotesPanelProps {
  note: NoteWithTexts | null;
  folderName?: string | null;
  onAddText: (content: string) => void;
  onEditText: (textId: string, content: string) => void;
  onDeleteText: (textId: string) => void;
  onReorderTexts: (items: { id: string; position: number }[]) => void;
  onNavigateToSource: (conversationId: string, messageId: string, branchName?: string | null) => void;
  onRestoreNote?: (noteId: string) => void;
}

// Reuses the same drag-and-drop pattern as ConversationSidebar for persisted reordering.
const NotesPanel: React.FC<NotesPanelProps> = ({
  note,
  folderName,
  onAddText,
  onEditText,
  onDeleteText,
  onReorderTexts,
  onNavigateToSource,
  onRestoreNote
}) => {
  const [editorState, setEditorState] = useState<null | { textId?: string; initialContent: string }>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  if (!note) {
    return (
      <div className="notes-panel notes-panel-empty">
        <p>Select or create a note from the sidebar to get started.</p>
      </div>
    );
  }

  const sortedTexts = [...note.texts].sort((a, b) => a.position - b.position);

  const handleDrop = (targetId: string) => {
    setDropTargetId(null);
    if (!dragId || dragId === targetId) return;
    const reordered = [...sortedTexts];
    const draggedIndex = reordered.findIndex(t => t.id === dragId);
    const targetIndex = reordered.findIndex(t => t.id === targetId);
    if (draggedIndex === -1 || targetIndex === -1) return;
    const [draggedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedItem);
    onReorderTexts(reordered.map((t, index) => ({ id: t.id, position: index })));
    setDragId(null);
  };

  const renderSource = (text: NoteText) => {
    if (text.source_type === 'conversation' && text.source_conversation_id && text.source_message_id) {
      return (
        <button
          className="note-text-source note-text-source-link"
          onClick={() => onNavigateToSource(text.source_conversation_id!, text.source_message_id!, text.source_branch_name)}
          title="Go to the conversation this was saved from"
        >
          🔗 {text.source_label || 'View source conversation'}
        </button>
      );
    }
    return <span className="note-text-source">Manual insert</span>;
  };

  return (
    <div className="notes-panel">
      <div className="notes-panel-header">
        <div className="notes-panel-breadcrumb">
          {folderName && <span className="notes-panel-folder">📁 {folderName} /</span>}
          <span className="notes-panel-title">{note.title}</span>
          {note.is_archived && <span className="archive-badge">Archived</span>}
        </div>
        <div className="notes-panel-header-actions">
          {note.is_archived && onRestoreNote && (
            <button className="new-conversation-btn" onClick={() => onRestoreNote(note.id)}>↩️ Restore</button>
          )}
          <button className="new-conversation-btn" onClick={() => setEditorState({ initialContent: '' })}>
            + Add text
          </button>
        </div>
      </div>

      <div className="notes-panel-body">
        {sortedTexts.length === 0 && (
          <p className="notes-panel-empty-hint">No saved texts yet. Use "+ Add text", or the "Add to note" button on any chat message.</p>
        )}
        {sortedTexts.map(text => (
          <div
            key={text.id}
            className={`note-text-card ${dropTargetId === text.id ? 'drop-target' : ''}`}
            draggable
            onDragStart={() => setDragId(text.id)}
            onDragEnd={() => { setDragId(null); setDropTargetId(null); }}
            onDragOver={(e) => { e.preventDefault(); setDropTargetId(text.id); }}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={() => handleDrop(text.id)}
          >
            <div className="note-text-header">
              {renderSource(text)}
              <div className="conversation-actions">
                <button
                  className="msg-action-btn"
                  onClick={() => setEditorState({ textId: text.id, initialContent: text.content })}
                >
                  ✏️ Edit
                </button>
                <button
                  className="msg-action-btn"
                  onClick={() => onDeleteText(text.id)}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
            <div className="note-text-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>

      {editorState && (
        <TextEditorModal
          title={editorState.textId ? 'Edit Note Text' : 'Add Note Text'}
          initialContent={editorState.initialContent}
          onCancel={() => setEditorState(null)}
          actions={[{
            label: '💾 Save',
            onClick: (content: string) => {
              if (editorState.textId) {
                onEditText(editorState.textId, content);
              } else {
                onAddText(content);
              }
              setEditorState(null);
            }
          }]}
        />
      )}
    </div>
  );
};

export default NotesPanel;

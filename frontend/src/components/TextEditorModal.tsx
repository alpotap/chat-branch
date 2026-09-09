import React, { useRef, useState } from 'react';
import { markdownFromTextareaSelection } from '../utils/selectionMarkdown';

export interface TextEditorAction {
  label: string;
  onClick: (content: string) => void;
  disabled?: boolean;
  title?: string;
}

interface TextEditorModalProps {
  title: string;
  initialContent: string;
  actions: TextEditorAction[];
  onCancel: () => void;
  modalRef?: React.RefObject<HTMLDivElement>;
  onSaveSelectionToNote?: (content: string) => void;
}

// Shared editor used both for editing chat messages and adding/editing note texts -
// only the destination (`actions`) differs between callers.
const TextEditorModal: React.FC<TextEditorModalProps> = ({ title, initialContent, actions, onCancel, modalRef, onSaveSelectionToNote }) => {
  const [content, setContent] = useState(initialContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSaveSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea || !onSaveSelectionToNote) return;
    const selectedContent = markdownFromTextareaSelection(
      content,
      textarea.selectionStart,
      textarea.selectionEnd
    );
    if (selectedContent) onSaveSelectionToNote(selectedContent);
  };

  return (
    <div className="modal-overlay">
      <div className="modal edit-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="text-editor-title">
        <h3 id="text-editor-title">{title}</h3>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="edit-textarea"
          autoFocus
        />
        <div className="modal-buttons-vertical">
          {onSaveSelectionToNote && (
            <button
              onClick={handleSaveSelection}
              disabled={!content}
              title="Save the selected Markdown text to a note"
            >
              📝 Save selected text to note
            </button>
          )}
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={() => action.onClick(content)}
              disabled={action.disabled}
              title={action.title}
            >
              {action.label}
            </button>
          ))}
          <button className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default TextEditorModal;

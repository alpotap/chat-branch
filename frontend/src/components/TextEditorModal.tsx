import React, { useState } from 'react';

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
}

// Shared editor used both for editing chat messages and adding/editing note texts -
// only the destination (`actions`) differs between callers.
const TextEditorModal: React.FC<TextEditorModalProps> = ({ title, initialContent, actions, onCancel, modalRef }) => {
  const [content, setContent] = useState(initialContent);

  return (
    <div className="modal-overlay">
      <div className="modal edit-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="text-editor-title">
        <h3 id="text-editor-title">{title}</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="edit-textarea"
          autoFocus
        />
        <div className="modal-buttons-vertical">
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

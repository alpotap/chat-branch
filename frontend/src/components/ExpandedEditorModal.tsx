import React, { useState, useEffect, useRef } from 'react';

interface ExpandedEditorModalProps {
  isOpen: boolean;
  title: string;
  initialContent: string;
  placeholder?: string;
  saveButtonLabel?: string;
  saveButtonTitle?: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  children?: React.ReactNode; // Optional extra action buttons (e.g. for chat branch saving)
}

const ExpandedEditorModal: React.FC<ExpandedEditorModalProps> = ({
  isOpen,
  title,
  initialContent,
  placeholder = 'Type your markdown text here...',
  saveButtonLabel = '💾 Save Text',
  saveButtonTitle,
  onSave,
  onCancel,
  children
}) => {
  const [content, setContent] = useState(initialContent);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSave(content);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, content, onSave, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div
        className="modal edit-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="expanded-editor-title"
      >
        <h3 id="expanded-editor-title">{title}</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="edit-textarea"
          autoFocus
          placeholder={placeholder}
        />
        <div className="modal-buttons-vertical">
          {children ? (
            children
          ) : (
            <button
              onClick={() => onSave(content)}
              title={saveButtonTitle || 'Save changes (Ctrl+Enter)'}
              style={{
                backgroundColor: '#667eea',
                color: 'white',
                fontWeight: 600
              }}
            >
              {saveButtonLabel}
            </button>
          )}
          <button className="cancel-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpandedEditorModal;

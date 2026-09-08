import React, { useState, useEffect } from 'react';
import { Note, NoteFolder } from '../hooks/useNotes';

interface SaveSource {
  conversationId: string;
  conversationTitle: string;
  branchName: string;
  messageId: string;
  messageRole: string;
}

interface SaveToNoteModalProps {
  isOpen: boolean;
  content: string;
  source: SaveSource | null;
  folders: NoteFolder[];
  notes: Note[];
  onSave: (noteId: string, itemData: {
    content: string;
    source_type: 'conversation';
    source_conversation_id: string;
    source_conversation_title: string;
    source_branch_name: string;
    source_message_id: string;
    source_message_role: string;
  }) => Promise<any>;
  onCreateFolder: (name: string) => Promise<NoteFolder | null>;
  onCreateNote: (title: string, folderId: string | null) => Promise<Note | null>;
  onClose: () => void;
}

const LAST_FOLDER_KEY = 'chatbranch-last-saved-note-folder-id';
const LAST_NOTE_KEY = 'chatbranch-last-saved-note-id';

const SaveToNoteModal: React.FC<SaveToNoteModalProps> = ({
  isOpen,
  content,
  source,
  folders,
  notes,
  onSave,
  onCreateFolder,
  onCreateNote,
  onClose
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [selectedNoteId, setSelectedNoteId] = useState<string>('');
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');
  const [isCreatingNote, setIsCreatingNote] = useState<boolean>(false);
  const [newNoteTitle, setNewNoteTitle] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize selection from localStorage or available notes/folders
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setIsCreatingFolder(false);
    setIsCreatingNote(false);
    setNewFolderName('');
    setNewNoteTitle('');

    const lastFolder = localStorage.getItem(LAST_FOLDER_KEY) || '';
    const lastNote = localStorage.getItem(LAST_NOTE_KEY) || '';

    // Check if last note exists
    const matchingNote = notes.find(n => n.id === lastNote);
    if (matchingNote) {
      setSelectedNoteId(matchingNote.id);
      setSelectedFolderId(matchingNote.folder_id || '');
    } else {
      // Check if last folder exists
      const folderExists = folders.some(f => f.id === lastFolder);
      const folderId = folderExists ? lastFolder : '';
      setSelectedFolderId(folderId);

      // Find first note in that folder, or first note overall
      const notesInFolder = notes.filter(n => (n.folder_id || '') === folderId);
      if (notesInFolder.length > 0) {
        setSelectedNoteId(notesInFolder[0].id);
      } else if (notes.length > 0) {
        setSelectedNoteId(notes[0].id);
        setSelectedFolderId(notes[0].folder_id || '');
      } else {
        // No notes exist yet; prompt to create one
        setIsCreatingNote(true);
        setNewNoteTitle('My First Note');
      }
    }
  }, [isOpen, folders, notes]);

  // When folder selection changes, adjust note selection
  const handleFolderChange = (folderId: string) => {
    if (folderId === '__new__') {
      setIsCreatingFolder(true);
      return;
    }
    setIsCreatingFolder(false);
    setSelectedFolderId(folderId);

    // Filter notes for this folder
    const notesInFolder = notes.filter(n => (n.folder_id || '') === folderId);
    if (notesInFolder.length > 0) {
      setIsCreatingNote(false);
      setSelectedNoteId(notesInFolder[0].id);
    } else {
      setIsCreatingNote(true);
      setNewNoteTitle('');
      setSelectedNoteId('');
    }
  };

  const handleNoteChange = (noteId: string) => {
    if (noteId === '__new__') {
      setIsCreatingNote(true);
      setNewNoteTitle('');
      return;
    }
    setIsCreatingNote(false);
    setSelectedNoteId(noteId);
  };

  const notesInSelectedFolder = notes.filter(n => (n.folder_id || '') === selectedFolderId);

  const handleSave = async () => {
    if (!source) return;
    setSaving(true);
    setError(null);

    try {
      let targetFolderId: string | null = selectedFolderId || null;

      // If user typed a new folder
      if (isCreatingFolder) {
        if (!newFolderName.trim()) {
          setError('Please enter a name for the new folder.');
          setSaving(false);
          return;
        }
        const createdFolder = await onCreateFolder(newFolderName.trim());
        if (!createdFolder) {
          setError('Failed to create folder.');
          setSaving(false);
          return;
        }
        targetFolderId = createdFolder.id;
        localStorage.setItem(LAST_FOLDER_KEY, targetFolderId);
      } else {
        localStorage.setItem(LAST_FOLDER_KEY, targetFolderId || '');
      }

      let targetNoteId = selectedNoteId;

      // If user typed a new note or no notes exist
      if (isCreatingNote || !targetNoteId) {
        const titleToUse = newNoteTitle.trim() || `Note from ${source.conversationTitle || 'Chat'}`;
        const createdNote = await onCreateNote(titleToUse, targetFolderId);
        if (!createdNote) {
          setError('Failed to create note.');
          setSaving(false);
          return;
        }
        targetNoteId = createdNote.id;
      }

      localStorage.setItem(LAST_NOTE_KEY, targetNoteId);

      const result = await onSave(targetNoteId, {
        content,
        source_type: 'conversation',
        source_conversation_id: source.conversationId,
        source_conversation_title: source.conversationTitle,
        source_branch_name: source.branchName,
        source_message_id: source.messageId,
        source_message_role: source.messageRole
      });

      if (result) {
        onClose();
      } else {
        setError('Failed to append text to the selected note.');
      }
    } catch (err: any) {
      console.error('Error in save to note:', err);
      setError(err.message || 'Error saving to note.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal save-to-note-modal" onClick={e => e.stopPropagation()}>
        <h3>📌 Save to Note</h3>

        {error && <div className="save-note-error" style={{ color: '#e53e3e', marginBottom: 10 }}>⚠️ {error}</div>}

        <div className="save-note-field">
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>
            1. Folder:
          </label>
          {!isCreatingFolder ? (
            <select
              value={selectedFolderId}
              onChange={e => handleFolderChange(e.target.value)}
              className="save-note-select"
            >
              <option value="">📁 (Root / No Folder)</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>
                  📁 {f.name}
                </option>
              ))}
              <option value="__new__">➕ + Create New Folder...</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Enter folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                autoFocus
                className="save-note-input"
              />
              <button
                type="button"
                className="small-btn"
                onClick={() => { setIsCreatingFolder(false); setSelectedFolderId(''); }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="save-note-field" style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>
            2. Note:
          </label>
          {!isCreatingNote ? (
            <select
              value={selectedNoteId}
              onChange={e => handleNoteChange(e.target.value)}
              className="save-note-select"
            >
              {notesInSelectedFolder.map(n => (
                <option key={n.id} value={n.id}>
                  📝 {n.title}
                </option>
              ))}
              <option value="__new__">➕ + Create New Note...</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Enter note title"
                value={newNoteTitle}
                onChange={e => setNewNoteTitle(e.target.value)}
                autoFocus
                className="save-note-input"
              />
              {notesInSelectedFolder.length > 0 && (
                <button
                  type="button"
                  className="small-btn"
                  onClick={() => { setIsCreatingNote(false); setSelectedNoteId(notesInSelectedFolder[0]?.id || ''); }}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        <div className="save-note-preview-box" style={{ marginTop: 14 }}>
          <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 4 }}>
            Source: <strong>{source?.conversationTitle || 'Chat'}</strong> › <strong>{source?.branchName}</strong> ({source?.messageRole})
          </div>
          <div className="save-note-preview-content">
            {content.length > 240 ? `${content.substring(0, 240)}...` : content}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>
            ↓ Will be appended as the newest text card at the bottom of the note.
          </div>
        </div>

        <div className="modal-buttons" style={{ marginTop: 18 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              backgroundColor: '#667eea',
              color: 'white',
              fontWeight: 600
            }}
          >
            {saving ? 'Saving...' : 'Save to Note'}
          </button>
          <button onClick={onClose} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SaveToNoteModal;

import React, { useMemo, useState } from 'react';
import { NoteFolder, Note } from '../hooks/useNotes';

interface NoteDestinationPickerProps {
  noteFolders: NoteFolder[];
  notes: Note[];
  defaultFolderId?: string | null;
  defaultNoteId?: string | null;
  onConfirm: (noteId: string) => void;
  onCancel: () => void;
  onCreateFolder: (name: string, color?: string) => Promise<NoteFolder | null>;
  onCreateNote: (title: string, folderId?: string | null) => Promise<Note | null>;
}

const NoteDestinationPicker: React.FC<NoteDestinationPickerProps> = ({
  noteFolders,
  notes,
  defaultFolderId,
  defaultNoteId,
  onConfirm,
  onCancel,
  onCreateFolder,
  onCreateNote
}) => {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(defaultFolderId ?? null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(defaultNoteId ?? null);
  const [creatingNote, setCreatingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const notesInFolder = useMemo(
    () => notes.filter(n => (n.folder_id ?? null) === selectedFolderId),
    [notes, selectedFolderId]
  );

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    const stillValid = notes.some(n => n.id === selectedNoteId && (n.folder_id ?? null) === folderId);
    if (!stillValid) setSelectedNoteId(null);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const created = await onCreateFolder(newFolderName.trim());
    if (created) {
      setSelectedFolderId(created.id);
      setSelectedNoteId(null);
    }
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleCreateNote = async () => {
    if (!newNoteTitle.trim()) return;
    const created = await onCreateNote(newNoteTitle.trim(), selectedFolderId);
    if (created) setSelectedNoteId(created.id);
    setCreatingNote(false);
    setNewNoteTitle('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal note-destination-picker">
        <h3>Save to Note</h3>

        <div className="note-destination-section">
          <div className="note-destination-section-label">Folder</div>
          <div className="note-destination-list">
            <div
              className={`note-destination-item ${selectedFolderId === null ? 'active' : ''}`}
              onClick={() => handleSelectFolder(null)}
            >
              (No folder)
            </div>
            {noteFolders.map(folder => (
              <div
                key={folder.id}
                className={`note-destination-item ${selectedFolderId === folder.id ? 'active' : ''}`}
                style={{ borderLeft: `4px solid ${folder.color}` }}
                onClick={() => handleSelectFolder(folder.id)}
              >
                📁 {folder.name}
              </div>
            ))}
            {creatingFolder ? (
              <div className="note-destination-item note-destination-new">
                <input
                  autoFocus
                  value={newFolderName}
                  placeholder="Folder name"
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                  onBlur={handleCreateFolder}
                />
              </div>
            ) : (
              <div className="note-destination-item note-destination-new" onClick={() => setCreatingFolder(true)}>
                + New folder
              </div>
            )}
          </div>
        </div>

        <div className="note-destination-section">
          <div className="note-destination-section-label">Note</div>
          <div className="note-destination-list">
            {notesInFolder.map(note => (
              <div
                key={note.id}
                className={`note-destination-item ${selectedNoteId === note.id ? 'active' : ''}`}
                onClick={() => setSelectedNoteId(note.id)}
              >
                📝 {note.title}
              </div>
            ))}
            {creatingNote ? (
              <div className="note-destination-item note-destination-new">
                <input
                  autoFocus
                  value={newNoteTitle}
                  placeholder="Note title"
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateNote()}
                  onBlur={handleCreateNote}
                />
              </div>
            ) : (
              <div className="note-destination-item note-destination-new" onClick={() => setCreatingNote(true)}>
                + New note
              </div>
            )}
          </div>
        </div>

        <div className="modal-buttons">
          <button disabled={!selectedNoteId} onClick={() => selectedNoteId && onConfirm(selectedNoteId)}>
            Save
          </button>
          <button className="cancel-button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default NoteDestinationPicker;

import { useState, useCallback } from 'react';
import axios from 'axios';

export interface NoteFolder {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  is_archived?: boolean;
  archived_at?: string | null;
}

export interface Note {
  id: string;
  title: string;
  folder_id?: string | null;
  color?: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  is_archived?: boolean;
  archived_at?: string | null;
}

export interface NoteText {
  id: string;
  note_id: string;
  content: string;
  position: number;
  created_at: string;
  updated_at: string;
  source_type: 'manual' | 'conversation';
  source_conversation_id?: string | null;
  source_message_id?: string | null;
  source_branch_name?: string | null;
  source_label?: string | null;
}

export interface NoteWithTexts extends Note {
  texts: NoteText[];
}

const API_BASE = process.env.REACT_APP_API_BASE;

export const useNotes = () => {
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [archivedNoteFolders, setArchivedNoteFolders] = useState<NoteFolder[]>([]);
  const [archivedNotes, setArchivedNotes] = useState<Note[]>([]);
  const [currentNote, setCurrentNote] = useState<NoteWithTexts | null>(null);

  const loadNoteFolders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/note-folders`);
      setNoteFolders(response.data);
    } catch (error) {
      console.error('Error loading note folders:', error);
    }
  }, []);

  const createNoteFolder = useCallback(async (name: string, color?: string) => {
    try {
      const response = await axios.post(`${API_BASE}/note-folders`, { name, color });
      setNoteFolders(prev => [...prev, response.data]);
      return response.data as NoteFolder;
    } catch (error) {
      console.error('Error creating note folder:', error);
      return null;
    }
  }, []);

  const updateNoteFolder = useCallback(async (folderId: string, changes: { name?: string; color?: string; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/note-folders/${folderId}`, changes);
      setNoteFolders(prev => prev.map(f => (f.id === folderId ? response.data : f)));
      return true;
    } catch (error) {
      console.error('Error updating note folder:', error);
      return false;
    }
  }, []);

  const deleteNoteFolder = useCallback(async (folderId: string) => {
    try {
      await axios.delete(`${API_BASE}/note-folders/${folderId}`);
      setNoteFolders(prev => prev.filter(f => f.id !== folderId));
      setNotes(prev => prev.map(n => (n.folder_id === folderId ? { ...n, folder_id: null } : n)));
      return true;
    } catch (error) {
      console.error('Error deleting note folder:', error);
      return false;
    }
  }, []);

  const loadArchivedNoteFolders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/note-folders/archived`);
      setArchivedNoteFolders(response.data);
    } catch (error) {
      console.error('Error loading archived note folders:', error);
    }
  }, []);

  const archiveNoteFolder = useCallback(async (folderId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/note-folders/${folderId}/archive`);
      setNoteFolders(prev => prev.filter(f => f.id !== folderId));
      setArchivedNoteFolders(prev => [response.data, ...prev]);
      setNotes(prev => prev.filter(n => n.folder_id !== folderId));
      return true;
    } catch (error) {
      console.error('Error archiving note folder:', error);
      return false;
    }
  }, []);

  const restoreNoteFolder = useCallback(async (folderId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/note-folders/${folderId}/restore`);
      setArchivedNoteFolders(prev => prev.filter(f => f.id !== folderId));
      setNoteFolders(prev => [...prev, response.data]);
      return true;
    } catch (error) {
      console.error('Error restoring note folder:', error);
      return false;
    }
  }, []);

  const organizeNote = useCallback(async (noteId: string, changes: { folder_id?: string | null; color?: string; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/notes/${noteId}/organize`, changes);
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, ...response.data } : n)));
      return true;
    } catch (error) {
      console.error('Error organizing note:', error);
      return false;
    }
  }, []);

  const reorderNotesSidebar = useCallback(async (
    orderedFolders: { id: string; position: number }[],
    orderedNotes: { id: string; position: number; folder_id?: string | null }[]
  ) => {
    // Optimistic: the caller already rendered the new order
    setNoteFolders(prev => prev.map(f => {
      const match = orderedFolders.find(o => o.id === f.id);
      return match ? { ...f, position: match.position } : f;
    }));
    setNotes(prev => prev.map(n => {
      const match = orderedNotes.find(o => o.id === n.id);
      return match ? { ...n, position: match.position, folder_id: match.folder_id ?? null } : n;
    }));
    try {
      await axios.put(`${API_BASE}/notes-sidebar/order`, {
        folders: orderedFolders,
        notes: orderedNotes.map(n => ({ ...n, folder_id: n.folder_id ?? null }))
      });
      return true;
    } catch (error) {
      console.error('Error saving notes sidebar order:', error);
      return false;
    }
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/notes`);
      setNotes(response.data);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  }, []);

  const loadNote = useCallback(async (noteId: string) => {
    try {
      const response = await axios.get(`${API_BASE}/notes/${noteId}`);
      const note: NoteWithTexts = response.data;
      setCurrentNote(note);
      return note;
    } catch (error) {
      console.error('Error loading note:', error);
      return null;
    }
  }, []);

  const createNote = useCallback(async (title: string, folderId?: string | null) => {
    try {
      const response = await axios.post(`${API_BASE}/notes`, { title, folder_id: folderId ?? null });
      const newNote = response.data;
      setNotes(prev => [...prev, newNote]);
      return newNote as Note;
    } catch (error) {
      console.error('Error creating note:', error);
      return null;
    }
  }, []);

  const renameNote = useCallback(async (noteId: string, newTitle: string) => {
    try {
      await axios.put(`${API_BASE}/notes/${noteId}/rename?new_title=${encodeURIComponent(newTitle)}`);
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, title: newTitle } : n)));
      setCurrentNote(prev => (prev && prev.id === noteId ? { ...prev, title: newTitle } : prev));
      return true;
    } catch (error) {
      console.error('Error renaming note:', error);
      return false;
    }
  }, []);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      await axios.delete(`${API_BASE}/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setCurrentNote(prev => (prev && prev.id === noteId ? null : prev));
      return true;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }, []);

  const loadArchivedNotes = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/notes/archived`);
      setArchivedNotes(response.data);
    } catch (error) {
      console.error('Error loading archived notes:', error);
    }
  }, []);

  const archiveNote = useCallback(async (noteId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/notes/${noteId}/archive`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      setArchivedNotes(prev => [response.data, ...prev]);
      setCurrentNote(prev => (prev && prev.id === noteId ? null : prev));
      return true;
    } catch (error) {
      console.error('Error archiving note:', error);
      return false;
    }
  }, []);

  const restoreNote = useCallback(async (noteId: string) => {
    try {
      const response = await axios.post(`${API_BASE}/notes/${noteId}/restore`);
      setArchivedNotes(prev => prev.filter(n => n.id !== noteId));
      setNotes(prev => [...prev, response.data]);
      return true;
    } catch (error) {
      console.error('Error restoring note:', error);
      return false;
    }
  }, []);

  const createNoteText = useCallback(async (noteId: string, payload: {
    content: string;
    source_type?: 'manual' | 'conversation';
    source_conversation_id?: string | null;
    source_message_id?: string | null;
    source_branch_name?: string | null;
    source_label?: string | null;
  }) => {
    try {
      const response = await axios.post(`${API_BASE}/notes/${noteId}/texts`, payload);
      const created: NoteText = response.data;
      setCurrentNote(prev => (prev && prev.id === noteId ? { ...prev, texts: [...prev.texts, created] } : prev));
      return created;
    } catch (error) {
      console.error('Error creating note text:', error);
      return null;
    }
  }, []);

  const updateNoteText = useCallback(async (noteId: string, textId: string, content: string) => {
    try {
      const response = await axios.put(`${API_BASE}/notes/${noteId}/texts/${textId}`, { content });
      const updated: NoteText = response.data;
      setCurrentNote(prev => (prev && prev.id === noteId
        ? { ...prev, texts: prev.texts.map(t => (t.id === textId ? updated : t)) }
        : prev));
      return updated;
    } catch (error) {
      console.error('Error updating note text:', error);
      return null;
    }
  }, []);

  const deleteNoteText = useCallback(async (noteId: string, textId: string) => {
    try {
      await axios.delete(`${API_BASE}/notes/${noteId}/texts/${textId}`);
      setCurrentNote(prev => (prev && prev.id === noteId
        ? { ...prev, texts: prev.texts.filter(t => t.id !== textId) }
        : prev));
      return true;
    } catch (error) {
      console.error('Error deleting note text:', error);
      return false;
    }
  }, []);

  const reorderNoteTexts = useCallback(async (noteId: string, items: { id: string; position: number }[]) => {
    setCurrentNote(prev => {
      if (!prev || prev.id !== noteId) return prev;
      const texts = prev.texts.map(t => {
        const match = items.find(i => i.id === t.id);
        return match ? { ...t, position: match.position } : t;
      }).sort((a, b) => a.position - b.position);
      return { ...prev, texts };
    });
    try {
      await axios.put(`${API_BASE}/notes/${noteId}/texts/reorder`, { items });
      return true;
    } catch (error) {
      console.error('Error reordering note texts:', error);
      return false;
    }
  }, []);

  const saveMessageToNote = useCallback(async (
    conversationId: string,
    messageId: string,
    noteId: string,
    content: string,
    sourceLabel?: string
  ) => {
    try {
      const response = await axios.post(
        `${API_BASE}/conversations/${conversationId}/messages/${messageId}/save-to-note`,
        { note_id: noteId, content, source_label: sourceLabel }
      );
      const created: NoteText = response.data;
      setCurrentNote(prev => (prev && prev.id === noteId ? { ...prev, texts: [...prev.texts, created] } : prev));
      return created;
    } catch (error) {
      console.error('Error saving message to note:', error);
      return null;
    }
  }, []);

  return {
    noteFolders,
    notes,
    archivedNoteFolders,
    archivedNotes,
    currentNote,
    loadNoteFolders,
    createNoteFolder,
    updateNoteFolder,
    deleteNoteFolder,
    loadArchivedNoteFolders,
    archiveNoteFolder,
    restoreNoteFolder,
    organizeNote,
    reorderNotesSidebar,
    loadNotes,
    loadNote,
    createNote,
    renameNote,
    deleteNote,
    loadArchivedNotes,
    archiveNote,
    restoreNote,
    createNoteText,
    updateNoteText,
    deleteNoteText,
    reorderNoteTexts,
    saveMessageToNote,
    setCurrentNote
  };
};

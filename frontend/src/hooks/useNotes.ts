import { useState, useCallback } from 'react';
import axios from 'axios';

export interface NoteFolder {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

export interface NoteItem {
  id: string;
  note_id: string;
  content: string;
  position: number;
  source_type: 'manual' | 'conversation';
  source_conversation_id?: string | null;
  source_conversation_title?: string | null;
  source_branch_name?: string | null;
  source_message_id?: string | null;
  source_message_role?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  folder_id?: string | null;
  color?: string | null;
  position?: number;
  created_at: string;
  updated_at: string;
  items_count?: number;
  items?: NoteItem[];
}

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

export const useNotes = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const [loadingNotes, setLoadingNotes] = useState<boolean>(false);

  const loadNoteFolders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/notes/folders`);
      setNoteFolders(response.data);
    } catch (error) {
      console.error('Error loading note folders:', error);
    }
  }, []);

  const createNoteFolder = useCallback(async (name: string, color?: string) => {
    try {
      const response = await axios.post(`${API_BASE}/notes/folders`, { name, color });
      setNoteFolders(prev => [...prev, response.data]);
      return response.data as NoteFolder;
    } catch (error) {
      console.error('Error creating note folder:', error);
      return null;
    }
  }, []);

  const updateNoteFolder = useCallback(async (folderId: string, changes: { name?: string; color?: string; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/notes/folders/${folderId}`, changes);
      setNoteFolders(prev => prev.map(f => (f.id === folderId ? response.data : f)));
      return true;
    } catch (error) {
      console.error('Error updating note folder:', error);
      return false;
    }
  }, []);

  const deleteNoteFolder = useCallback(async (folderId: string) => {
    try {
      await axios.delete(`${API_BASE}/notes/folders/${folderId}`);
      setNoteFolders(prev => prev.filter(f => f.id !== folderId));
      setNotes(prev => prev.map(n => (n.folder_id === folderId ? { ...n, folder_id: null } : n)));
      if (currentNote && currentNote.folder_id === folderId) {
        setCurrentNote(prev => (prev ? { ...prev, folder_id: null } : null));
      }
      return true;
    } catch (error) {
      console.error('Error deleting note folder:', error);
      return false;
    }
  }, [currentNote]);

  const saveNoteSidebarOrder = useCallback(async (
    orderedFolders: { id: string; position: number }[],
    orderedNotes: { id: string; position: number; folder_id?: string | null }[]
  ) => {
    setNoteFolders(prev => prev.map(f => {
      const match = orderedFolders.find(o => o.id === f.id);
      return match ? { ...f, position: match.position } : f;
    }));
    setNotes(prev => prev.map(n => {
      const match = orderedNotes.find(o => o.id === n.id);
      return match ? { ...n, position: match.position, folder_id: match.folder_id ?? null } : n;
    }));
    try {
      await axios.put(`${API_BASE}/notes/sidebar/order`, {
        folders: orderedFolders,
        notes: orderedNotes.map(n => ({ ...n, folder_id: n.folder_id ?? null }))
      });
      return true;
    } catch (error) {
      console.error('Error saving note sidebar order:', error);
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
    setLoadingNotes(true);
    try {
      const response = await axios.get(`${API_BASE}/notes/${noteId}`);
      const noteData: Note = response.data;
      setCurrentNote(noteData);
      return noteData;
    } catch (error: any) {
      console.error('Error loading note:', error);
      if (error.response?.status === 404) {
        throw new Error('NOTE_NOT_FOUND');
      }
      return null;
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  const createNote = useCallback(async (title?: string, folder_id?: string | null, color?: string | null) => {
    try {
      const noteTitle = title || `Note ${Date.now()}`;
      const response = await axios.post(`${API_BASE}/notes`, {
        title: noteTitle,
        folder_id: folder_id || null,
        color: color || null
      });
      const newNote = response.data;
      setNotes(prev => [...prev, newNote]);
      setCurrentNote({ ...newNote, items: [] });
      return newNote as Note;
    } catch (error) {
      console.error('Error creating note:', error);
      return null;
    }
  }, []);

  const updateNote = useCallback(async (noteId: string, changes: { title?: string; folder_id?: string | null; color?: string | null; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/notes/${noteId}`, changes);
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, ...response.data } : n)));
      if (currentNote?.id === noteId) {
        setCurrentNote(prev => (prev ? { ...prev, ...response.data } : null));
      }
      return true;
    } catch (error) {
      console.error('Error updating note:', error);
      return false;
    }
  }, [currentNote]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      await axios.delete(`${API_BASE}/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
      if (currentNote?.id === noteId) {
        setCurrentNote(null);
      }
      return true;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }, [currentNote]);

  const addNoteItem = useCallback(async (
    noteId: string,
    itemData: {
      content: string;
      source_type?: string;
      source_conversation_id?: string | null;
      source_conversation_title?: string | null;
      source_branch_name?: string | null;
      source_message_id?: string | null;
      source_message_role?: string | null;
    }
  ) => {
    try {
      const response = await axios.post(`${API_BASE}/notes/${noteId}/items`, itemData);
      const createdItem: NoteItem = response.data;
      if (currentNote && currentNote.id === noteId) {
        setCurrentNote(prev => {
          if (!prev) return null;
          const updatedItems = [...(prev.items || []), createdItem];
          return { ...prev, items: updatedItems, items_count: updatedItems.length };
        });
      }
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, items_count: (n.items_count || 0) + 1 } : n)));
      return createdItem;
    } catch (error) {
      console.error('Error adding item to note:', error);
      return null;
    }
  }, [currentNote]);

  const updateNoteItem = useCallback(async (noteId: string, itemId: string, content: string) => {
    try {
      const response = await axios.put(`${API_BASE}/notes/${noteId}/items/${itemId}`, { content });
      const updatedItem: NoteItem = response.data;
      if (currentNote && currentNote.id === noteId) {
        setCurrentNote(prev => {
          if (!prev) return null;
          const updatedItems = (prev.items || []).map(item => (item.id === itemId ? updatedItem : item));
          return { ...prev, items: updatedItems };
        });
      }
      return updatedItem;
    } catch (error) {
      console.error('Error updating note item:', error);
      return null;
    }
  }, [currentNote]);

  const deleteNoteItem = useCallback(async (noteId: string, itemId: string) => {
    try {
      await axios.delete(`${API_BASE}/notes/${noteId}/items/${itemId}`);
      if (currentNote && currentNote.id === noteId) {
        setCurrentNote(prev => {
          if (!prev) return null;
          const updatedItems = (prev.items || []).filter(item => item.id !== itemId);
          return { ...prev, items: updatedItems, items_count: updatedItems.length };
        });
      }
      setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, items_count: Math.max(0, (n.items_count || 1) - 1) } : n)));
      return true;
    } catch (error) {
      console.error('Error deleting note item:', error);
      return false;
    }
  }, [currentNote]);

  const reorderNoteItems = useCallback(async (noteId: string, orderedItemIds: string[]) => {
    // Optimistically reorder in currentNote
    if (currentNote && currentNote.id === noteId) {
      const itemsMap = new Map((currentNote.items || []).map(item => [item.id, item]));
      const nextItems: NoteItem[] = [];
      orderedItemIds.forEach((id, index) => {
        const item = itemsMap.get(id);
        if (item) {
          nextItems.push({ ...item, position: index });
        }
      });
      setCurrentNote(prev => (prev ? { ...prev, items: nextItems } : null));
    }
    try {
      await axios.put(`${API_BASE}/notes/${noteId}/items/order`, { item_ids: orderedItemIds });
      return true;
    } catch (error) {
      console.error('Error persisting note items order:', error);
      return false;
    }
  }, [currentNote]);

  return {
    notes,
    noteFolders,
    currentNote,
    loadingNotes,
    setCurrentNote,
    loadNoteFolders,
    createNoteFolder,
    updateNoteFolder,
    deleteNoteFolder,
    saveNoteSidebarOrder,
    loadNotes,
    loadNote,
    createNote,
    updateNote,
    deleteNote,
    addNoteItem,
    updateNoteItem,
    deleteNoteItem,
    reorderNoteItems
  };
};

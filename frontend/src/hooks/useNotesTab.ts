import { useState, useEffect, useCallback } from 'react';
import { useNotes } from './useNotes';

const SIDEBAR_TAB_KEY = 'chatbranch-sidebar-tab';

export type SidebarTab = 'chats' | 'notes';

// Shared wiring for the Notes tab, reused by both the Home and ConversationApp routes
// (mirrors how each route independently calls useConversations()).
export const useNotesTab = () => {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => {
    const saved = localStorage.getItem(SIDEBAR_TAB_KEY);
    return saved === 'notes' ? 'notes' : 'chats';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_TAB_KEY, sidebarTab);
  }, [sidebarTab]);

  const notesApi = useNotes();
  const {
    loadNoteFolders, loadNotes, createNote, loadNote, renameNote, deleteNote, organizeNote, reorderNotesSidebar,
    loadArchivedNotes, loadArchivedNoteFolders, archiveNote, restoreNote, archiveNoteFolder, restoreNoteFolder
  } = notesApi;

  useEffect(() => {
    loadNoteFolders();
    loadNotes();
    loadArchivedNotes();
    loadArchivedNoteFolders();
  }, [loadNoteFolders, loadNotes, loadArchivedNotes, loadArchivedNoteFolders]);

  const handleSelectNote = useCallback(async (noteId: string) => {
    await loadNote(noteId);
  }, [loadNote]);

  const handleCreateNote = useCallback(async (title?: string, folderId?: string | null) => {
    const created = await createNote(title || `Note ${Date.now()}`, folderId ?? null);
    if (created) await loadNote(created.id);
    return created;
  }, [createNote, loadNote]);

  const handleRenameNote = useCallback(async (id: string, newTitle: string) => {
    await renameNote(id, newTitle);
  }, [renameNote]);

  const handleDeleteNote = useCallback(async (id: string) => {
    await deleteNote(id);
  }, [deleteNote]);

  const handleArchiveNote = useCallback(async (id: string) => {
    await archiveNote(id);
  }, [archiveNote]);

  const handleRestoreNote = useCallback(async (id: string) => {
    await restoreNote(id);
  }, [restoreNote]);

  const handleArchiveNoteFolder = useCallback(async (id: string) => {
    await archiveNoteFolder(id);
  }, [archiveNoteFolder]);

  const handleRestoreNoteFolder = useCallback(async (id: string) => {
    await restoreNoteFolder(id);
  }, [restoreNoteFolder]);

  const handleRecolorNote = useCallback((id: string, color: string) => {
    organizeNote(id, { color });
  }, [organizeNote]);

  return {
    sidebarTab,
    setSidebarTab,
    ...notesApi,
    handleSelectNote,
    handleCreateNote,
    handleRenameNote,
    handleDeleteNote,
    handleArchiveNote,
    handleRestoreNote,
    handleArchiveNoteFolder,
    handleRestoreNoteFolder,
    handleRecolorNote,
    reorderNotesSidebar
  };
};

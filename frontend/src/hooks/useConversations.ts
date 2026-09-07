import { useState, useCallback } from 'react';
import axios from 'axios';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  folder_id?: string | null;
  color?: string | null;
  position?: number;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  is_summary?: boolean;
  children: Message[];
}

interface ConversationTree {
  conversation: Conversation;
  messages: { [key: string]: Message };
  branches: any[];
  root_messages: string[];
}

const API_BASE = process.env.REACT_APP_API_BASE;

export const useConversations = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversationTree, setConversationTree] = useState<ConversationTree | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/folders`);
      setFolders(response.data);
    } catch (error) {
      console.error('Error loading folders:', error);
    }
  }, []);

  const createFolder = useCallback(async (name: string, color?: string) => {
    try {
      const response = await axios.post(`${API_BASE}/folders`, { name, color });
      setFolders(prev => [...prev, response.data]);
      return response.data as Folder;
    } catch (error) {
      console.error('Error creating folder:', error);
      return null;
    }
  }, []);

  const updateFolder = useCallback(async (folderId: string, changes: { name?: string; color?: string; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/folders/${folderId}`, changes);
      setFolders(prev => prev.map(f => (f.id === folderId ? response.data : f)));
      return true;
    } catch (error) {
      console.error('Error updating folder:', error);
      return false;
    }
  }, []);

  const deleteFolder = useCallback(async (folderId: string) => {
    try {
      await axios.delete(`${API_BASE}/folders/${folderId}`);
      setFolders(prev => prev.filter(f => f.id !== folderId));
      setConversations(prev => prev.map(c => (c.folder_id === folderId ? { ...c, folder_id: null } : c)));
      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      return false;
    }
  }, []);

  const organizeConversation = useCallback(async (conversationId: string, changes: { folder_id?: string | null; color?: string; position?: number }) => {
    try {
      const response = await axios.patch(`${API_BASE}/conversations/${conversationId}/organize`, changes);
      setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, ...response.data } : c)));
      return true;
    } catch (error) {
      console.error('Error organizing conversation:', error);
      return false;
    }
  }, []);

  const saveSidebarOrder = useCallback(async (
    orderedFolders: { id: string; position: number }[],
    orderedConversations: { id: string; position: number; folder_id?: string | null }[]
  ) => {
    // Optimistic: the caller already rendered the new order
    setFolders(prev => prev.map(f => {
      const match = orderedFolders.find(o => o.id === f.id);
      return match ? { ...f, position: match.position } : f;
    }));
    setConversations(prev => prev.map(c => {
      const match = orderedConversations.find(o => o.id === c.id);
      return match ? { ...c, position: match.position, folder_id: match.folder_id ?? null } : c;
    }));
    try {
      await axios.put(`${API_BASE}/sidebar/order`, {
        folders: orderedFolders,
        conversations: orderedConversations.map(c => ({ ...c, folder_id: c.folder_id ?? null }))
      });
      return true;
    } catch (error) {
      console.error('Error saving sidebar order:', error);
      return false;
    }
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/conversations`);
      setConversations(response.data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      const response = await axios.get(`${API_BASE}/conversations/${conversationId}`);
      const tree: ConversationTree = response.data;
      setCurrentConversation(tree.conversation);
      setConversationTree(tree);
      return tree;
    } catch (error: any) {
      console.error('Error loading conversation:', error);
      if (error.response?.status === 404) {
        // Throw specific error for 404 so UI can handle it
        throw new Error('CONVERSATION_NOT_FOUND');
      }
      return null;
    }
  }, []);

  const createConversation = useCallback(async (title?: string) => {
    try {
      const conversationTitle = title || `Conversation ${Date.now()}`;
      const response = await axios.post(`${API_BASE}/conversations`, {
        title: conversationTitle
      });
      const newConv = response.data;
      setConversations(prev => [...prev, newConv]);
      setCurrentConversation(newConv);
      setConversationTree(null);
      return newConv;
    } catch (error) {
      console.error('Error creating conversation:', error);
      return null;
    }
  }, []);

  const renameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    try {
      await axios.put(`${API_BASE}/conversations/${conversationId}/rename?new_title=${encodeURIComponent(newTitle)}`);
      setConversations(prev => prev.map(conv => 
        conv.id === conversationId ? { ...conv, title: newTitle } : conv
      ));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(prev => prev ? { ...prev, title: newTitle } : null);
      }
      return true;
    } catch (error) {
      console.error('Error renaming conversation:', error);
      return false;
    }
  }, [currentConversation]);

  const renameBranch = useCallback(async (conversationId: string, oldBranchName: string, newBranchName: string) => {
    try {
      await axios.put(`${API_BASE}/conversations/${conversationId}/branches/${encodeURIComponent(oldBranchName)}/rename?new_branch_name=${encodeURIComponent(newBranchName)}`);
      // Reload the conversation to get updated branch names
      if (currentConversation?.id === conversationId) {
        await loadConversation(conversationId);
      }
      return true;
    } catch (error: any) {
      console.error('Error renaming branch:', error);
      // Throw the error with details so the UI can handle it properly
      const errorMessage = error.response?.data?.detail || 'Failed to rename branch';
      throw new Error(errorMessage);
    }
  }, [currentConversation, loadConversation]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      await axios.delete(`${API_BASE}/conversations/${conversationId}`);
      setConversations(prev => prev.filter(conv => conv.id !== conversationId));
      setCurrentConversation(null);
      setConversationTree(null);
      return true;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return false;
    }
  }, []);

  const deleteBranch = useCallback(async (conversationId: string, branchName: string) => {
    try {
      await axios.delete(`${API_BASE}/conversations/${conversationId}/branches/${encodeURIComponent(branchName)}`);
      // Reload the conversation to get updated state
      if (currentConversation?.id === conversationId) {
        await loadConversation(conversationId);
      }
      return true;
    } catch (error) {
      console.error('Error deleting branch:', error);
      return false;
    }
  }, [currentConversation, loadConversation]);

  return {
    conversations,
    folders,
    currentConversation,
    conversationTree,
    loadConversations,
    loadFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    organizeConversation,
    saveSidebarOrder,
    loadConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    renameBranch,
    setCurrentConversation,
    setConversationTree,
    deleteBranch
  };
};

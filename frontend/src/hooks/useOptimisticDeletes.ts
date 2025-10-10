import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

export type UndoToast = {
  deletedIds: string[];
  branchDeleted: boolean;
  timerId: number | null;
  prevTree: any;
} | null;

export const useOptimisticDeletes = (args: {
  currentConversationId: string | undefined | null;
  conversationTree: any;
  setConversationTree: (tree: any) => void;
  setCurrentBranch: (b: string) => void;
  setSelectedMessage: (id: string | null) => void;
  showError: (msg: string) => void;
  // function to reload the conversation from server (from useConversations)
  loadConversation: (conversationId: string) => Promise<any>;
}) => {
  const { currentConversationId, conversationTree, setConversationTree, setCurrentBranch, setSelectedMessage, showError } = args;

  const [isDeleting, setIsDeleting] = useState(false);

  const requestDelete = useCallback(async (messageId: string, branchName?: string, content?: string) => {
    if (!currentConversationId) return;
    setIsDeleting(true);
    try {
      const response = await axios.post(`${API_BASE}/conversations/${currentConversationId}/messages/${messageId}/soft-delete`);
      const deletedIdsFromServer: string[] = response.data?.deleted_ids || [];
      const branchDeleted = response.data?.branch_deleted || false;

      // Reload canonical conversation from server to ensure consistency
      try {
        await args.loadConversation(currentConversationId);
      } catch (loadErr) {
        // If reloading fails, still try to apply deleted ids to local tree
        if (deletedIdsFromServer.length > 0 && conversationTree) {
          const newTree = JSON.parse(JSON.stringify(conversationTree));
          deletedIdsFromServer.forEach(id => delete newTree.messages[id]);
          newTree.root_messages = (newTree.root_messages || []).filter((id: string) => !deletedIdsFromServer.includes(id));
          if (branchDeleted && branchName) {
            newTree.branches = (newTree.branches || []).filter((b: any) => b.name !== branchName);
          }
          setConversationTree(newTree);
        }
      }

      if (branchDeleted) {
        setCurrentBranch('main');
        setSelectedMessage(null);
      }
    } catch (err: any) {
      showError(err.response?.data?.detail || err.message || 'Failed to delete message');
      throw err;
    } finally {
      setIsDeleting(false);
    }
  }, [currentConversationId, conversationTree, setConversationTree, setCurrentBranch, setSelectedMessage, showError]);

  // cleanup on unmount (no-op but keep for compatibility)
  useEffect(() => {
    return () => {};
  }, []);

  return { requestDelete, isDeleting } as const;
};

export default useOptimisticDeletes;

import { useState, useCallback } from 'react';
import axios from 'axios';
import { getRandomBranchColor } from '../utils/branchColors';

const API_BASE = process.env.REACT_APP_API_BASE;

export const useMessages = () => {
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (
    conversationId: string,
    message: string,
    selectedModel: string,
    currentBranch: string,
    parentMessageId?: string
  ) => {
    if (!message.trim()) return false;

    console.log(`🔍 DEBUG: sendMessage called with:`, {
      conversationId,
      currentBranch,
      parentMessageId,
      finalParentId: parentMessageId || null
    });

    try {
      // Include client-stored API key if present (sessionStorage preferred)
      const clientKey = sessionStorage.getItem('chatbranch_api_key') || localStorage.getItem('chatbranch_api_key') || undefined;
      await axios.post(`${API_BASE}/conversations/${conversationId}/messages`, {
        content: message,
        role: 'user',
        llm_model: selectedModel,
        branch_name: currentBranch,
        parent_id: parentMessageId || null,
        client_api_key: clientKey
      });
      setNewMessage('');
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }, []);

  const createBranch = useCallback(async (
    conversationId: string,
    messageId: string,
    branchName: string,
    color?: string
  ) => {
    try {
      await axios.post(`${API_BASE}/conversations/${conversationId}/branch`, {
        name: branchName,
        created_from_message_id: messageId,
        color: color || getRandomBranchColor()
      });
      return true;
    } catch (error: any) {
      console.error('Error creating branch:', error);
      // Throw the error with details so the UI can handle it properly
      const errorMessage = error.response?.data?.detail || 'Failed to create branch';
      throw new Error(errorMessage);
    }
  }, []);

  return {
    selectedMessage,
    setSelectedMessage,
    newMessage,
    setNewMessage,
    loading,
    setLoading,
    sendMessage,
    createBranch
  };
};

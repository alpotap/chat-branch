import { useState, useCallback } from 'react';
import axios from 'axios';
import { getRandomBranchColor } from '../utils/branchColors';

const API_BASE = 'http://localhost:8001';

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

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/conversations/${conversationId}/messages`, {
        content: message,
        role: 'user',
        llm_model: selectedModel,
        branch_name: currentBranch,
        parent_id: parentMessageId || selectedMessage
      });
      setNewMessage('');
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [selectedMessage]);

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
    sendMessage,
    createBranch
  };
};

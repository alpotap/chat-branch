import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import TreeView from './TreeView';
import ConversationDebugger from './ConversationDebugger';
import ConversationSidebar from './components/ConversationSidebar';
import HeaderControls from './components/HeaderControls';
import ChatView from './components/ChatView';
import MessageInput from './components/MessageInput';
import EmptyState from './components/EmptyState';
import LoginPage from './components/LoginPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useConversations } from './hooks/useConversations';
import useOptimisticDeletes from './hooks/useOptimisticDeletes';
import { useMessages } from './hooks/useMessages';
import { useBranchMessages } from './hooks/useBranchMessages';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';
const DEFAULT_MODEL = 'gemini-2.5-flash';

// Simple undo/redo state for within-conversation navigation
interface ViewState {
  branch: string;
  viewMode: 'chat' | 'tree' | 'debug';
  selectedMessage?: string;
}

interface UndoRedoState {
  history: ViewState[];
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}

// Main App component that handles conversation-specific logic
const ConversationApp: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  
  // Get initial view mode from localStorage or default to 'chat'
  const getInitialViewMode = (): 'chat' | 'tree' | 'debug' => {
    const saved = localStorage.getItem('chatbranch-view-mode');
    return (saved === 'chat' || saved === 'tree' || saved === 'debug') ? saved : 'chat';
  };
  
  const [viewMode, setViewMode] = useState<'chat' | 'tree' | 'debug'>(getInitialViewMode());
  const [messagesPerPage] = useState(20);
  const [debugMode, setDebugMode] = useState(false);
  
  // Simple undo/redo state for within-conversation navigation
  const [undoRedoState, setUndoRedoState] = useState<UndoRedoState>({
    history: [{ branch: 'main', viewMode: 'chat' }],
    currentIndex: 0,
    canUndo: false,
    canRedo: false
  });
  const [isNavigating, setIsNavigating] = useState(false);
  const [intentionallyDeselected, setIntentionallyDeselected] = useState(false);
  
  // Message queue to prevent race conditions
  // Simple lock to prevent race conditions - much more reliable than complex queue
  const sendingLockRef = useRef(false);
  // Lock to prevent sending while a delete is being finalized
  const deletingRef = useRef(false);
  
  // Error modal state
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Conversation not found modal state
  const [showConversationNotFoundModal, setShowConversationNotFoundModal] = useState(false);

  const {
    conversations,
    currentConversation,
    conversationTree,
    loadConversations,
    loadConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    renameBranch,
    deleteBranch,
    setConversationTree
  } = useConversations();

  const {
    selectedMessage,
    setSelectedMessage,
    newMessage,
    setNewMessage,
    loading,
    setLoading,
    sendMessage,
    createBranch
  } = useMessages();

  const {
    allBranchMessages,
    currentBranchMessages,
    paginatedMessages,
    showAllMessages,
    setShowAllMessages
  } = useBranchMessages(
    conversationTree?.messages || null,
    conversationTree?.root_messages || [],
    currentBranch,
    messagesPerPage,
    conversationTree  // Pass the entire conversationTree for branch metadata
  );


  // --- Optimistic UI state for pending user message and AI typing ---
  // pendingUserMessage now tracks error and retry state
  const [pendingUserMessage, setPendingUserMessage] = useState<null | {
    id: string;
    content: string;
    created_at: string;
    error?: string;
    retryCount?: number;
  }>(null);
  const [showAITyping, setShowAITyping] = useState(false);
  const [editingMessage, setEditingMessage] = useState<null | { id: string; content: string; isLeaf: boolean; isFirst: boolean; originView?: 'chat' | 'tree' }>(null);
  // Delete confirmation modal state
  const [deleteRequest, setDeleteRequest] = useState<null | { messageId: string; branchName: string; content: string }>(null);
  const editModalRef = useRef<HTMLDivElement>(null);

  // Handle clicking away from the edit modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editModalRef.current && !editModalRef.current.contains(event.target as Node)) {
        setEditingMessage(null);
      }
    };

    if (editingMessage) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingMessage]);

  // Save state to localStorage (for refreshing purposes)
  useEffect(() => {
    if (currentConversation) {
      const state = {
        conversationId: currentConversation.id,
        branch: currentBranch,
        selectedMessage,
        viewMode
      };
      localStorage.setItem('chatbranch-state', JSON.stringify(state));
    }
  }, [currentConversation, currentBranch, selectedMessage, viewMode]);

  // Simple undo/redo management
  const saveToHistory = useCallback((branch: string, view: 'chat' | 'tree' | 'debug', messageId?: string) => {
    setUndoRedoState(prev => {
      const newState: ViewState = { branch, viewMode: view, selectedMessage: messageId };
      
      // If we're in the middle of history (after an undo), truncate forward history
      const newHistory = prev.history.slice(0, prev.currentIndex + 1);
      newHistory.push(newState);
      
      return {
        history: newHistory,
        currentIndex: newHistory.length - 1,
        canUndo: newHistory.length > 1,
        canRedo: false // Clear redo when new action is taken
      };
    });
  }, []);

  // Remove the updateCurrentHistoryEntry and related useEffect since we're not tracking all changes

  const undo = useCallback(() => {
    if (undoRedoState.canUndo && undoRedoState.currentIndex > 0) {
      setIsNavigating(true);
      const newIndex = undoRedoState.currentIndex - 1;
      const prevState = undoRedoState.history[newIndex];
      
      setCurrentBranch(prevState.branch);
      setViewMode(prevState.viewMode);
      if (prevState.selectedMessage !== undefined) {
        setSelectedMessage(prevState.selectedMessage);
      } else {
        setSelectedMessage(null);
      }
      
      setUndoRedoState(prev => ({
        history: prev.history,
        currentIndex: newIndex,
        canUndo: newIndex > 0,
        canRedo: true
      }));
      
      // Reset navigation flag after state updates
      setTimeout(() => setIsNavigating(false), 0);
    }
  }, [undoRedoState, setSelectedMessage]);

  const redo = useCallback(() => {
    if (undoRedoState.canRedo && undoRedoState.currentIndex < undoRedoState.history.length - 1) {
      setIsNavigating(true);
      const newIndex = undoRedoState.currentIndex + 1;
      const nextState = undoRedoState.history[newIndex];
      
      setCurrentBranch(nextState.branch);
      setViewMode(nextState.viewMode);
      if (nextState.selectedMessage !== undefined) {
        setSelectedMessage(nextState.selectedMessage);
      } else {
        setSelectedMessage(null);
      }
      
      setUndoRedoState(prev => ({
        history: prev.history,
        currentIndex: newIndex,
        canUndo: true,
        canRedo: newIndex < prev.history.length - 1
      }));
      
      // Reset navigation flag after state updates
      setTimeout(() => setIsNavigating(false), 0);
    }
  }, [undoRedoState, setSelectedMessage]);

  // Load conversation when conversationId changes
  useEffect(() => {
    if (conversationId) {
      console.log(`🔍 [DEBUG] Loading conversation: ${conversationId}`);
      
      // For approach 2: Always default to main branch for consistency
      // TODO: In future, this could be made configurable per conversation
      const DEFAULT_BRANCH = 'main';
      const savedViewMode: 'chat' | 'tree' | 'debug' = getInitialViewMode();
      
      // Try to restore saved view mode but always use main branch
      const savedState = localStorage.getItem('chatbranch-state');
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          if (state.conversationId === conversationId && state.viewMode) {
            // Only restore view mode, not branch (always use main)
            console.log(`🔍 [DEBUG] Restored view mode: ${state.viewMode}`);
          }
        } catch (e) {
          console.warn('Failed to parse saved state:', e);
        }
      }
      
      // Reset all state when switching conversations
      setCurrentBranch(DEFAULT_BRANCH); // Always start with main branch
      setViewMode(savedViewMode);
      setSelectedMessage(null);
      setIntentionallyDeselected(false); // Reset intentional deselection when switching conversations
      setNewMessage('');
      setShowAllMessages(false);
      setUndoRedoState({
        history: [{ branch: DEFAULT_BRANCH, viewMode: savedViewMode }],
        currentIndex: 0,
        canUndo: false,
        canRedo: false
      });
      
      // Load the conversation data
      loadConversation(conversationId).catch((error) => {
        if (error.message === 'CONVERSATION_NOT_FOUND') {
          setShowConversationNotFoundModal(true);
        } else {
          console.error('Unexpected error loading conversation:', error);
        }
      });
    }
  }, [conversationId, loadConversation, setSelectedMessage, setNewMessage, setShowAllMessages]);

  // Load conversations list on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Initialize debug mode from URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setDebugMode(urlParams.get('debug') === 'true');
  }, []);

  // Debug effect for TreeView data
  useEffect(() => {
    if (viewMode === 'tree' && conversationTree) {
      console.log('🔍 ConversationTree Debug:', {
        root_messages: conversationTree.root_messages,
        message_count: Object.keys(conversationTree.messages).length,
        branches: conversationTree.branches?.map(b => b.name),
        sample_messages: Object.values(conversationTree.messages).slice(0, 5).map(m => ({
          id: m.id,
          role: m.role,
          branch: m.branch_name,
          children_count: m.children?.length || 0
        }))
      });
    }
  }, [viewMode, conversationTree]);

  // Auto-select last message when conversation/branch changes (but not during navigation)
  useEffect(() => {
    if (!isNavigating && !intentionallyDeselected && allBranchMessages.length > 0 && conversationTree) {
      const lastMessage = allBranchMessages[allBranchMessages.length - 1];
      // Only auto-select if no message is currently selected or if the selected message is not in current branch
      if (!selectedMessage || !allBranchMessages.some(msg => msg.id === selectedMessage)) {
        setSelectedMessage(lastMessage.id);
      }
    }
  }, [currentBranch, allBranchMessages, setSelectedMessage, isNavigating, conversationTree, selectedMessage, intentionallyDeselected]);

  // Helper function to show error modal instead of alert
  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  }, []);

  // instantiate optimistic delete hook (after showError is defined)
  const { requestDelete, isDeleting } = useOptimisticDeletes({
    currentConversationId: currentConversation?.id,
    conversationTree,
    setConversationTree,
    setCurrentBranch,
    setSelectedMessage,
    showError,
    loadConversation
  });

  // Keep the deletingRef in sync with hook state so send flow can block while deleting
  useEffect(() => {
    deletingRef.current = !!isDeleting;
  }, [isDeleting]);

  const handleCreateConversation = useCallback(async (title?: string) => {
    console.log('🔧 Creating new conversation...');
    try {
      const newConv = await createConversation(title);
      if (newConv) {
        console.log('✅ Conversation created:', newConv);
        // Navigate to the new conversation
        navigate(`/conversation/${newConv.id}`);
      } else {
        console.error('❌ Failed to create conversation - no response');
        showError('Failed to create conversation. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      showError('Failed to create conversation. Please try again.');
    }
  }, [createConversation, navigate, showError]);

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await renameConversation(conversationId, newTitle);
  }, [renameConversation]);

  const handleLoadConversation = useCallback(async (conversationId: string) => {
    // Navigate to the conversation URL instead of loading inline
    navigate(`/conversation/${conversationId}`);
  }, [navigate]);

  const handleDeleteConversation = useCallback(async (conversationId?: string) => {
    const targetConversation = conversationId 
      ? conversations.find(c => c.id === conversationId) || currentConversation
      : currentConversation;
      
    if (!targetConversation) return;
    
    const success = await deleteConversation(targetConversation.id);
    if (success) {
      if (targetConversation.id === currentConversation?.id) {
        // If deleting current conversation, navigate to home page
        setSelectedMessage(null);
        setCurrentBranch('main');
        setShowAllMessages(false);
        localStorage.removeItem('chatbranch-state');
        navigate('/'); // Navigate to home page
      }
      console.log('✅ Conversation deleted successfully');
    } else {
      showError('Failed to delete conversation. Please try again.');
    }
  }, [currentConversation, conversations, deleteConversation, setSelectedMessage, setShowAllMessages, showError, navigate]);

  // Helper to send a message (used for both send and retry)
  const sendUserMessage = useCallback(async (messageText: string, tempId: string, retryCount = 0) => {
    if (!currentConversation) return;
    if (deletingRef.current) {
      showError('Please wait for pending delete to complete before sending a new message.');
      return false;
    }
    setShowAITyping(true);
    setLoading(true);
    // Prevent duplicate sends: if a user message with same content and timestamp exists in current branch, do not send
    const duplicate = allBranchMessages.some(
      (msg) =>
        msg.role === 'user' &&
        msg.content === messageText &&
        // Allow some leeway in timestamp (since backend may assign a slightly different time)
        Math.abs(new Date(msg.created_at).getTime() - new Date().getTime()) < 60000
    );
    if (duplicate) {
      setPendingUserMessage(null);
      setShowAITyping(false);
      setLoading(false);
      return;
    }
    try {
      // Always use the last message in the current branch as parent (unless it's the first message)
      let parentId: string | undefined = undefined;
      if (allBranchMessages.length > 0) {
        const lastMessage = allBranchMessages[allBranchMessages.length - 1];
        parentId = lastMessage.id;
      }
      const success = await sendMessage(
        currentConversation.id,
        messageText,
        selectedModel,
        currentBranch,
        parentId
      );
      if (success) {
        setSelectedMessage(null);
        setIntentionallyDeselected(false);
        setNewMessage(''); // Clear input
        setPendingUserMessage(null); // Always clear pending/failed message after success
        setShowAITyping(false);
        await loadConversation(currentConversation.id);
      } else {
        // Should not happen, but fallback error
        setPendingUserMessage(prev => prev && prev.id === tempId ? {
          ...prev,
          error: 'Unknown error sending message.',
          retryCount: retryCount + 1,
        } : prev);
        setShowAITyping(false);
      }
    } catch (error: any) {
      setPendingUserMessage(prev => prev && prev.id === tempId ? {
        ...prev,
        error: 'An error occurred. Please retry.',
        retryCount: retryCount + 1,
      } : prev);
      setShowAITyping(false);
      // Don't clear newMessage so user can edit if desired
    } finally {
      sendingLockRef.current = false;
      setLoading(false);
    }
  }, [currentConversation, allBranchMessages, currentBranch, selectedModel, sendMessage, setSelectedMessage, setIntentionallyDeselected, setNewMessage, loadConversation, setLoading]);

  // Main send handler
  const handleSendMessage = useCallback(async () => {
    if (!currentConversation || !newMessage.trim()) return;
    // Prevent multiple pending user messages
    if (sendingLockRef.current || pendingUserMessage) {
      console.log('🔒 Message send blocked - already processing another message');
      return;
    }
    // Acquire lock immediately
    sendingLockRef.current = true;
    const messageText = newMessage.trim();
    const tempId = `pending-${Date.now()}`;
    setPendingUserMessage({
      id: tempId,
      content: messageText,
      created_at: new Date().toISOString(),
      error: undefined,
      retryCount: 0,
    });
    await sendUserMessage(messageText, tempId, 0);
  }, [currentConversation, newMessage, pendingUserMessage, sendUserMessage]);

  // Retry handler for failed user message
  const handleRetrySendMessage = useCallback(async () => {
    if (!pendingUserMessage || !pendingUserMessage.error) return;
    if (sendingLockRef.current) return;
    sendingLockRef.current = true;
    setPendingUserMessage(prev => prev ? { ...prev, error: undefined } : prev);
    await sendUserMessage(pendingUserMessage.content, pendingUserMessage.id, pendingUserMessage.retryCount || 0);
  }, [pendingUserMessage, sendUserMessage]);

  const handleCreateBranch = useCallback(async (messageId: string, branchName: string, color?: string, switchToChat: boolean = true) => {
    if (!currentConversation) return;

    try {
      await createBranch(currentConversation.id, messageId, branchName, color);
      // Immediately update the UI state
      setCurrentBranch(branchName);
      setSelectedMessage(messageId);
      // Optionally switch to chat view after creating branch for immediate use
      if (switchToChat) {
        console.debug('[DEBUG] handleCreateBranch: switchToChat=true -> switching to chat view', { branchName, messageId });
        setViewMode('chat');
      } else {
        console.debug('[DEBUG] handleCreateBranch: switchToChat=false -> staying in current view', { branchName, messageId });
      }
      // Then reload the conversation to get the updated data
      await loadConversation(currentConversation.id);
    } catch (error: any) {
      console.error('Error creating branch:', error);
      showError(error.message || 'Failed to create branch. Please try again.');
    }
  }, [currentConversation, createBranch, loadConversation, setSelectedMessage, showError]);

  const handleRegenerate = useCallback(async (messageId: string, type: 'branch' | 'place', branchName?: string, switchToChat: boolean = true) => {
    if (!currentConversation) return;

    try {
      if (type === 'branch') {
        // Regenerate in new branch
        const response = await axios.post(`${API_BASE}/conversations/${currentConversation.id}/messages/${messageId}/regenerate-branch`, {
          branch_name: branchName || 'regen-main'
        });

        console.log('✅ Branch regeneration successful:', response.data);
        
        // Reload conversation to get updated data
        await loadConversation(currentConversation.id);
        
        // Switch to the new branch and optionally switch to chat view
  setCurrentBranch(response.data.branch.name);
  if (switchToChat) {
    console.debug('[DEBUG] handleRegenerate: switchToChat=true -> switching to chat view', { branch: response.data.branch.name, messageId });
    setViewMode('chat');
  } else {
    console.debug('[DEBUG] handleRegenerate: switchToChat=false -> staying in current view', { branch: response.data.branch.name, messageId });
  }
        
        // Show success message
        console.log(`✅ ${response.data.message}`);
        
      } else {
        // Regenerate in place
        const response = await axios.post(`${API_BASE}/conversations/${currentConversation.id}/messages/${messageId}/regenerate-place`);

        console.log('✅ In-place regeneration successful:', response.data);
        
        // Reload conversation to get updated data
        await loadConversation(currentConversation.id);
      }
    } catch (error) {
      console.error('Regeneration error:', error);
      if (axios.isAxiosError(error) && error.response) {
        showError(`Failed to regenerate: ${error.response.data.detail || error.message}`);
      } else {
        showError('An error occurred during regeneration. Please try again.');
      }
    }
  }, [currentConversation, loadConversation, showError]);

  // Delete last user message (UI wiring)
  const requestDeleteMessage = useCallback((message: { id: string; branch_name: string; content: string }) => {
    // Only allow deleting user messages from UI
    setDeleteRequest({ messageId: message.id, branchName: message.branch_name, content: message.content });
  }, []);

  const confirmDeleteMessage = useCallback(async (messageId: string) => {
    if (!currentConversation) return;
    try {
      await requestDelete(messageId, deleteRequest?.branchName, deleteRequest?.content);
    } catch (err) {
      // error already shown by hook
    }
    setDeleteRequest(null);
  }, [currentConversation, requestDelete, deleteRequest]);

  

  const handleMessageSelect = useCallback((messageId: string) => {
    // In tree view, always switch branch if message is from different branch
    // In chat view, only select message without switching branch
    if (viewMode === 'tree' && conversationTree) {
      const message = conversationTree.messages[messageId];
      if (message && message.branch_name !== currentBranch) {
        // Switch to the message's branch in tree view
        if (!isNavigating) {
          saveToHistory(message.branch_name, viewMode, messageId);
        }
        setCurrentBranch(message.branch_name);
      }
    }
    // Always select the message regardless of view mode
    setSelectedMessage(messageId);
    setIntentionallyDeselected(false); // Reset intentional deselection flag
  }, [setSelectedMessage, conversationTree, currentBranch, isNavigating, saveToHistory, viewMode, setCurrentBranch]);

  const handleDeselectMessage = useCallback(() => {
    setSelectedMessage(null);
    setIntentionallyDeselected(true);
  }, [setSelectedMessage]);

  const handleBranchSwitch = useCallback((messageId: string) => {
    if (!isNavigating) {
      // Find the branch this message belongs to
      let targetBranch = currentBranch;
      if (conversationTree) {
        const message = conversationTree.messages[messageId];
        if (message) {
          targetBranch = message.branch_name;
        }
      }
      // Save the NEW state to history
      saveToHistory(targetBranch, viewMode, messageId);
    }
    
    setSelectedMessage(messageId);
    setIntentionallyDeselected(false); // Reset intentional deselection when switching branches
    if (conversationTree) {
      const message = conversationTree.messages[messageId];
      if (message) {
        setCurrentBranch(message.branch_name);
      }
    }
  }, [conversationTree, setSelectedMessage, currentBranch, viewMode, saveToHistory, isNavigating]);

  const handleSwitchToChatView = useCallback((branchName: string, messageId: string) => {
    if (!isNavigating) {
      // Save the NEW state to history
      saveToHistory(branchName, 'chat', messageId);
    }
    
    setCurrentBranch(branchName);
    setSelectedMessage(messageId);
    setIntentionallyDeselected(false); // Reset intentional deselection when switching to chat view
  console.debug('[DEBUG] handleSwitchToChatView: user action -> switching to chat view', { branchName, messageId });
  setViewMode('chat');
  }, [setSelectedMessage, saveToHistory, isNavigating]);

  const handleBranchChange = useCallback((newBranch: string) => {
    if (newBranch !== currentBranch && !isNavigating) {
      // Save the NEW state to history (where we're going, not where we were)
      saveToHistory(newBranch, viewMode, selectedMessage || undefined);
    }
    setCurrentBranch(newBranch);
  }, [currentBranch, viewMode, selectedMessage, saveToHistory, isNavigating]);

  const handleViewModeChange = useCallback((newViewMode: 'chat' | 'tree' | 'debug') => {
    if (newViewMode !== viewMode && !isNavigating) {
      // If switching from tree to chat view and there's a selected message
      if (viewMode === 'tree' && newViewMode === 'chat' && selectedMessage && conversationTree) {
        const selectedMsg = conversationTree.messages[selectedMessage];
        if (selectedMsg && selectedMsg.branch_name !== currentBranch) {
          // Switch to the selected message's branch
          setCurrentBranch(selectedMsg.branch_name);
          saveToHistory(selectedMsg.branch_name, newViewMode, selectedMessage);
        } else {
          saveToHistory(currentBranch, newViewMode, selectedMessage || undefined);
        }
      } else {
        // Save the NEW state to history (where we're going, not where we were)
        saveToHistory(currentBranch, newViewMode, selectedMessage || undefined);
      }
    }
    setViewMode(newViewMode);
    // Persist view mode preference to localStorage
    localStorage.setItem('chatbranch-view-mode', newViewMode);
  }, [viewMode, currentBranch, selectedMessage, conversationTree, saveToHistory, isNavigating, setCurrentBranch]);

  const getAvailableBranches = useCallback((): string[] => {
    if (!conversationTree) return ['main'];
    
    const branches = new Set<string>();
    Object.values(conversationTree.messages).forEach(message => {
      branches.add(message.branch_name);
    });
    
    // Always include the current branch (important for newly created branches)
    if (currentBranch) {
      branches.add(currentBranch);
    }
    
    return Array.from(branches).sort();
  }, [conversationTree, currentBranch]);

  const handleDeleteBranch = useCallback(async (branchName: string) => {
    if (!currentConversation) return;

    const success = await deleteBranch(currentConversation.id, branchName);
    if (success) {
      // Switch to main branch after deleting current branch
      setCurrentBranch('main');
      setSelectedMessage(null);
    }
  }, [currentConversation, deleteBranch, setSelectedMessage]);

  const handleRenameBranch = useCallback(async (oldName: string, newName: string) => {
    if (!currentConversation) return;
    
    try {
      await renameBranch(currentConversation.id, oldName, newName);
      // Update current branch if we renamed the current one
      if (currentBranch === oldName) {
        setCurrentBranch(newName);
      }
      // Reload conversation to update tree
      await loadConversation(currentConversation.id);
    } catch (error: any) {
      console.error('Error renaming branch:', error);
      showError(error.message || 'Failed to rename branch. Please try again.');
      throw error; // Re-throw so the dialog knows there was an error
    }
  }, [currentConversation, renameBranch, currentBranch, loadConversation, showError]);

  const handleRecolorBranch = useCallback(async (branchName: string, color: string) => {
    if (!currentConversation) return;
    
    try {
      console.log(`🎨 [DEBUG] Updating branch color: ${branchName} -> ${color}`);
      const response = await axios.patch(`${API_BASE}/conversations/${currentConversation.id}/branches/${branchName}/color`, {
        color: color
      });
      console.log(`✅ [DEBUG] Branch color update response:`, response.data);
      // Reload conversation to update tree with new color
      await loadConversation(currentConversation.id);
    } catch (error: any) {
      console.error('❌ [DEBUG] Error updating branch color:', error);
      console.error('❌ [DEBUG] Error response:', error.response?.data);
      console.error('❌ [DEBUG] Error status:', error.response?.status);
      showError(`Failed to update branch color. ${error.response?.data?.detail || 'Please try again.'}`);
    }
  }, [currentConversation, loadConversation, showError]);

  const handleBeginEdit = useCallback((messageId: string, originalContent: string, originView: 'chat' | 'tree' = 'chat') => {
    if (!conversationTree) return;
    const messageNode = conversationTree.messages[messageId];
    const isLeaf = !messageNode || !messageNode.children || messageNode.children.length === 0;
    const isFirst = conversationTree.root_messages.includes(messageId);
    setEditingMessage({ id: messageId, content: originalContent, isLeaf: isLeaf, isFirst: isFirst, originView });
  }, [conversationTree]);

  const handleCommitEdit = useCallback(async (messageId: string, newContent: string, editType: 'in-place' | 'branch', originView: 'chat' | 'tree' = 'chat') => {
    if (!currentConversation) return;

    // Rely on the global axios interceptor to add the token.
    try {
      if (editType === 'in-place') {
        await axios.put(`${API_BASE}/conversations/${currentConversation.id}/messages/${messageId}`,
          { content: newContent }
        );
      } else {
        const response = await axios.post(`${API_BASE}/conversations/${currentConversation.id}/messages/${messageId}/edit-as-branch`,
          { content: newContent }
        );
        // After creating a branch, switch to it; if this edit originated from tree view, remain in tree
        if (response.data && response.data.branch_name) {
          setCurrentBranch(response.data.branch_name);
          console.debug('[DEBUG] handleCommitEdit: edit-as-branch completed', { originView, branch: response.data.branch_name, newMessageId: response.data.id });
          if (originView !== 'tree') {
            console.debug('[DEBUG] handleCommitEdit: origin is not tree -> switching to chat view', { originView });
            setViewMode('chat');
          } else {
            console.debug('[DEBUG] handleCommitEdit: origin is tree -> staying in tree view', { originView });
          }
          setSelectedMessage(response.data.id);
        }
      }
      setEditingMessage(null);
      await loadConversation(currentConversation.id);
    } catch (error: any) {
      console.error("Failed to edit message:", error);
      showError(error.response?.data?.detail || "Failed to edit message.");
    }
  }, [currentConversation, loadConversation, showError, setCurrentBranch, setViewMode, setSelectedMessage]);

  return (
    <div className="App">
      <HeaderControls
        currentConversation={currentConversation}
        currentBranch={currentBranch}
        availableBranches={getAvailableBranches()}
        onBranchChange={handleBranchChange}
        onDeleteBranch={handleDeleteBranch}
        onRenameBranch={handleRenameBranch}
        onRecolorBranch={handleRecolorBranch}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        debugMode={debugMode}
        canGoBack={undoRedoState.canUndo}
        onGoBack={undo}
        canGoForward={undoRedoState.canRedo}
        onGoForward={redo}
        hasMessages={allBranchMessages.length > 0}
      />

      <div className="main-container">
        <ConversationSidebar
          conversations={conversations}
          currentConversation={currentConversation}
          onLoadConversation={handleLoadConversation}
          onCreateConversation={handleCreateConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
        />

        <div className="content-area">
          {currentConversation ? (
            <>
              {viewMode === 'tree' && conversationTree ? (
                <div className="tree-container">
                  <TreeView
                    messages={conversationTree.messages}
                    rootMessages={conversationTree.root_messages}
                    onMessageSelect={handleMessageSelect}
                    onSwitchToChatView={handleSwitchToChatView}
                    onCreateBranch={handleCreateBranch}
                    onRegenerate={handleRegenerate}
                    onBeginEdit={handleBeginEdit}
                    onDeselectMessage={handleDeselectMessage}
                    selectedMessage={selectedMessage || undefined}
                    conversationTree={conversationTree}
                    onRequestDelete={requestDeleteMessage}
                  />
                </div>
              ) : viewMode === 'debug' && debugMode ? (
                <div className="debug-container">
                  <ConversationDebugger />
                </div>
              ) : (
                <ChatView
                  currentBranch={currentBranch}
                  selectedMessage={selectedMessage}
                  paginatedMessages={paginatedMessages}
                  currentBranchMessages={currentBranchMessages}
                  messagesPerPage={messagesPerPage}
                  showAllMessages={showAllMessages}
                  onShowAllMessages={setShowAllMessages}
                  onBranch={handleCreateBranch}
                  onSelectMessage={handleMessageSelect}
                  onBranchSwitch={handleBranchSwitch}
                  onRegenerate={handleRegenerate}
                  onRenameBranch={handleRenameBranch}
                  onDeselectMessage={handleDeselectMessage}
                  onRequestDelete={requestDeleteMessage}
                  conversationTree={conversationTree}
                  pendingUserMessage={pendingUserMessage}
                  showAITyping={showAITyping}
                  onRetrySendMessage={handleRetrySendMessage}
                  onBeginEdit={handleBeginEdit}
                />
              )}

              <MessageInput
                newMessage={newMessage}
                currentBranch={currentBranch}
                loading={loading}
                onMessageChange={setNewMessage}
                onSendMessage={handleSendMessage}
              />
            </>
          ) : (
            <EmptyState onCreateConversation={handleCreateConversation} />
          )}
        </div>
      </div>
      
      {/* Edit Message Modal */}
      {editingMessage && (
        <div className="modal-overlay">
          <div className="modal" ref={editModalRef}>
            <h3>Edit Message</h3>
            <textarea
              value={editingMessage.content}
              onChange={(e) => setEditingMessage({ ...editingMessage, content: e.target.value })}
              className="edit-textarea"
              autoFocus
            />
            <div className="modal-buttons-vertical">
              <button 
                onClick={() => handleCommitEdit(editingMessage.id, editingMessage.content, 'in-place', editingMessage.originView || 'chat')}
                disabled={!editingMessage.isLeaf}
                title={editingMessage.isLeaf ? "Replaces the current message. Only for messages with no replies." : "Can only edit the last message of a branch in-place"}
              >
                ✏️ Save In-place
              </button>
              <button 
                onClick={() => handleCommitEdit(editingMessage.id, editingMessage.content, 'branch', editingMessage.originView || 'chat')}
                disabled={editingMessage.isFirst}
                title={editingMessage.isFirst ? "Cannot create a branch from the very first message" : "Preserves history by creating a new branch from the previous message."}
              >
                🌿 Save as New Branch
              </button>
              <button className="cancel-button" onClick={() => setEditingMessage(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {showErrorModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Error</h3>
            <p>{errorMessage}</p>
            <div className="modal-buttons">
              <button 
                onClick={() => setShowErrorModal(false)}
                style={{
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Conversation Not Found Modal */}
      {showConversationNotFoundModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Conversation Not Found</h3>
            <p>This conversation no longer exists. It may have been deleted.</p>
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button 
                onClick={() => {
                  setShowConversationNotFoundModal(false);
                  navigate('/');
                }}
                style={{
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  padding: '12px 32px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '500',
                  minWidth: '160px'
                }}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Message Confirmation Modal */}
      {deleteRequest && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Message</h3>
            <p>Are you sure you want to delete this user message?</p>
            <p style={{ fontStyle: 'italic', color: '#333' }}>&ldquo;{deleteRequest.content.substring(0, 200)}&rdquo;</p>
            <div style={{ marginTop: 12, fontSize: '0.9rem', color: '#666' }}>
              <p>If it is the last message in its branch the branch may also be removed.</p>
            </div>
            <div className="modal-buttons" style={{ marginTop: 16 }}>
              <button
                onClick={() => confirmDeleteMessage(deleteRequest.messageId)}
                style={{ backgroundColor: '#b22222', color: 'white', marginRight: 8 }}
              >
                Delete
              </button>
              <button onClick={() => setDeleteRequest(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion is server-canonical; no Undo toast shown to avoid reappearance issues */}
    </div>
  );
};

// Home component for conversation list
const Home: React.FC = () => {
  const navigate = useNavigate();
  const { conversations, loadConversations, createConversation, deleteConversation, renameConversation } = useConversations();
  
  // Error modal state
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Helper function to show error modal instead of alert
  const showError = useCallback((message: string) => {
    setErrorMessage(message);
    setShowErrorModal(true);
  }, []);
  
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleLoadConversation = useCallback(async (conversationId: string) => {
    navigate(`/conversation/${conversationId}`);
  }, [navigate]);

  const handleCreateConversation = useCallback(async (title?: string) => {
    console.log('🔧 Creating new conversation...');
    try {
      const newConv = await createConversation(title);
      if (newConv) {
        console.log('✅ Conversation created:', newConv);
        // Navigate to the new conversation
        navigate(`/conversation/${newConv.id}`);
      } else {
        console.error('❌ Failed to create conversation - no response');
        showError('Failed to create conversation. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      showError('Failed to create conversation. Please try again.');
    }
  }, [createConversation, navigate, showError]);

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await renameConversation(conversationId, newTitle);
  }, [renameConversation]);

  const handleDeleteConversation = useCallback(async (conversationId?: string) => {
    if (conversationId) {
      const success = await deleteConversation(conversationId);
      if (success) {
        console.log('✅ Conversation deleted successfully');
      } else {
        showError('Failed to delete conversation. Please try again.');
      }
    }
  }, [deleteConversation, showError]);

  return (
    <div className="App">
      <HeaderControls
        currentConversation={null}
        currentBranch=""
        availableBranches={[]}
        onBranchChange={() => {}}
        onDeleteBranch={() => {}}
        onRenameBranch={() => {}}
        onRecolorBranch={() => {}}
        viewMode="chat"
        onViewModeChange={() => {}}
        selectedModel="gpt-3.5-turbo"
        onModelChange={() => {}}
        debugMode={false}
        canGoBack={false}
        onGoBack={() => {}}
        canGoForward={false}
        onGoForward={() => {}}
        hasMessages={false}
      />
      <div className="main-container">
        <ConversationSidebar
          conversations={conversations}
          currentConversation={null}
          onLoadConversation={handleLoadConversation}
          onCreateConversation={handleCreateConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={handleDeleteConversation}
        />
        <div className="content-area">
          <EmptyState onCreateConversation={handleCreateConversation} />
        </div>
      </div>
      
      {/* Error Modal */}
      {showErrorModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Error</h3>
            <p>{errorMessage}</p>
            <div className="modal-buttons">
              <button 
                onClick={() => setShowErrorModal(false)}
                style={{
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Protected App wrapper that handles authentication
const ProtectedApp: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="App" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/conversation/:conversationId" element={<ConversationApp />} />
    </Routes>
  );
};

// Main App component with routing and authentication
const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <ProtectedApp />
      </Router>
    </AuthProvider>
  );
};

export default App;

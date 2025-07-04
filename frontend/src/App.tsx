import React, { useState, useEffect, useCallback } from 'react';
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
import { useMessages } from './hooks/useMessages';
import { useBranchMessages } from './hooks/useBranchMessages';
import './App.css';

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
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  
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
    deleteBranch
  } = useConversations();

  const {
    selectedMessage,
    setSelectedMessage,
    newMessage,
    setNewMessage,
    loading,
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
      // Reset all state when switching conversations
      setCurrentBranch('main');
      setViewMode('chat');
      setSelectedMessage(null);
      setNewMessage('');
      setShowAllMessages(false);
      setUndoRedoState({
        history: [{ branch: 'main', viewMode: 'chat' }],
        currentIndex: 0,
        canUndo: false,
        canRedo: false
      });
      
      // Load the conversation data
      loadConversation(conversationId);
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

  // Auto-select last message when conversation/branch changes (but not during navigation)
  useEffect(() => {
    if (!isNavigating && allBranchMessages.length > 0 && conversationTree) {
      const lastMessage = allBranchMessages[allBranchMessages.length - 1];
      // Only auto-select if no message is currently selected or if the selected message is not in current branch
      if (!selectedMessage || !allBranchMessages.some(msg => msg.id === selectedMessage)) {
        setSelectedMessage(lastMessage.id);
      }
    }
  }, [currentBranch, allBranchMessages, setSelectedMessage, isNavigating, conversationTree, selectedMessage]);

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
        alert('Failed to create conversation. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      alert('Failed to create conversation. Please try again.');
    }
  }, [createConversation, navigate]);

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await renameConversation(conversationId, newTitle);
  }, [renameConversation]);

  const handleRenameBranch = useCallback(async (oldBranchName: string, newBranchName: string) => {
    if (!currentConversation) return;
    
    const success = await renameBranch(currentConversation.id, oldBranchName, newBranchName);
    if (success) {
      setCurrentBranch(newBranchName);
    }
  }, [currentConversation, renameBranch]);

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
        setSelectedMessage(null);
        setCurrentBranch('main');
        setShowAllMessages(false);
        localStorage.removeItem('chatbranch-state');
      }
      console.log('✅ Conversation deleted successfully');
    } else {
      alert('Failed to delete conversation. Please try again.');
    }
  }, [currentConversation, conversations, deleteConversation, setSelectedMessage, setShowAllMessages]);

  const handleSendMessage = useCallback(async () => {
    if (!currentConversation) return;
    
    const success = await sendMessage(
      currentConversation.id,
      newMessage,
      selectedModel,
      currentBranch,
      selectedMessage || undefined
    );
    
    if (success) {
      await loadConversation(currentConversation.id);
    }
  }, [currentConversation, newMessage, selectedModel, currentBranch, selectedMessage, sendMessage, loadConversation]);

  const handleCreateBranch = useCallback(async (messageId: string, branchName: string, color?: string) => {
    if (!currentConversation) return;

    const success = await createBranch(currentConversation.id, messageId, branchName, color);
    if (success) {
      // First, reload the conversation to get the updated data
      await loadConversation(currentConversation.id);
      // Then update the UI state
      setCurrentBranch(branchName);
      setSelectedMessage(messageId);
      // Switch to chat view after creating branch for immediate use
      setViewMode('chat');
    }
  }, [currentConversation, createBranch, loadConversation, setSelectedMessage]);

  const handleRegenerate = useCallback(async (messageId: string, type: 'branch' | 'place', branchName?: string) => {
    if (!currentConversation) return;

    try {
      if (type === 'branch') {
        // Regenerate in new branch
        const response = await axios.post(`http://localhost:8001/conversations/${currentConversation.id}/messages/${messageId}/regenerate-branch`, {
          branch_name: branchName || 'regen-main'
        });

        console.log('✅ Branch regeneration successful:', response.data);
        
        // Reload conversation to get updated data
        await loadConversation(currentConversation.id);
        
        // Switch to the new branch
        setCurrentBranch(response.data.branch.name);
        setViewMode('chat');
        
        // Show success message
        console.log(`✅ ${response.data.message}`);
        
      } else {
        // Regenerate in place
        const response = await axios.post(`http://localhost:8001/conversations/${currentConversation.id}/messages/${messageId}/regenerate-place`);

        console.log('✅ In-place regeneration successful:', response.data);
        
        // Reload conversation to get updated data
        await loadConversation(currentConversation.id);
      }
    } catch (error) {
      console.error('Regeneration error:', error);
      if (axios.isAxiosError(error) && error.response) {
        alert(`Failed to regenerate: ${error.response.data.detail || error.message}`);
      } else {
        alert('An error occurred during regeneration. Please try again.');
      }
    }
  }, [currentConversation, loadConversation]);

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
  }, [setSelectedMessage, conversationTree, currentBranch, isNavigating, saveToHistory, viewMode, setCurrentBranch]);

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
    
    return Array.from(branches).sort();
  }, [conversationTree]);

  const handleDeleteBranch = useCallback(async (branchName: string) => {
    if (!currentConversation) return;

    const success = await deleteBranch(currentConversation.id, branchName);
    if (success) {
      // Switch to main branch after deleting current branch
      setCurrentBranch('main');
      setSelectedMessage(null);
    }
  }, [currentConversation, deleteBranch, setSelectedMessage]);

  return (
    <div className="App">
      <HeaderControls
        currentConversation={currentConversation}
        currentBranch={currentBranch}
        availableBranches={getAvailableBranches()}
        onBranchChange={handleBranchChange}
        onDeleteBranch={handleDeleteBranch}
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
                    selectedMessage={selectedMessage || undefined}
                    conversationTree={conversationTree}
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
                  conversationTree={conversationTree}
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
    </div>
  );
};

// Home component for conversation list
const Home: React.FC = () => {
  const navigate = useNavigate();
  const { conversations, loadConversations, createConversation, deleteConversation, renameConversation } = useConversations();
  
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
        alert('Failed to create conversation. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error creating conversation:', error);
      alert('Failed to create conversation. Please try again.');
    }
  }, [createConversation, navigate]);

  const handleRenameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await renameConversation(conversationId, newTitle);
  }, [renameConversation]);

  const handleDeleteConversation = useCallback(async (conversationId?: string) => {
    if (conversationId) {
      const success = await deleteConversation(conversationId);
      if (success) {
        console.log('✅ Conversation deleted successfully');
      } else {
        alert('Failed to delete conversation. Please try again.');
      }
    }
  }, [deleteConversation]);

  return (
    <div className="App">
      <HeaderControls
        currentConversation={null}
        currentBranch=""
        availableBranches={[]}
        onBranchChange={() => {}}
        onDeleteBranch={() => {}}
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

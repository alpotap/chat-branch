import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import TreeView from './TreeView';
import ConversationDebugger from './ConversationDebugger';
import ConversationSidebar from './components/ConversationSidebar';
import HeaderControls from './components/HeaderControls';
import ChatView from './components/ChatView';
import MessageInput from './components/MessageInput';
import EmptyState from './components/EmptyState';
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
  const [viewMode, setViewMode] = useState<'chat' | 'tree' | 'debug'>('chat');
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
      setSelectedMessage(lastMessage.id);
    }
  }, [currentBranch, allBranchMessages, setSelectedMessage, isNavigating, conversationTree]);

  const handleCreateConversation = useCallback(async (title?: string) => {
    const newConv = await createConversation(title);
    if (newConv) {
      // Navigate to the new conversation
      navigate(`/conversation/${newConv.id}`);
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
      setCurrentBranch(branchName);
      setSelectedMessage(messageId);
      await loadConversation(currentConversation.id);
      // Switch to chat view after creating branch for immediate use
      setViewMode('chat');
    }
  }, [currentConversation, createBranch, loadConversation, setSelectedMessage]);

  const handleMessageSelect = useCallback((messageId: string) => {
    setSelectedMessage(messageId);
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
      // Save the NEW state to history (where we're going, not where we were)
      saveToHistory(currentBranch, newViewMode, selectedMessage || undefined);
    }
    setViewMode(newViewMode);
  }, [viewMode, currentBranch, selectedMessage, saveToHistory, isNavigating]);

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

  const handleCreateConversation = useCallback(async (title?: string) => {
    const newConv = await createConversation(title);
    if (newConv) {
      navigate(`/conversation/${newConv.id}`);
    }
  }, [createConversation, navigate]);

  const handleLoadConversation = useCallback(async (conversationId: string) => {
    navigate(`/conversation/${conversationId}`);
  }, [navigate]);

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
      <div className="header">
        <div className="header-left">
          <h1>🌳 ChatBranch</h1>
        </div>
      </div>
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

// Main App component with routing
const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/conversation/:conversationId" element={<ConversationApp />} />
      </Routes>
    </Router>
  );
};

export default App;

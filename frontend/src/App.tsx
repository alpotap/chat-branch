import React, { useState, useEffect, useCallback } from 'react';
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

const App: React.FC = () => {
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [viewMode, setViewMode] = useState<'chat' | 'tree' | 'debug'>('chat');
  const [messagesPerPage] = useState(20);
  const [debugMode, setDebugMode] = useState(false);

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

  // Load saved state from localStorage
  const loadSavedState = useCallback(async () => {
    try {
      const savedState = localStorage.getItem('chatbranch-state');
      if (savedState) {
        const { conversationId, branch, selectedMessage: savedMessage, viewMode: savedViewMode } = JSON.parse(savedState);
        if (conversationId) {
          const tree = await loadConversation(conversationId);
          if (tree) {
            setCurrentBranch(branch || 'main');
            setSelectedMessage(savedMessage || null);
            setViewMode((savedViewMode === 'debug') ? 'chat' : savedViewMode || 'chat');
          }
        }
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
    }
  }, [loadConversation, setSelectedMessage]);

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      await loadConversations();
      await loadSavedState();
      
      const urlParams = new URLSearchParams(window.location.search);
      setDebugMode(urlParams.get('debug') === 'true');
    };
    initializeApp();
  }, [loadConversations, loadSavedState]);

  // Save state to localStorage
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

  // Auto-select last message when branch changes
  useEffect(() => {
    if (allBranchMessages.length > 0) {
      setSelectedMessage(allBranchMessages[allBranchMessages.length - 1].id);
    }
  }, [currentBranch, allBranchMessages, setSelectedMessage]);

  const handleCreateConversation = useCallback(async (title?: string) => {
    const newConv = await createConversation(title);
    if (newConv) {
      setSelectedMessage(null);
      setCurrentBranch('main');
    }
  }, [createConversation, setSelectedMessage]);

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
    const tree = await loadConversation(conversationId);
    if (tree && tree.messages) {
      const branchMessages = Object.values(tree.messages).filter(msg => msg.branch_name === currentBranch);
      if (branchMessages.length > 0) {
        const sortedMessages = branchMessages.sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setSelectedMessage(sortedMessages[sortedMessages.length - 1].id);
      }
    }
  }, [loadConversation, currentBranch, setSelectedMessage]);

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
    setSelectedMessage(messageId);
    if (conversationTree) {
      const message = conversationTree.messages[messageId];
      if (message) {
        setCurrentBranch(message.branch_name);
      }
    }
  }, [conversationTree, setSelectedMessage]);

  const handleSwitchToChatView = useCallback((branchName: string, messageId: string) => {
    setCurrentBranch(branchName);
    setSelectedMessage(messageId);
    setViewMode('chat');
  }, [setSelectedMessage]);

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
        onBranchChange={setCurrentBranch}
        onDeleteBranch={handleDeleteBranch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        debugMode={debugMode}
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

export default App;

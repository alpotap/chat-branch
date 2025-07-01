import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import TreeView from './TreeView';
import MessageBubble from './MessageBubble';
import ConversationDebugger from './ConversationDebugger';
import './App.css';

interface Message {
  id: string;
  content: string;
  role: string;
  branch_name: string;
  llm_model?: string;
  created_at: string;
  children: Message[];
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
}

interface ConversationTree {
  conversation: Conversation;
  messages: { [key: string]: Message };
  branches: any[];
  root_messages: string[];
}

const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [conversationTree, setConversationTree] = useState<ConversationTree | null>(null);
  const [currentBranch, setCurrentBranch] = useState<string>('main');
  const [selectedMessage, setSelectedMessage] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-3.5-turbo');
  const [viewMode, setViewMode] = useState<'chat' | 'tree' | 'debug'>('chat');
  const [messagesPerPage] = useState(20); // Show 20 messages initially
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  const API_BASE = 'http://localhost:8000';

  // Load all conversations from backend
  const loadConversations = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/conversations`);
      setConversations(response.data);
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  }, []);

  // Load conversation
  const loadConversation = useCallback(async (conversationId: string) => {
    try {
      const response = await axios.get(`${API_BASE}/conversations/${conversationId}`);
      const tree: ConversationTree = response.data;
      setCurrentConversation(tree.conversation);
      setConversationTree(tree);
      
      // Auto-select the last message in the current branch
      const branchMessages = getBranchMessages(tree.messages, tree.root_messages, currentBranch);
      if (branchMessages.length > 0) {
        setSelectedMessage(branchMessages[branchMessages.length - 1].id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  }, [currentBranch]); // Remove getBranchMessages to avoid dependency ordering issues

  // Load saved state from localStorage
  const loadSavedState = useCallback(async () => {
    try {
      const savedState = localStorage.getItem('chatbranch-state');
      if (savedState) {
        const { conversationId, branch, selectedMessage, viewMode } = JSON.parse(savedState);
        if (conversationId) {
          // Load the conversation and restore state
          await loadConversation(conversationId);
          setCurrentBranch(branch || 'main');
          setSelectedMessage(selectedMessage || null);
          // Only restore chat/tree view modes, not debug
          setViewMode((viewMode === 'debug') ? 'chat' : viewMode || 'chat');
        }
      }
    } catch (error) {
      console.error('Error loading saved state:', error);
    }
  }, [loadConversation]); // Add loadConversation dependency

  // Load conversations and saved state on app start
  useEffect(() => {
    const initializeApp = async () => {
      await loadConversations();
      await loadSavedState();
      
      // Check for debug mode in URL
      const urlParams = new URLSearchParams(window.location.search);
      setDebugMode(urlParams.get('debug') === 'true');
    };
    initializeApp();
  }, [loadConversations, loadSavedState]);

  // Save state to localStorage whenever important state changes
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

  // Create new conversation
  const createConversation = async () => {
    try {
      const response = await axios.post(`${API_BASE}/conversations`, {
        title: `Conversation ${Date.now()}`
      });
      const newConv = response.data;
      setConversations([...conversations, newConv]);
      setCurrentConversation(newConv);
      setConversationTree(null);
      setSelectedMessage(null);
      setCurrentBranch('main');
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  // Get messages for a specific branch showing full conversation path
  const getBranchMessages = (messages: { [key: string]: Message }, rootIds: string[], branchName: string): Message[] => {
    // Build a map to find parent relationships
    const parentMap = new Map<string, string>();
    Object.values(messages).forEach(msg => {
      msg.children.forEach(child => {
        parentMap.set(child.id, msg.id);
      });
    });
    
    // Find all messages in the current branch
    const branchMessages = Object.values(messages).filter(msg => msg.branch_name === branchName);
    
    if (branchMessages.length === 0) return [];
    
    // Get the conversation path for the branch
    // Start from the earliest message in the branch and trace back to root
    const sortedBranchMessages = branchMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    
    // Build the full conversation path
    const conversationPath: Message[] = [];
    
    // If this is not the main branch, we need to include the path from root to branch point
    if (branchName !== 'main') {
      // Find where this branch started (the message that has children in this branch)
      const branchPoint: Message | null = Object.values(messages).find(msg => {
        if (msg.branch_name !== branchName) {
          const hasBranchChildren = msg.children.some(child => 
            messages[child.id]?.branch_name === branchName
          );
          return hasBranchChildren;
        }
        return false;
      }) || null;
      
      // If we found the branch point, trace back to root
      if (branchPoint) {
        const pathToRoot: Message[] = [];
        let currentMsg: Message | null = branchPoint;
        
        while (currentMsg) {
          pathToRoot.unshift(currentMsg);
          const parentId = parentMap.get(currentMsg.id);
          currentMsg = parentId ? messages[parentId] : null;
        }
        
        conversationPath.push(...pathToRoot);
      }
    }
    
    // Add all messages from the current branch
    conversationPath.push(...sortedBranchMessages);
    
    // Remove duplicates (in case branch point was already added)
    const uniqueMessages = conversationPath.filter((msg, index, arr) => 
      arr.findIndex(m => m.id === msg.id) === index
    );
    
    // Sort the final result by creation time
    return uniqueMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  // Send message
  const sendMessage = async (parentMessageId?: string, branchName?: string) => {
    if (!newMessage.trim() || !currentConversation) return;

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/conversations/${currentConversation.id}/messages`, {
        content: newMessage,
        role: 'user',
        llm_model: selectedModel, // Always use current selected model
        branch_name: branchName || currentBranch,
        parent_id: parentMessageId || selectedMessage
      });
      
      setNewMessage('');
      await loadConversation(currentConversation.id);
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  // Create branch from a message
  const createBranch = async (messageId: string, branchName: string) => {
    if (!currentConversation) return;

    try {
      // Create the branch record
      await axios.post(`${API_BASE}/conversations/${currentConversation.id}/branch`, {
        name: branchName,
        created_from_message_id: messageId,
        color: getRandomColor()
      });

      // Switch to the new branch
      setCurrentBranch(branchName);
      setSelectedMessage(messageId);
      
      await loadConversation(currentConversation.id);
    } catch (error) {
      console.error('Error creating branch:', error);
    }
  };

  // Get available branches
  const getAvailableBranches = (): string[] => {
    if (!conversationTree) return ['main'];
    
    const branches = new Set<string>();
    Object.values(conversationTree.messages).forEach(message => {
      branches.add(message.branch_name);
    });
    
    return Array.from(branches).sort();
  };

  // Helper function for random colors
  const getRandomColor = (): string => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleMessageSelect = (messageId: string) => {
    setSelectedMessage(messageId);
    if (conversationTree) {
      const message = conversationTree.messages[messageId];
      if (message) {
        setCurrentBranch(message.branch_name);
      }
    }
  };

  // Switch to chat view with specific branch
  const handleSwitchToChatView = (branchName: string, messageId: string) => {
    setCurrentBranch(branchName);
    setSelectedMessage(messageId);
    setViewMode('chat');
  };

  // Clear conversation history
  const deleteConversation = async () => {
    if (!currentConversation) return;
    
    if (window.confirm(`Are you sure you want to clear the history for "${currentConversation.title}"? This cannot be undone.`)) {
      try {
        // Delete from backend
        await axios.delete(`${API_BASE}/conversations/${currentConversation.id}`);
        
        // Remove from frontend state
        const updatedConversations = conversations.filter(conv => conv.id !== currentConversation.id);
        setConversations(updatedConversations);
        
        // Clear current state
        setCurrentConversation(null);
        setConversationTree(null);
        setSelectedMessage(null);
        setCurrentBranch('main');
        setShowAllMessages(false);
        
        // Clear localStorage if this was the active conversation
        localStorage.removeItem('chatbranch-state');
        
        console.log('✅ Conversation history cleared successfully');
      } catch (error) {
        console.error('Error deleting conversation:', error);
        alert('Failed to clear conversation history. Please try again.');
      }
    }
  };

  // Get current branch messages for chat view
  const allBranchMessages = conversationTree 
    ? getBranchMessages(conversationTree.messages, conversationTree.root_messages, currentBranch)
    : [];
  
  const currentBranchMessages = showAllMessages 
    ? allBranchMessages 
    : allBranchMessages.slice(-messagesPerPage);

  // Paginated messages for chat view
  const paginatedMessages = showAllMessages 
    ? currentBranchMessages 
    : currentBranchMessages.slice(0, messagesPerPage);

  return (
    <div className="App">
      <div className="header">
        <h1>🌳 ChatBranch</h1>
        <div className="controls">
          <button onClick={createConversation}>New Conversation</button>
          
          {/* Clear History Button */}
          {currentConversation && (
            <button 
              onClick={deleteConversation}
              className="clear-history-btn"
              style={{ 
                backgroundColor: '#dc3545', 
                color: 'white',
                border: '1px solid #dc3545'
              }}
              title="Clear conversation history"
            >
              🗑️ Clear History
            </button>
          )}
          
          {/* Branch selector */}
          {currentConversation && (
            <select 
              value={currentBranch} 
              onChange={(e) => setCurrentBranch(e.target.value)}
              className="branch-selector"
            >
              {getAvailableBranches().map(branch => (
                <option key={branch} value={branch}>📝 {branch}</option>
              ))}
            </select>
          )}

          {/* View mode toggle */}
          {currentConversation && (
            <div className="view-toggle">
              <button 
                className={viewMode === 'chat' ? 'active' : ''}
                onClick={() => setViewMode('chat')}
              >
                💬 Chat
              </button>
              <button 
                className={viewMode === 'tree' ? 'active' : ''}
                onClick={() => setViewMode('tree')}
              >
                🌳 Tree
              </button>
              {debugMode && (
                <button 
                  className={viewMode === 'debug' ? 'active' : ''}
                  onClick={() => setViewMode('debug')}
                >
                  🔍 Debug
                </button>
              )}
            </div>
          )}
          
          <select 
            value={selectedModel} 
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            <option value="gpt-4">GPT-4</option>
            <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
            <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
          </select>
        </div>
      </div>

      <div className="main-container">
        <div className="sidebar">
          <h3>Conversations</h3>
          {conversations.map(conv => (
            <div 
              key={conv.id} 
              className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''}`}
              onClick={() => loadConversation(conv.id)}
            >
              {conv.title}
            </div>
          ))}
        </div>

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
                    onCreateBranch={createBranch}
                    selectedMessage={selectedMessage || undefined}
                  />
                </div>
              ) : viewMode === 'debug' && debugMode ? (
                <div className="debug-container">
                  <ConversationDebugger />
                </div>
              ) : (
                <div className="chat-container">
                  <div className="branch-info">
                    <span>Current Branch: <strong>{currentBranch}</strong></span>
                    {selectedMessage && (
                      <span>Selected: {conversationTree?.messages[selectedMessage]?.content.substring(0, 30)}...</span>
                    )}
                  </div>
                  
                  <div className="messages">
                    {paginatedMessages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        onBranch={createBranch}
                        onSelectMessage={handleMessageSelect}
                        isSelected={selectedMessage === message.id}
                        depth={0}
                      />
                    ))}
                  </div>

                  {/* Show more / less button */}
                  {currentBranchMessages.length > messagesPerPage && (
                    <div className="pagination-controls">
                      <button onClick={() => setShowAllMessages(!showAllMessages)}>
                        {showAllMessages ? 'Show Less' : 'Show All'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="input-area">
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Type your message for branch "${currentBranch}"...`}
                  disabled={loading}
                />
                <button 
                  onClick={() => sendMessage()} 
                  disabled={loading || !newMessage.trim()}
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <h2>🌿 Welcome to ChatBranch</h2>
              <p>Create conversations that branch like a tree!</p>
              <ul>
                <li>💬 <strong>Chat normally</strong> in any branch</li>
                <li>🖱️ <strong>Right-click any message</strong> to create a new branch</li>
                <li>🌳 <strong>Switch to Tree view</strong> to see the full conversation structure</li>
                <li>📝 <strong>Switch between branches</strong> to explore different conversation paths</li>
              </ul>
              <button onClick={createConversation} className="cta-button">
                Start Your First Conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

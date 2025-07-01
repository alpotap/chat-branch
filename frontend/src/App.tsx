import React, { useState, useEffect } from 'react';
import axios from 'axios';
import TreeView from './TreeView';
import MessageBubble from './MessageBubble';
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
  const [viewMode, setViewMode] = useState<'chat' | 'tree'>('chat');

  const API_BASE = 'http://localhost:8000';

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

  // Load conversation
  const loadConversation = async (conversationId: string) => {
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
  };

  // Get messages for a specific branch in chronological order
  const getBranchMessages = (messages: { [key: string]: Message }, rootIds: string[], branchName: string): Message[] => {
    const branchMessages: Message[] = [];
    
    const traverse = (messageId: string) => {
      const message = messages[messageId];
      if (message && message.branch_name === branchName) {
        branchMessages.push(message);
        // For chat view, only follow the first child in the same branch
        const samebranchChildren = message.children.filter(child => 
          messages[child.id]?.branch_name === branchName
        );
        if (samebranchChildren.length > 0) {
          traverse(samebranchChildren[0].id);
        }
      }
    };

    rootIds.forEach(rootId => {
      if (messages[rootId]?.branch_name === branchName) {
        traverse(rootId);
      }
    });
    
    return branchMessages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  };

  // Get the context chain for a specific message
  const getMessageContext = (messageId: string): Message[] => {
    if (!conversationTree) return [];
    
    const context: Message[] = [];
    let currentId: string | null = messageId;
    
    while (currentId) {
      const message = conversationTree.messages[currentId];
      if (message) {
        context.unshift(message);
        // Find parent by looking for message that has this one as child
        let parentId: string | null = null;
        Object.values(conversationTree.messages).forEach(msg => {
          if (msg.children.some(child => child.id === currentId)) {
            parentId = msg.id;
          }
        });
        currentId = parentId;
      } else {
        break;
      }
    }
    
    return context;
  };

  // Send message
  const sendMessage = async (parentMessageId?: string, branchName?: string) => {
    if (!newMessage.trim() || !currentConversation) return;

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/conversations/${currentConversation.id}/messages`, {
        content: newMessage,
        role: 'user',
        llm_model: selectedModel,
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

  // Get current branch messages for chat view
  const currentBranchMessages = conversationTree 
    ? getBranchMessages(conversationTree.messages, conversationTree.root_messages, currentBranch)
    : [];

  return (
    <div className="App">
      <div className="header">
        <h1>🌳 ChatBranch</h1>
        <div className="controls">
          <button onClick={createConversation}>New Conversation</button>
          
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
                    selectedMessage={selectedMessage || undefined}
                  />
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
                    {currentBranchMessages.map((message, index) => (
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

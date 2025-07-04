import React, { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface HeaderControlsProps {
  currentConversation: any;
  currentBranch: string;
  availableBranches: string[];
  onBranchChange: (branch: string) => void;
  onDeleteBranch: (branchName: string) => void;
  viewMode: 'chat' | 'tree' | 'debug';
  onViewModeChange: (mode: 'chat' | 'tree' | 'debug') => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  debugMode: boolean;
  canGoBack: boolean;
  onGoBack: () => void;
  canGoForward: boolean;
  onGoForward: () => void;
  hasMessages?: boolean; // New prop to check if conversation has messages
}

const HeaderControls: React.FC<HeaderControlsProps> = ({
  currentConversation,
  currentBranch,
  availableBranches,
  onBranchChange,
  onDeleteBranch,
  viewMode,
  onViewModeChange,
  selectedModel,
  onModelChange,
  debugMode,
  canGoBack,
  onGoBack,
  canGoForward,
  onGoForward,
  hasMessages = false
}) => {
  const { user, logout, loading } = useAuth();

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(e.target.value);
  }, [onModelChange]);

  const handleBranchChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onBranchChange(e.target.value);
  }, [onBranchChange]);

  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
    }
  }, [logout]);

  return (
    <div className="header">
      <div className="header-left">
        <h1>🌳 ChatBranch</h1>
        <div className="navigation-buttons">
          <button 
            onClick={onGoBack}
            className={`undo-btn ${!canGoBack ? 'disabled' : ''}`}
            disabled={!canGoBack}
            title={canGoBack ? "Undo last action" : "Nothing to undo"}
          >
            ◀
          </button>
          <button 
            onClick={onGoForward}
            className={`redo-btn ${!canGoForward ? 'disabled' : ''}`}
            disabled={!canGoForward}
            title={canGoForward ? "Redo last action" : "Nothing to redo"}
          >
            ▶
          </button>
        </div>
      </div>
      <div className="controls">
        {/* Branch selector with delete button - only show if conversation has messages */}
        {currentConversation && hasMessages && (
          <div className="branch-controls">
            <select 
              value={currentBranch} 
              onChange={handleBranchChange}
              className="branch-selector"
            >
              {availableBranches.map(branch => (
                <option key={branch} value={branch}>📝 {branch}</option>
              ))}
            </select>
            {currentBranch !== 'main' && (
              <button
                onClick={() => {
                  if (window.confirm(`Are you sure you want to delete branch "${currentBranch}"? This cannot be undone.`)) {
                    onDeleteBranch(currentBranch);
                  }
                }}
                className="delete-branch-btn"
                title="Delete current branch"
              >
                🗑️
              </button>
            )}
          </div>
        )}

        {/* View mode toggle */}
        {currentConversation && (
          <div className="view-toggle">
            <button 
              className={viewMode === 'chat' ? 'active' : ''}
              onClick={() => onViewModeChange('chat')}
            >
              💬 Chat
            </button>
            <button 
              className={viewMode === 'tree' ? 'active' : ''}
              onClick={() => onViewModeChange('tree')}
            >
              🌳 Tree
            </button>
            {debugMode && (
              <button 
                className={viewMode === 'debug' ? 'active' : ''}
                onClick={() => onViewModeChange('debug')}
              >
                🔍 Debug
              </button>
            )}
          </div>
        )}
        
        <select 
          value={selectedModel} 
          onChange={handleModelChange}
        >
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          <option value="gpt-4">GPT-4</option>
          <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
          <option value="claude-3-haiku-20240307">Claude 3 Haiku</option>
        </select>
        
        {/* User info and logout */}
        <div className="user-controls">
          <span className="user-info">
            {loading ? (
              <span style={{ color: '#666', fontStyle: 'italic' }}>🔄 Loading user...</span>
            ) : user ? (
              <>
                👤 {user?.name || user?.email}
                {user?.is_admin && <span className="admin-badge"> (Admin)</span>}
              </>
            ) : (
              <span style={{ color: '#999', fontStyle: 'italic' }}>❓ No user</span>
            )}
          </span>
          <button 
            onClick={handleLogout}
            className="logout-btn"
            title="Logout"
            disabled={loading || !user}
          >
            🚪 Logout
          </button>
        </div>
      </div>
    </div>
  );
};

HeaderControls.displayName = 'HeaderControls';

export default HeaderControls;

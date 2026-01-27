import React, { useCallback, useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = process.env.REACT_APP_API_BASE;

interface HeaderControlsProps {
  currentConversation: any;
  currentBranch: string;
  availableBranches: string[];
  onBranchChange: (branch: string) => void;
  onDeleteBranch: (branchName: string) => void;
  onRenameBranch?: (oldName: string, newName: string) => void;
  onRecolorBranch?: (branchName: string, color: string) => void;
  viewMode: 'chat' | 'tree' | 'debug';
  onViewModeChange: (mode: 'chat' | 'tree' | 'debug') => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  debugMode: boolean;
  canGoBack: boolean;
  onGoBack: () => void;
  canGoForward: boolean;
  onGoForward: () => void;
  hasMessages?: boolean;
}

const HeaderControls: React.FC<HeaderControlsProps> = ({
  currentConversation,
  currentBranch,
  availableBranches,
  onBranchChange,
  onDeleteBranch,
  onRenameBranch,
  onRecolorBranch,
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
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [dependentBranches, setDependentBranches] = useState<string[]>([]);
  const [deletingBranch, setDeletingBranch] = useState<string>('');
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showBranchManageDialog, setShowBranchManageDialog] = useState(false);
  const [manageBranchName, setManageBranchName] = useState('');
  const [manageBranchColor, setManageBranchColor] = useState('#667eea');

  const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onModelChange(e.target.value);
  }, [onModelChange]);

  // Model management (localStorage-backed POC)
  const [models, setModels] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('chatbranch_models');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore
    }
    return [selectedModel || 'openai/gpt-3.5-turbo'];
  });

  useEffect(() => {
    try {
      localStorage.setItem('chatbranch_models', JSON.stringify(models));
    } catch (e) {
      // ignore
    }
  }, [models]);

  

  const handleBranchChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onBranchChange(e.target.value);
  }, [onBranchChange]);

  const handleLogout = useCallback(() => {
    setShowLogoutDialog(true);
  }, []);

  const handleConfirmLogout = useCallback(() => {
    logout();
    setShowLogoutDialog(false);
  }, [logout]);

  const handleCancelLogout = useCallback(() => {
    setShowLogoutDialog(false);
  }, []);

  const handleDeleteBranchClick = useCallback(async () => {
    if (!currentConversation || currentBranch === 'main') return;
    
    try {
      // Check for dependent branches
      const response = await axios.get(
        `${API_BASE}/conversations/${currentConversation.id}/branches/${currentBranch}/dependents`
      );
      
      const dependents = response.data.dependent_branches || [];
      
      if (dependents.length > 0) {
        // Show confirmation dialog with dependent branches
        setDependentBranches(dependents);
        setDeletingBranch(currentBranch);
        setShowDeleteDialog(true);
      } else {
        // No dependents, show simple deletion dialog
        setDependentBranches([]);
        setDeletingBranch(currentBranch);
        setShowDeleteDialog(true);
      }
    } catch (error) {
      console.error('Error checking dependent branches:', error);
      // Fall back to simple deletion dialog if API call fails
      setDependentBranches([]);
      setDeletingBranch(currentBranch);
      setShowDeleteDialog(true);
    }
  }, [currentConversation, currentBranch, onDeleteBranch]);

  const handleConfirmDelete = useCallback(() => {
    onDeleteBranch(deletingBranch);
    setShowDeleteDialog(false);
    setDependentBranches([]);
    setDeletingBranch('');
  }, [deletingBranch, onDeleteBranch]);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteDialog(false);
    setDependentBranches([]);
    setDeletingBranch('');
  }, []);

  const handleManageBranch = useCallback(() => {
    setManageBranchName(currentBranch);
    // Try to get current branch color from conversation tree or use default
    setManageBranchColor('#667eea');
    setShowBranchManageDialog(true);
  }, [currentBranch]);

  // Helper function to check if a branch is protected (configurable in future)
  const isProtectedBranch = useCallback((branchName: string) => {
    const PROTECTED_BRANCHES = ['main']; // TODO: Make this configurable
    return PROTECTED_BRANCHES.includes(branchName);
  }, []);

  const handleSaveBranchChanges = useCallback(async () => {
    const newName = manageBranchName.trim();
    if (!newName) return;

    try {
      // Check if we're trying to rename a protected branch
      const isCurrentProtected = isProtectedBranch(currentBranch);
      
      // If name changed and it's not a protected branch, rename it
      if (newName !== currentBranch && !isCurrentProtected && onRenameBranch) {
        await onRenameBranch(currentBranch, newName);
      } else if (newName !== currentBranch && isCurrentProtected) {
        // Show error for protected branch rename attempt
        console.warn(`Cannot rename protected branch '${currentBranch}'`);
        // The error will be handled by the parent component
        return;
      }

      // Then update color using the appropriate branch name
      if (onRecolorBranch) {
        const branchNameForColor = (!isCurrentProtected && newName !== currentBranch) ? newName : currentBranch;
        await onRecolorBranch(branchNameForColor, manageBranchColor);
      }

      setShowBranchManageDialog(false);
    } catch (error: any) {
      console.error('Error saving branch changes:', error);
      // Error will be displayed by the parent component's showError
      // Keep dialog open on error so user can try again or cancel
    }
  }, [currentBranch, manageBranchName, manageBranchColor, onRenameBranch, onRecolorBranch, isProtectedBranch]);

  const handleCancelBranchManage = useCallback(() => {
    setShowBranchManageDialog(false);
  }, []);

  // Manage Models & Client Key modal state
  const [showManageModels, setShowManageModels] = useState(false);
  const [newModelValue, setNewModelValue] = useState('');
  const [manageMessage, setManageMessage] = useState<string | null>(null);
  const [keyInputValue, setKeyInputValue] = useState('');
  const [keyPersist, setKeyPersist] = useState<boolean>(true);

  useEffect(() => {
    // initialize key input from storage when modal is opened
    if (showManageModels) {
      const stored = localStorage.getItem('chatbranch_api_key') || sessionStorage.getItem('chatbranch_api_key') || '';
      setKeyInputValue(stored);
      setKeyPersist(!!localStorage.getItem('chatbranch_api_key'));
      setManageMessage(null);
    }
  }, [showManageModels]);

  const openManageModels = useCallback(() => setShowManageModels(true), []);
  const closeManageModels = useCallback(() => setShowManageModels(false), []);

  const handleAddModelInline = useCallback(() => {
    const name = newModelValue.trim();
    if (!name) return setManageMessage('Model name cannot be empty');
    if (models.includes(name)) return setManageMessage('Model already exists');
    setModels(prev => {
      const next = [...prev, name];
      return next;
    });
    onModelChange(name);
    setNewModelValue('');
    setManageMessage(`Added model ${name}`);
  }, [newModelValue, models, onModelChange]);

  const handleRemoveModelInline = useCallback((name: string) => {
    setModels(prev => {
      const next = prev.filter(m => m !== name);
      if (name === selectedModel && next.length > 0) onModelChange(next[0]);
      return next;
    });
    setManageMessage(`Removed model ${name}`);
  }, [selectedModel, onModelChange]);

  const handleSaveKey = useCallback(() => {
    if (!keyInputValue) {
      // clear
      sessionStorage.removeItem('chatbranch_api_key');
      localStorage.removeItem('chatbranch_api_key');
      setManageMessage('Cleared client key');
      return;
    }
    if (keyPersist) {
      localStorage.setItem('chatbranch_api_key', keyInputValue);
      sessionStorage.removeItem('chatbranch_api_key');
    } else {
      sessionStorage.setItem('chatbranch_api_key', keyInputValue);
      localStorage.removeItem('chatbranch_api_key');
    }
    setManageMessage('Saved client key');
  }, [keyInputValue, keyPersist]);

  const handleClearKeyInline = useCallback(() => {
    sessionStorage.removeItem('chatbranch_api_key');
    localStorage.removeItem('chatbranch_api_key');
    setKeyInputValue('');
    setKeyPersist(true);
    setManageMessage('Cleared client key');
  }, []);

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
            <button
              onClick={handleManageBranch}
              className="manage-branch-btn"
              title="Rename & recolor branch"
            >
              ✏️
            </button>
            {currentBranch !== 'main' && (
              <button
                onClick={handleDeleteBranchClick}
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
        
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>
          <select 
            value={selectedModel} 
            onChange={handleModelChange}
            style={{ minWidth: 220 }}
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button onClick={openManageModels} title="Manage models & client key" className="small-btn" style={{ marginLeft: 8 }}>Manage Models</button>
        </div>
        
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

      {/* Delete Branch Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>⚠️ Confirm Branch Deletion</h3>
            {dependentBranches.length > 0 ? (
              <>
                <p>
                  Deleting branch "<strong>{deletingBranch}</strong>" will also delete the following dependent branches:
                </p>
                <div className="dependent-branches-list">
                  <ul>
                    {dependentBranches.map(branch => (
                      <li key={branch}>{branch}</li>
                    ))}
                  </ul>
                </div>
                <p><strong>This action cannot be undone!</strong></p>
                <div className="modal-buttons">
                  <button 
                    onClick={handleConfirmDelete}
                    className="confirm-btn"
                  >
                    Delete All ({dependentBranches.length + 1} branches)
                  </button>
                  <button 
                    onClick={handleCancelDelete}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Are you sure you want to delete branch "<strong>{deletingBranch}</strong>"?
                </p>
                <p><strong>This action cannot be undone!</strong></p>
                <div className="modal-buttons">
                  <button 
                    onClick={handleConfirmDelete}
                    className="confirm-btn"
                  >
                    Delete Branch
                  </button>
                  <button 
                    onClick={handleCancelDelete}
                    className="cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      {showLogoutDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>🚪 Confirm Logout</h3>
            <p>Are you sure you want to logout?</p>
            <div className="modal-buttons">
              <button 
                onClick={handleConfirmLogout}
                className="confirm-btn"
              >
                Logout
              </button>
              <button 
                onClick={handleCancelLogout}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Management Dialog */}
      {showBranchManageDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>✏️ Manage Branch</h3>
            <div className="color-selection">
              <label>Branch Name:</label>
              <input
                type="text"
                value={manageBranchName}
                onChange={(e) => setManageBranchName(e.target.value)}
                placeholder="Enter branch name"
                autoFocus
                disabled={isProtectedBranch(currentBranch)}
                style={{
                  opacity: isProtectedBranch(currentBranch) ? 0.6 : 1,
                  cursor: isProtectedBranch(currentBranch) ? 'not-allowed' : 'text'
                }}
              />
              {isProtectedBranch(currentBranch) && (
                <small style={{ color: '#666', fontSize: '0.8em', marginTop: '4px' }}>
                  The '{currentBranch}' branch cannot be renamed
                </small>
              )}
              
              <label>Branch Color:</label>
              <div className="color-options">
                <input
                  type="color"
                  value={manageBranchColor}
                  onChange={(e) => setManageBranchColor(e.target.value)}
                  className="color-picker"
                  style={{
                    width: '40px',
                    height: '40px',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}
                />
                <div className="color-presets">
                  {[
                    '#667eea', '#764ba2', '#f093fb', '#f5576c',
                    '#4facfe', '#00f2fe', '#43e97b', '#38f9d7',
                    '#ffa726', '#ff7043', '#ab47bc', '#7e57c2'
                  ].map(color => (
                    <div
                      key={color}
                      className={`color-preset ${manageBranchColor === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setManageBranchColor(color)}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-buttons">
              <button 
                onClick={handleSaveBranchChanges}
                className="confirm-btn"
                disabled={!manageBranchName.trim()}
              >
                Save Changes
              </button>
              <button 
                onClick={handleCancelBranchManage}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Models & Client Key Modal */}
      {showManageModels && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>🧩 Manage Models & Client Key</h3>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, color: '#111' }}>Add Model (Openrouter)</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={newModelValue}
                  onChange={(e) => setNewModelValue(e.target.value)}
                  placeholder="E.g. google/gemma-3-27b-it:free"
                  style={{ flex: 1, color: '#111', padding: '6px 8px' }}
                />
                <button onClick={handleAddModelInline} className="confirm-btn" style={{ backgroundColor: '#667eea', color: '#fff', border: 'none', padding: '6px 10px' }}>Add</button>
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, color: '#111' }}>Current Models</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 120, overflowY: 'auto' }}>
                {models.map(m => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ fontSize: '0.9em', color: '#111' }}>{m}</strong>
                      {m === selectedModel && <small style={{ color: '#666' }}> (selected)</small>}
                    </div>
                    <div>
                      <button onClick={() => handleRemoveModelInline(m)} className="tiny-btn" style={{ background: '#e5e7eb', color: '#111', border: 'none' }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <hr />

            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, color: '#111' }}>Client API Key</label>
              <input
                type="password"
                value={keyInputValue}
                onChange={(e) => setKeyInputValue(e.target.value)}
                placeholder="Paste OpenRouter API key"
                style={{ width: '100%', marginBottom: 6, color: '#111', padding: '6px 8px' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#111' }}>
                  <input type="checkbox" checked={keyPersist} onChange={(e) => setKeyPersist(e.target.checked)} />
                  Persist across sessions
                </label>
                <button onClick={handleSaveKey} className="confirm-btn" style={{ backgroundColor: '#667eea', color: '#fff', border: 'none', padding: '6px 10px' }}>Save Key</button>
                <button onClick={handleClearKeyInline} className="cancel-btn" style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '6px 10px' }}>Clear</button>
              </div>
              { (localStorage.getItem('chatbranch_api_key') || sessionStorage.getItem('chatbranch_api_key')) && (
                <div style={{ color: '#065f46', marginBottom: 8 }}>Client key stored ({localStorage.getItem('chatbranch_api_key') ? 'persisted' : 'session'})</div>
              )}
              {manageMessage && (
                <div style={{ marginTop: 6, color: '#065f46' }}>{manageMessage}</div>
              )}
            </div>

            <div className="modal-buttons" style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={closeManageModels} className="confirm-btn" style={{ backgroundColor: '#667eea', color: '#fff', border: 'none', padding: '8px 12px' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

HeaderControls.displayName = 'HeaderControls';

export default HeaderControls;

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  folder_id?: string | null;
  color?: string | null;
  position?: number;
  is_archived?: boolean;
  archived_at?: string | null;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
  is_archived?: boolean;
  archived_at?: string | null;
}

interface ConversationSidebarProps {
  conversations: Conversation[];
  folders: Folder[];
  archivedConversations?: Conversation[];
  archivedFolders?: Folder[];
  currentConversation: Conversation | null;
  onLoadConversation: (id: string) => void;
  onCreateConversation: (title?: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  onArchiveConversation?: (id: string) => void;
  onRestoreConversation?: (id: string) => void;
  onCreateFolder: (name: string, color?: string) => void;
  onUpdateFolder: (folderId: string, changes: { name?: string; color?: string }) => void;
  onDeleteFolder: (folderId: string) => void;
  onArchiveFolder?: (folderId: string) => void;
  onRestoreFolder?: (folderId: string) => void;
  onRecolorConversation: (conversationId: string, color: string) => void;
  onReorder: (
    folders: { id: string; position: number }[],
    conversations: { id: string; position: number; folder_id?: string | null }[]
  ) => void;
  /** Text customization so this same component can be reused for the Notes tab */
  headerLabel?: string;
  newItemLabel?: string;
  itemNounSingular?: string;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 520;
const DEFAULT_COLOR = '#667eea';

type DragItem = { type: 'conversation' | 'folder'; id: string } | null;

const ConversationSidebar = memo(({ 
  conversations, 
  folders,
  archivedConversations = [],
  archivedFolders = [],
  currentConversation, 
  onLoadConversation, 
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onArchiveConversation,
  onRestoreConversation,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onArchiveFolder,
  onRestoreFolder,
  onRecolorConversation,
  onReorder,
  headerLabel = 'Chats',
  newItemLabel = '+ Chat',
  itemNounSingular = 'Conversation'
}: ConversationSidebarProps) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newConversationTitle, setNewConversationTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [archiveExpanded, setArchiveExpanded] = useState<boolean>(
    () => localStorage.getItem(`chatbranch-archive-expanded-${headerLabel}`) === 'true'
  );
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<{ type: 'conversation' | 'folder'; id: string; title: string } | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('chatbranch-sidebar-collapsed') === 'true');
  const [width, setWidth] = useState<number>(() => Number(localStorage.getItem('chatbranch-sidebar-width')) || 210);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('chatbranch-collapsed-folders') || '[]');
    } catch {
      return [];
    }
  });
  const [dragItem, setDragItem] = useState<DragItem>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const resizingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem('chatbranch-sidebar-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem('chatbranch-sidebar-width', String(width));
  }, [width]);

  useEffect(() => {
    localStorage.setItem('chatbranch-collapsed-folders', JSON.stringify(collapsedFolders));
  }, [collapsedFolders]);

  useEffect(() => {
    localStorage.setItem(`chatbranch-archive-expanded-${headerLabel}`, String(archiveExpanded));
  }, [archiveExpanded, headerLabel]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)));
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = useCallback(() => {
    resizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const sortByPosition = (a: Conversation, b: Conversation) =>
    (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title);
  const sortedFolders = [...folders].sort((a, b) => a.position - b.position);
  const rootConversations = conversations.filter(c => !c.folder_id).sort(sortByPosition);
  const folderConversations = (folderId: string) =>
    conversations.filter(c => c.folder_id === folderId).sort(sortByPosition);

  type ArchivedEntry = { type: 'folder'; data: Folder } | { type: 'conversation'; data: Conversation };
  const archivedItems: ArchivedEntry[] = [
    ...archivedFolders.map(f => ({ type: 'folder' as const, data: f })),
    ...archivedConversations.map(c => ({ type: 'conversation' as const, data: c })),
  ].sort((a, b) => new Date(b.data.archived_at || 0).getTime() - new Date(a.data.archived_at || 0).getTime());

  const handleCreateConversation = () => {
    if (newConversationTitle.trim()) {
      onCreateConversation(newConversationTitle.trim());
    } else {
      onCreateConversation();
    }
    setShowCreateDialog(false);
    setNewConversationTitle('');
  };

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameTitle(conv.title);
  };

  const handleRename = (convId: string) => {
    if (renameTitle.trim()) {
      onRenameConversation(convId, renameTitle.trim());
    }
    setRenamingId(null);
    setRenameTitle('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameTitle('');
  };

  const handleDeleteClick = (conv: Conversation) => {
    setConversationToDelete(conv);
    setShowDeleteModal(true);
  };

  const confirmArchive = () => {
    if (conversationToDelete) {
      (onArchiveConversation || onDeleteConversation)(conversationToDelete.id);
    }
    if (folderToDelete) {
      (onArchiveFolder || onDeleteFolder)(folderToDelete.id);
    }
    setShowDeleteModal(false);
    setConversationToDelete(null);
    setFolderToDelete(null);
  };

  const confirmDeletePermanently = () => {
    if (conversationToDelete) {
      onDeleteConversation(conversationToDelete.id);
    }
    if (folderToDelete) {
      onDeleteFolder(folderToDelete.id);
    }
    setShowDeleteModal(false);
    setConversationToDelete(null);
    setFolderToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setConversationToDelete(null);
    setFolderToDelete(null);
  };

  const confirmPermanentDeleteFromArchive = () => {
    if (!permanentDeleteTarget) return;
    if (permanentDeleteTarget.type === 'conversation') {
      onDeleteConversation(permanentDeleteTarget.id);
    } else {
      onDeleteFolder(permanentDeleteTarget.id);
    }
    setPermanentDeleteTarget(null);
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders(prev =>
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  };

  // Recomputes positions for the whole sidebar after a drop and pushes them to the backend
  const commitOrder = useCallback((nextConversations: Conversation[], nextFolders: Folder[]) => {
    const folderPayload = nextFolders.map((f, index) => ({ id: f.id, position: index }));
    const conversationPayload: { id: string; position: number; folder_id?: string | null }[] = [];

    nextConversations
      .filter(c => !c.folder_id)
      .forEach((c, index) => conversationPayload.push({ id: c.id, position: index, folder_id: null }));

    nextFolders.forEach(folder => {
      nextConversations
        .filter(c => c.folder_id === folder.id)
        .forEach((c, index) => conversationPayload.push({ id: c.id, position: index, folder_id: folder.id }));
    });

    onReorder(folderPayload, conversationPayload);
  }, [onReorder]);

  const moveConversation = useCallback((draggedId: string, targetFolderId: string | null, beforeConversationId?: string) => {
    const dragged = conversations.find(c => c.id === draggedId);
    if (!dragged) return;

    const others = conversations.filter(c => c.id !== draggedId);
    const updated = { ...dragged, folder_id: targetFolderId };
    const siblings = others.filter(c => (c.folder_id ?? null) === targetFolderId).sort(sortByPosition);

    const foundIndex = beforeConversationId ? siblings.findIndex(c => c.id === beforeConversationId) : -1;
    const insertIndex = foundIndex >= 0 ? foundIndex : siblings.length;
    siblings.splice(insertIndex, 0, updated);

    const rest = others.filter(c => (c.folder_id ?? null) !== targetFolderId);
    commitOrder([...rest, ...siblings], sortedFolders);
  }, [conversations, commitOrder, sortedFolders]);

  const moveFolder = useCallback((draggedId: string, beforeFolderId: string) => {
    if (draggedId === beforeFolderId) return;
    const dragged = sortedFolders.find(f => f.id === draggedId);
    if (!dragged) return;
    const next = sortedFolders.filter(f => f.id !== draggedId);
    const foundIndex = next.findIndex(f => f.id === beforeFolderId);
    next.splice(foundIndex >= 0 ? foundIndex : next.length, 0, dragged);
    commitOrder(conversations, next);
  }, [sortedFolders, conversations, commitOrder]);

  const handleDrop = (e: React.DragEvent, target: { type: 'folder' | 'conversation' | 'root'; id: string | null; folderId?: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (!dragItem) return;

    if (dragItem.type === 'folder') {
      if (target.type === 'folder' && target.id) moveFolder(dragItem.id, target.id);
    } else if (target.type === 'folder') {
      moveConversation(dragItem.id, target.id);
    } else if (target.type === 'conversation') {
      moveConversation(dragItem.id, target.folderId ?? null, target.id || undefined);
    } else {
      moveConversation(dragItem.id, null);
    }
    setDragItem(null);
  };

  const allowDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(key);
  };

  const renderConversation = (conv: Conversation) => (
    <div
      key={conv.id}
      className={`conversation-item ${currentConversation?.id === conv.id ? 'active' : ''} ${dropTarget === `conv-${conv.id}` ? 'drop-target' : ''}`}
      style={conv.color ? { borderLeft: `4px solid ${conv.color}` } : undefined}
      draggable={renamingId !== conv.id}
      onDragStart={() => setDragItem({ type: 'conversation', id: conv.id })}
      onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
      onDragOver={(e) => allowDrop(e, `conv-${conv.id}`)}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => handleDrop(e, { type: 'conversation', id: conv.id, folderId: conv.folder_id ?? null })}
    >
      {renamingId === conv.id ? (
        <div className="rename-input-container">
          <input
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleRename(conv.id)}
            onBlur={() => handleRename(conv.id)}
            autoFocus
            className="rename-input"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
          />
          <button onClick={() => handleRename(conv.id)} className="rename-save-btn">✓</button>
          <button onClick={cancelRename} className="rename-cancel-btn">✕</button>
        </div>
      ) : (
        <>
          <div
            onClick={() => onLoadConversation(conv.id)}
            className="conversation-main-content"
            style={{ flex: 1, cursor: 'pointer', padding: '2px 0', overflow: 'hidden' }}
          >
            <span className="conversation-title">{conv.title}</span>
          </div>
          <div className="conversation-actions">
            <input
              type="color"
              className="item-color-picker"
              value={conv.color || DEFAULT_COLOR}
              onChange={(e) => onRecolorConversation(conv.id, e.target.value)}
              title="Conversation color"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); startRename(conv); }}
              className="rename-btn"
              title="Rename conversation"
            >
              ✏️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteClick(conv); }}
              className="delete-btn"
              title="Delete conversation"
            >
              🗑️
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`} style={collapsed ? undefined : { width }}>
        <div className="sidebar-header">
          {!collapsed && <h3>{headerLabel}</h3>}
          {!collapsed && (
            <>
              <button onClick={() => setShowCreateDialog(true)} className="new-conversation-btn" title={`New ${itemNounSingular.toLowerCase()}`}>
                {newItemLabel}
              </button>
              <button onClick={() => onCreateFolder('New folder')} className="new-conversation-btn" title="New folder">
                + Folder
              </button>
            </>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="sidebar-toggle-btn"
            title={collapsed ? 'Expand conversations' : 'Collapse conversations'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {!collapsed && (
          <div
            className={`sidebar-body ${dropTarget === 'root' ? 'drop-target' : ''}`}
            onDragOver={(e) => allowDrop(e, 'root')}
            onDrop={(e) => handleDrop(e, { type: 'root', id: null })}
          >
            {sortedFolders.map(folder => (
              <div
                key={folder.id}
                className={`folder-item ${dropTarget === `folder-${folder.id}` ? 'drop-target' : ''}`}
                draggable={renamingFolderId !== folder.id}
                onDragStart={(e) => { e.stopPropagation(); setDragItem({ type: 'folder', id: folder.id }); }}
                onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
                onDragOver={(e) => allowDrop(e, `folder-${folder.id}`)}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => handleDrop(e, { type: 'folder', id: folder.id })}
              >
                <div className="folder-header" style={{ borderLeft: `4px solid ${folder.color}` }}>
                  <button className="folder-toggle" onClick={() => toggleFolder(folder.id)} title="Expand/collapse folder">
                    {collapsedFolders.includes(folder.id) ? '▸' : '▾'}
                  </button>
                  {renamingFolderId === folder.id ? (
                    <input
                      type="text"
                      value={folderName}
                      className="rename-input"
                      autoFocus
                      onChange={(e) => setFolderName(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          onUpdateFolder(folder.id, { name: folderName.trim() || folder.name });
                          setRenamingFolderId(null);
                        }
                      }}
                      onBlur={() => {
                        onUpdateFolder(folder.id, { name: folderName.trim() || folder.name });
                        setRenamingFolderId(null);
                      }}
                    />
                  ) : (
                    <span
                      className="folder-name"
                      onDoubleClick={() => { setRenamingFolderId(folder.id); setFolderName(folder.name); }}
                      title="Double-click to rename"
                    >
                      📁 {folder.name}
                    </span>
                  )}
                  <div className="conversation-actions">
                    <input
                      type="color"
                      className="item-color-picker"
                      value={folder.color || DEFAULT_COLOR}
                      onChange={(e) => onUpdateFolder(folder.id, { color: e.target.value })}
                      title="Folder color"
                    />
                    <button
                      className="rename-btn"
                      title="Rename folder"
                      onClick={() => { setRenamingFolderId(folder.id); setFolderName(folder.name); }}
                    >
                      ✏️
                    </button>
                    <button
                      className="delete-btn"
                      title="Archive or delete folder"
                      onClick={() => { setFolderToDelete(folder); setShowDeleteModal(true); }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {!collapsedFolders.includes(folder.id) && (
                  <div className="folder-children">
                    {folderConversations(folder.id).map(renderConversation)}
                  </div>
                )}
              </div>
            ))}

            {rootConversations.map(renderConversation)}
          </div>
        )}

        {!collapsed && (
          <div className="sidebar-archive">
            <button
              className="sidebar-archive-header"
              onClick={() => setArchiveExpanded(e => !e)}
              title="Archived items"
            >
              {archiveExpanded ? '▾' : '▸'} 🗄️ Archive ({archivedItems.length})
            </button>
            {archiveExpanded && (
              <div className="sidebar-archive-body">
                {archivedItems.length === 0 && (
                  <div className="archive-item-title" style={{ padding: '0.2rem 0.3rem' }}>Nothing archived yet</div>
                )}
                {archivedItems.map(entry => entry.type === 'folder' ? (
                  <div key={`archived-folder-${entry.data.id}`} className="archive-item">
                    <span className="archive-item-title">📁 {entry.data.name}</span>
                    <div className="archive-item-actions">
                      <button
                        className="rename-btn"
                        title="Restore folder"
                        onClick={() => onRestoreFolder && onRestoreFolder(entry.data.id)}
                      >
                        ↩️
                      </button>
                      <button
                        className="delete-btn"
                        title="Delete permanently"
                        onClick={() => setPermanentDeleteTarget({ type: 'folder', id: entry.data.id, title: entry.data.name })}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={`archived-conversation-${entry.data.id}`}
                    className={`archive-item ${currentConversation?.id === entry.data.id ? 'active' : ''}`}
                  >
                    <span
                      className="archive-item-title archive-item-open"
                      onClick={() => onLoadConversation(entry.data.id)}
                      title={`Open this archived ${itemNounSingular.toLowerCase()}`}
                    >
                      {entry.data.title}
                    </span>
                    <div className="archive-item-actions">
                      <button
                        className="rename-btn"
                        title={`Restore ${itemNounSingular.toLowerCase()}`}
                        onClick={() => onRestoreConversation && onRestoreConversation(entry.data.id)}
                      >
                        ↩️
                      </button>
                      <button
                        className="delete-btn"
                        title="Delete permanently"
                        onClick={() => setPermanentDeleteTarget({ type: 'conversation', id: entry.data.id, title: entry.data.title })}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!collapsed && <div className="sidebar-resizer" onMouseDown={startResize} title="Drag to resize" />}
      </div>

      {showCreateDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New {itemNounSingular}</h3>
            <input
              type="text"
              placeholder={`${itemNounSingular} title (optional)`}
              value={newConversationTitle}
              onChange={(e) => setNewConversationTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateConversation()}
              autoFocus
              autoComplete="off"
            />
            <div className="modal-buttons">
              <button onClick={handleCreateConversation}>Create</button>
              <button onClick={() => { setShowCreateDialog(false); setNewConversationTitle(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{folderToDelete ? 'Delete Folder' : `Delete ${itemNounSingular}`}</h3>
            <p>
              {folderToDelete
                ? `Archive or permanently delete folder "${folderToDelete.name}"? Its ${itemNounSingular.toLowerCase()}s go with it.`
                : `Archive or permanently delete "${conversationToDelete?.title}"?`}
            </p>
            <div className="modal-buttons">
              <button className="archive-btn" onClick={confirmArchive} autoFocus>🗄️ Archive</button>
              <button className="delete-permanent-btn" onClick={confirmDeletePermanently}>Delete Permanently</button>
              <button className="cancel-btn" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {permanentDeleteTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Permanently</h3>
            <p>Permanently delete "{permanentDeleteTarget.title}"? This cannot be undone.</p>
            <div className="modal-buttons">
              <button className="delete-permanent-btn" onClick={confirmPermanentDeleteFromArchive} autoFocus>Delete Permanently</button>
              <button className="cancel-btn" onClick={() => setPermanentDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ConversationSidebar.displayName = 'ConversationSidebar';

export default ConversationSidebar;

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';

export interface SidebarItem {
  id: string;
  title: string;
  created_at?: string;
  folder_id?: string | null;
  color?: string | null;
  position?: number;
}

export interface Folder {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

interface ConversationSidebarProps {
  conversations: SidebarItem[];
  folders: Folder[];
  currentConversation: SidebarItem | null;
  onLoadConversation: (id: string) => void;
  onCreateConversation: (title?: string) => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  onDeleteConversation: (id: string) => void;
  onCreateFolder: (name: string, color?: string) => void;
  onUpdateFolder: (folderId: string, changes: { name?: string; color?: string }) => void;
  onDeleteFolder: (folderId: string) => void;
  onRecolorConversation: (conversationId: string, color: string) => void;
  onReorder: (
    folders: { id: string; position: number }[],
    conversations: { id: string; position: number; folder_id?: string | null }[]
  ) => void;

  // Notes tab support
  activeTab?: 'chats' | 'notes';
  onTabChange?: (tab: 'chats' | 'notes') => void;
  notes?: SidebarItem[];
  noteFolders?: Folder[];
  currentNote?: SidebarItem | null;
  onLoadNote?: (id: string) => void;
  onCreateNote?: (title?: string) => void;
  onRenameNote?: (id: string, newTitle: string) => void;
  onDeleteNote?: (id: string) => void;
  onCreateNoteFolder?: (name: string, color?: string) => void;
  onUpdateNoteFolder?: (folderId: string, changes: { name?: string; color?: string }) => void;
  onDeleteNoteFolder?: (folderId: string) => void;
  onRecolorNote?: (noteId: string, color: string) => void;
  onReorderNotes?: (
    folders: { id: string; position: number }[],
    notes: { id: string; position: number; folder_id?: string | null }[]
  ) => void;
}

const MIN_WIDTH = 160;
const MAX_WIDTH = 520;
const DEFAULT_COLOR = '#667eea';

type DragItem = { type: 'item' | 'folder'; id: string } | null;

const ConversationSidebar = memo(({ 
  conversations, 
  folders,
  currentConversation, 
  onLoadConversation, 
  onCreateConversation,
  onRenameConversation,
  onDeleteConversation,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onRecolorConversation,
  onReorder,
  activeTab,
  onTabChange,
  notes = [],
  noteFolders = [],
  currentNote = null,
  onLoadNote,
  onCreateNote,
  onRenameNote,
  onDeleteNote,
  onCreateNoteFolder,
  onUpdateNoteFolder,
  onDeleteNoteFolder,
  onRecolorNote,
  onReorderNotes
}: ConversationSidebarProps) => {
  const [internalTab, setInternalTab] = useState<'chats' | 'notes'>(() => {
    return (localStorage.getItem('chatbranch-sidebar-tab') as 'chats' | 'notes') || 'chats';
  });
  const currentTab = activeTab !== undefined ? activeTab : internalTab;

  const handleTabChange = (tab: 'chats' | 'notes') => {
    localStorage.setItem('chatbranch-sidebar-tab', tab);
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const isNotesTab = currentTab === 'notes';

  // Dynamic entity mapping based on active tab
  const items = isNotesTab ? notes : conversations;
  const currentFolders = isNotesTab ? noteFolders : folders;
  const activeItem = isNotesTab ? currentNote : currentConversation;

  const handleLoad = isNotesTab ? (onLoadNote || (() => {})) : onLoadConversation;
  const handleCreate = isNotesTab ? (onCreateNote || (() => {})) : onCreateConversation;
  const handleRename = isNotesTab ? (onRenameNote || (() => {})) : onRenameConversation;
  const handleDelete = isNotesTab ? (onDeleteNote || (() => {})) : onDeleteConversation;
  const handleFolderCreate = isNotesTab ? (onCreateNoteFolder || (() => {})) : onCreateFolder;
  const handleFolderUpdate = isNotesTab ? (onUpdateNoteFolder || (() => {})) : onUpdateFolder;
  const handleFolderDelete = isNotesTab ? (onDeleteNoteFolder || (() => {})) : onDeleteFolder;
  const handleRecolor = isNotesTab ? (onRecolorNote || (() => {})) : onRecolorConversation;
  const handleReorder = isNotesTab ? (onReorderNotes || (() => {})) : onReorder;

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SidebarItem | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem('chatbranch-sidebar-collapsed') === 'true');
  const [width, setWidth] = useState<number>(() => Number(localStorage.getItem('chatbranch-sidebar-width')) || 220);
  
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

  const sortByPosition = (a: SidebarItem, b: SidebarItem) =>
    (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title);
  const sortedFolders = [...currentFolders].sort((a, b) => a.position - b.position);
  const rootItems = items.filter(c => !c.folder_id).sort(sortByPosition);
  const folderItems = (folderId: string) =>
    items.filter(c => c.folder_id === folderId).sort(sortByPosition);

  const handleCreateSubmit = () => {
    if (newItemTitle.trim()) {
      handleCreate(newItemTitle.trim());
    } else {
      handleCreate();
    }
    setShowCreateDialog(false);
    setNewItemTitle('');
  };

  const startRename = (item: SidebarItem) => {
    setRenamingId(item.id);
    setRenameTitle(item.title);
  };

  const handleRenameSubmit = (itemId: string) => {
    if (renameTitle.trim()) {
      handleRename(itemId, renameTitle.trim());
    }
    setRenamingId(null);
    setRenameTitle('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameTitle('');
  };

  const handleDeleteClick = (item: SidebarItem) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      handleDelete(itemToDelete.id);
    }
    if (folderToDelete) {
      handleFolderDelete(folderToDelete.id);
    }
    setShowDeleteModal(false);
    setItemToDelete(null);
    setFolderToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setItemToDelete(null);
    setFolderToDelete(null);
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders(prev =>
      prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
    );
  };

  // Recomputes positions for the whole sidebar after a drop and pushes them to backend
  const commitOrder = useCallback((nextItems: SidebarItem[], nextFolders: Folder[]) => {
    const folderPayload = nextFolders.map((f, index) => ({ id: f.id, position: index }));
    const itemPayload: { id: string; position: number; folder_id?: string | null }[] = [];

    nextItems
      .filter(c => !c.folder_id)
      .forEach((c, index) => itemPayload.push({ id: c.id, position: index, folder_id: null }));

    nextFolders.forEach(folder => {
      nextItems
        .filter(c => c.folder_id === folder.id)
        .forEach((c, index) => itemPayload.push({ id: c.id, position: index, folder_id: folder.id }));
    });

    handleReorder(folderPayload, itemPayload);
  }, [handleReorder]);

  const moveItem = useCallback((draggedId: string, targetFolderId: string | null, beforeItemId?: string) => {
    const dragged = items.find(c => c.id === draggedId);
    if (!dragged) return;

    const others = items.filter(c => c.id !== draggedId);
    const updated = { ...dragged, folder_id: targetFolderId };
    const siblings = others.filter(c => (c.folder_id ?? null) === targetFolderId).sort(sortByPosition);

    const foundIndex = beforeItemId ? siblings.findIndex(c => c.id === beforeItemId) : -1;
    const insertIndex = foundIndex >= 0 ? foundIndex : siblings.length;
    siblings.splice(insertIndex, 0, updated);

    const rest = others.filter(c => (c.folder_id ?? null) !== targetFolderId);
    commitOrder([...rest, ...siblings], sortedFolders);
  }, [items, commitOrder, sortedFolders]);

  const moveFolder = useCallback((draggedId: string, beforeFolderId: string) => {
    if (draggedId === beforeFolderId) return;
    const dragged = sortedFolders.find(f => f.id === draggedId);
    if (!dragged) return;
    const next = sortedFolders.filter(f => f.id !== draggedId);
    const foundIndex = next.findIndex(f => f.id === beforeFolderId);
    next.splice(foundIndex >= 0 ? foundIndex : next.length, 0, dragged);
    commitOrder(items, next);
  }, [sortedFolders, items, commitOrder]);

  const handleDrop = (e: React.DragEvent, target: { type: 'folder' | 'item' | 'root'; id: string | null; folderId?: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (!dragItem) return;

    if (dragItem.type === 'folder') {
      if (target.type === 'folder' && target.id) moveFolder(dragItem.id, target.id);
    } else if (target.type === 'folder') {
      moveItem(dragItem.id, target.id);
    } else if (target.type === 'item') {
      moveItem(dragItem.id, target.folderId ?? null, target.id || undefined);
    } else {
      moveItem(dragItem.id, null);
    }
    setDragItem(null);
  };

  const allowDrop = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(key);
  };

  const renderItem = (item: SidebarItem) => (
    <div
      key={item.id}
      className={`conversation-item ${activeItem?.id === item.id ? 'active' : ''} ${dropTarget === `item-${item.id}` ? 'drop-target' : ''}`}
      style={item.color ? { borderLeft: `4px solid ${item.color}` } : undefined}
      draggable={renamingId !== item.id}
      onDragStart={() => setDragItem({ type: 'item', id: item.id })}
      onDragEnd={() => { setDragItem(null); setDropTarget(null); }}
      onDragOver={(e) => allowDrop(e, `item-${item.id}`)}
      onDragLeave={() => setDropTarget(null)}
      onDrop={(e) => handleDrop(e, { type: 'item', id: item.id, folderId: item.folder_id ?? null })}
    >
      {renamingId === item.id ? (
        <div className="rename-input-container">
          <input
            type="text"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleRenameSubmit(item.id)}
            onBlur={() => handleRenameSubmit(item.id)}
            autoFocus
            className="rename-input"
            autoComplete="off"
            data-1p-ignore="true"
            data-lpignore="true"
          />
          <button onClick={() => handleRenameSubmit(item.id)} className="rename-save-btn">✓</button>
          <button onClick={cancelRename} className="rename-cancel-btn">✕</button>
        </div>
      ) : (
        <>
          <div
            onClick={() => handleLoad(item.id)}
            className="conversation-main-content"
            style={{ flex: 1, cursor: 'pointer', padding: '2px 0', overflow: 'hidden' }}
          >
            <span className="conversation-title">{item.title}</span>
          </div>
          <div className="conversation-actions">
            <input
              type="color"
              className="item-color-picker"
              value={item.color || DEFAULT_COLOR}
              onChange={(e) => handleRecolor(item.id, e.target.value)}
              title={isNotesTab ? 'Note color' : 'Conversation color'}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); startRename(item); }}
              className="rename-btn"
              title={isNotesTab ? 'Rename note' : 'Rename conversation'}
            >
              ✏️
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDeleteClick(item); }}
              className="delete-btn"
              title={isNotesTab ? 'Delete note' : 'Delete conversation'}
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
          {!collapsed && (
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${currentTab === 'chats' ? 'active' : ''}`}
                onClick={() => handleTabChange('chats')}
                title="View conversations"
              >
                💬 Chats
              </button>
              <button
                className={`sidebar-tab ${currentTab === 'notes' ? 'active' : ''}`}
                onClick={() => handleTabChange('notes')}
                title="View notes"
              >
                📝 Notes
              </button>
            </div>
          )}

          <div className="sidebar-header-actions">
            {!collapsed && (
              <>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="new-conversation-btn"
                  title={isNotesTab ? 'New note' : 'New conversation'}
                >
                  + {isNotesTab ? 'Note' : 'Chat'}
                </button>
                <button
                  onClick={() => handleFolderCreate('New folder')}
                  className="new-conversation-btn"
                  title="New folder"
                >
                  + Folder
                </button>
              </>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="sidebar-toggle-btn"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? '»' : '«'}
            </button>
          </div>
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
                          handleFolderUpdate(folder.id, { name: folderName.trim() || folder.name });
                          setRenamingFolderId(null);
                        }
                      }}
                      onBlur={() => {
                        handleFolderUpdate(folder.id, { name: folderName.trim() || folder.name });
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
                      onChange={(e) => handleFolderUpdate(folder.id, { color: e.target.value })}
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
                      title={`Delete folder (${isNotesTab ? 'notes' : 'conversations'} are kept)`}
                      onClick={() => { setFolderToDelete(folder); setShowDeleteModal(true); }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {!collapsedFolders.includes(folder.id) && (
                  <div className="folder-children">
                    {folderItems(folder.id).map(renderItem)}
                  </div>
                )}
              </div>
            ))}

            {rootItems.map(renderItem)}
          </div>
        )}

        {!collapsed && <div className="sidebar-resizer" onMouseDown={startResize} title="Drag to resize" />}
      </div>

      {showCreateDialog && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New {isNotesTab ? 'Note' : 'Conversation'}</h3>
            <input
              type="text"
              placeholder={isNotesTab ? 'Note title (optional)' : 'Conversation title (optional)'}
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateSubmit()}
              autoFocus
              autoComplete="off"
            />
            <div className="modal-buttons">
              <button onClick={handleCreateSubmit}>Create</button>
              <button onClick={() => { setShowCreateDialog(false); setNewItemTitle(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>{folderToDelete ? 'Delete Folder' : `Delete ${isNotesTab ? 'Note' : 'Conversation'}`}</h3>
            <p>
              {folderToDelete
                ? `Delete folder "${folderToDelete.name}"? Its ${isNotesTab ? 'notes' : 'conversations'} move back to the root.`
                : `Delete "${itemToDelete?.title}"? This cannot be undone.`}
            </p>
            <div className="modal-buttons">
              <button className="confirm-btn" onClick={confirmDelete}>Delete</button>
              <button className="cancel-btn" onClick={cancelDelete}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ConversationSidebar.displayName = 'ConversationSidebar';

export default ConversationSidebar;

"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect, type RefObject } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotebook } from '@/context/NotebookContext';
import { useRouter } from 'next/navigation';
import { FiAlertCircle, FiPlus, FiLogOut, FiTrash2, FiMenu, FiCopy, FiCheck, FiX, FiInfo, FiShare2, FiLink, FiLock } from 'react-icons/fi';
import Link from 'next/link';
import { FaRegEdit } from 'react-icons/fa';
import Editor from '@/components/Editor';
import Loader from '@/components/Loader';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { ref as dbRef, get, onValue, update } from 'firebase/database';
import { rtdb, db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

// Debug flag for editor-related logs (disabled in production)
const DEBUG_EDITOR = false;

type BasicItem = { id: string; name: string; [key: string]: any };

type PanelProps = {
  title: string;
  items: BasicItem[];
  selectedItem: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<any> | any;
  placeholder: string;
  disabled?: boolean;
  showSort?: boolean;
  sortBy?: 'updated' | 'created' | 'custom';
  onChangeSort?: (val: 'updated' | 'created' | 'custom') => void;
  onRename?: (id: string, name: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  scrollable?: boolean;
  loading?: boolean;
  enableDrag?: boolean;
  onReorder?: (ids: string[]) => void | Promise<void>;
  isDeleting?: (id: string) => boolean;
  // Optional moving indicator for a specific item (e.g., moving a page to secret)
  isMoving?: (id: string) => boolean;
};

const Panel = ({
  title,
  items,
  selectedItem,
  onSelect,
  onCreate,
  placeholder,
  disabled = false,
  showSort = false,
  sortBy = 'updated',
  onChangeSort,
  onRename,
  onDelete,
  scrollable = true,
  loading = false,
  enableDrag = false,
  onReorder,
  isDeleting,
  isMoving,
}: PanelProps) => {
  const [newItemName, setNewItemName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const createBoxRef = useRef<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<'above' | 'below' | null>(null);

  const singularLabel = (() => {
    const base = title.toLowerCase();
    return base.endsWith('s') ? base.slice(0, -1) : base;
  })();

  const normalize = (s: string) => s.trim().toLowerCase();
  const isDuplicate = newItemName.trim().length > 0 && items.some((it) => normalize(it.name) === normalize(newItemName));

  const handleCreate = async () => {
    const name = newItemName.trim();
    if (!name) return;
    if (isDuplicate) return;
    setIsCreating(false);
    setNewItemName('');
    try {
      await onCreate(name);
    } catch (error) {
  // console.error('Error creating item:', error);
      setIsCreating(true);
      setNewItemName(name);
    }
  };

  useEffect(() => {
    if (!isCreating) return;
    const onDown = (e: MouseEvent) => {
      if (createBoxRef.current && !createBoxRef.current.contains(e.target as Node)) {
        setIsCreating(false);
        setNewItemName('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isCreating]);

  return (
    <div className="flex flex-col h-full border-r border-gray-200 bg-white text-gray-900">
      <div className="p-3 border-b border-gray-200 flex justify-between items-center">
        <h3 className="font-medium text-gray-800">{title}</h3>
        <div className="flex items-center gap-2">
          {showSort && (
            <select
              className="text-sm border border-gray-200 rounded px-2 py-1 text-gray-700 bg-white"
              value={sortBy}
              onChange={(e) => onChangeSort && onChangeSort(e.target.value as 'updated' | 'created' | 'custom')}
              title="Sort pages"
            >
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="custom">Custom</option>
            </select>
          )}
          <button
            onClick={() => {
              if (!disabled) {
                setNewItemName('');
                setIsCreating(true);
              }
            }}
            className={`text-gray-500 hover:text-gray-700 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={disabled ? 'Select parent item first' : `Add ${title.toLowerCase()}`}
            disabled={disabled}
          >
            <FiPlus size={18} />
          </button>
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${scrollable ? 'overflow-y-auto scrollbar-on-hover' : ''}`}>
        {disabled ? (
          <div className="p-4 text-center text-gray-400 text-sm">{placeholder}</div>
        ) : loading ? (
          <div className="flex-1 p-3 flex justify-center"><Loader size="sm" align="start" /></div>
        ) : items.length === 0 ? (
          isCreating ? (
            <div ref={createBoxRef} className="p-2 border-t border-gray-100">
              <input
                type="text"
                autoFocus
                className={`w-full p-1 text-sm border rounded ${isDuplicate ? 'border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500'}`}
                placeholder={`Enter ${singularLabel} name`}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                inputMode="text"
                aria-label={`Enter ${singularLabel} name`}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (isDuplicate || !newItemName.trim()) { e.preventDefault(); return; }
                    handleCreate();
                  }
                  if (e.key === 'Escape') { setIsCreating(false); setNewItemName(''); }
                }}
              />
              {isDuplicate && (
                <div className="mt-1 text-xs text-red-600">{`${title.slice(0, -1)} with this name already exists`}</div>
              )}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 text-sm">{placeholder}</div>
          )
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li
                key={item.id}
                className={`group relative p-3 hover:bg-gray-50 cursor-pointer ${selectedItem === item.id ? 'bg-blue-50' : ''}`}
                onClick={() => {
                  if (editingId) return;
                  onSelect(item.id);
                }}
                draggable={enableDrag}
                onDragStart={(e) => {
                  if (!enableDrag) return;
                  setDraggingId(item.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  if (!enableDrag || draggingId === null) return;
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLLIElement).getBoundingClientRect();
                  const midpoint = rect.top + rect.height / 2;
                  const pos = e.clientY < midpoint ? 'above' : 'below';
                  setDragOverId(item.id);
                  setDragOverPosition(pos);
                }}
                onDrop={(e) => {
                  if (!enableDrag || draggingId === null) return;
                  e.preventDefault();
                  const fromId = draggingId;
                  const targetId = item.id;
                  const position = dragOverPosition || 'above';
                  const currentIds = items.map((it) => it.id);
                  const filtered = currentIds.filter((id) => id !== fromId);
                  const targetIndex = filtered.indexOf(targetId);
                  if (targetIndex === -1) return;
                  const insertIndex = targetIndex + (position === 'below' ? 1 : 0);
                  const newIds = filtered.slice();
                  newIds.splice(insertIndex, 0, fromId);
                  setDraggingId(null);
                  setDragOverId(null);
                  setDragOverPosition(null);
                  onReorder && onReorder(newIds);
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                  setDragOverPosition(null);
                }}
              >
                {enableDrag && dragOverId === item.id && dragOverPosition === 'above' && (
                  <div className="absolute left-0 right-0 top-0 h-0.5 bg-indigo-500" />
                )}
                {enableDrag && dragOverId === item.id && dragOverPosition === 'below' && (
                  <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-indigo-500" />
                )}
                {editingId === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      className="w-full p-1 text-sm border rounded"
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      inputMode="text"
                      aria-label={`Rename ${title.slice(0, -1)}`}
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const name = editingValue.trim();
                          if (name && onRename) await onRename(item.id, name);
                          setEditingId(null);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      onBlur={async () => {
                        const name = editingValue.trim();
                        if (name && onRename) await onRename(item.id, name);
                        setEditingId(null);
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <div className={`truncate text-gray-800 pr-16 ${draggingId === item.id ? 'opacity-50' : ''}`}>{item.name}</div>
                    <div className={`absolute right-2 top-1/2 -translate-y-1/2 items-center gap-1 ${(isDeleting && isDeleting(item.id)) || (isMoving && isMoving(item.id)) ? 'flex' : 'hidden group-hover:flex'}`}>
                      {/* Show only a spinner while moving */}
                      {isMoving && isMoving(item.id) ? (
                        <span className="inline-block w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" title="Moving…" />
                      ) : (
                        <>
                          {/* When deleting, show only the loader (no rename/delete buttons) */}
                          {isDeleting && isDeleting(item.id) ? (
                            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" title="Deleting…" />
                          ) : (
                            <>
                              {onRename && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(item.id);
                                    setEditingValue(item.name);
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-600"
                                  title={`Rename ${title.slice(0, -1)}`}
                                >
                                  <FaRegEdit size={14} />
                                </button>
                              )}
                              {onDelete && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const ok = window.confirm(`Delete this ${title.slice(0, -1)}? This cannot be undone.`);
                                    if (ok) onDelete(item.id);
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 text-red-600"
                                  title={`Delete ${title.slice(0, -1)}`}
                                >
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
            {enableDrag && draggingId && (
              <li
                className="relative h-6"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(null);
                  setDragOverPosition('below');
                }}
                onDrop={() => {
                  if (!enableDrag || draggingId === null) return;
                  const currentIds = items.map((it) => it.id);
                  const filtered = currentIds.filter((id) => id !== draggingId);
                  const newIds = filtered.concat(draggingId);
                  setDraggingId(null);
                  setDragOverId(null);
                  setDragOverPosition(null);
                  onReorder && onReorder(newIds);
                }}
              >
                {dragOverId === null && dragOverPosition === 'below' && (
                  <div className="absolute left-0 right-0 top-0 h-0.5 bg-indigo-500" />
                )}
              </li>
            )}
          </ul>
        )}

        {isCreating && !disabled && items.length > 0 && (
          <div ref={createBoxRef} className="p-2 border-t border-gray-100">
            <input
              type="text"
              autoFocus
              className={`w-full p-1 text-sm border rounded ${isDuplicate ? 'border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500'}`}
              placeholder={`Enter ${singularLabel} name`}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              inputMode="text"
              aria-label={`Enter ${singularLabel} name`}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (isDuplicate || !newItemName.trim()) { e.preventDefault(); return; }
                  handleCreate();
                }
                if (e.key === 'Escape') { setIsCreating(false); setNewItemName(''); }
              }}
            />
            {isDuplicate && (
              <div className="mt-1 text-xs text-red-600">{`${title.slice(0, -1)} with this name already exists`}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function NotebooksPage() {
  const [hierarchyVisible, setHierarchyVisible] = useState(false);
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement | null>(null);
  // Sentinel placed on the main header; we align overlay to its bottom for a consistent offset
  const topSentinelRef = useRef<HTMLElement | null>(null);
  const [overlayTop, setOverlayTop] = useState<number | null>(null);
  const [pageSortBy, setPageSortBy] = useState<'updated' | 'created' | 'custom'>(() => {
    if (typeof window === 'undefined') return 'updated';
    try {
      const last = window.localStorage.getItem('onenot:pageSortBy:last');
      if (last === 'updated' || last === 'created' || last === 'custom') return last;
    } catch {}
    return 'updated';
  });

  // Compute top offset synchronously
  const computeOverlayTop = useCallback(() => {
    if (typeof window === 'undefined') return 0;
    // 1) Preferred: bottom of slim header row
    const slim = topSentinelRef.current;
    if (slim) {
      const r = slim.getBoundingClientRect();
      const v = Math.max(0, Math.round(r.bottom));
      if (v > 0) return v;
    }
    // 2) Fallback: global page header bottom + estimated slim height
    const pageHeader = document.querySelector('header');
    if (pageHeader) {
      const r = (pageHeader as HTMLElement).getBoundingClientRect();
      const v = Math.max(0, Math.round(r.bottom + 40)); // slim row ~40px
      if (v > 0) return v;
    }
    // 3) Fallback: top of main content area
    const el = mainRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const v = Math.max(0, Math.round(r.top));
      if (v > 0) return v;
    }
    // 4) Safe default so overlay never starts at the very top
    return 56;
  }, []);

  const measureOverlayTop = useCallback(() => {
    if (typeof window === 'undefined') return;
    const t = computeOverlayTop();
    setOverlayTop(t);
  }, [computeOverlayTop]);

  // Helper to open the hierarchy overlay in a consistent, measured way
  const openHierarchyOverlay = useCallback(() => {
    const t = computeOverlayTop();
    setOverlayTop(t);
    setHierarchyVisible(true);
    // ensure the transform transition is applied after mount
    requestAnimationFrame(() => setHierarchyOpen(true));
  }, [computeOverlayTop]);

  // Measure immediately before paint when overlay is (about to be) visible
  useLayoutEffect(() => {
    if (!hierarchyVisible) return;
    measureOverlayTop();
    const onResize = () => measureOverlayTop();
    const onScroll = () => measureOverlayTop();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [hierarchyVisible, measureOverlayTop]);

  // Set an initial measurement once the DOM is ready, so first render after reload aligns correctly
  // Always measure after hydration, and before overlay is shown
  useLayoutEffect(() => {
    measureOverlayTop();
    // Schedule a next-frame measure to catch late layout shifts (fonts, images)
    const id = requestAnimationFrame(() => measureOverlayTop());
    return () => cancelAnimationFrame(id);
  }, [measureOverlayTop]);
  // Lock background scroll while overlay is open
  useEffect(() => {
    if (hierarchyVisible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [hierarchyVisible]);

  const { user, loading: authLoading, signOut } = useAuth();
  const {
    notebooks,
    sections,
    topics,
    pages,
    selectedNotebook,
    selectedSection,
    selectedTopic,
    selectedPage,
    loading: notebookLoading,
    sectionsLoading,
    topicsLoading,
    pagesLoading,
    createNotebook,
    createSection,
    createTopic,
    createPage,
    renameNotebook,
    deleteNotebook,
    renameSection,
    deleteSection,
    renameTopic,
    deleteTopic,
    renamePage,
    deletePage,
    reorderSections,
    reorderTopics,
    reorderPages,
    selectNotebook,
    selectSection,
    selectTopic,
    selectPage,
    getPageContent,
  updatePageContent,
  } = useNotebook();

  // Persist sort preference across sessions (per user)
  const sortStorageKey = useMemo(() => {
    const uid = user?.uid;
    return uid ? `onenot:pageSortBy:${uid}` : '';
  }, [user?.uid]);

  // Load saved sort on mount/auth change
  const didHydrateSortRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (sortStorageKey) {
        const saved = window.localStorage.getItem(sortStorageKey);
        if (saved === 'updated' || saved === 'created' || saved === 'custom') {
          setPageSortBy(saved);
          didHydrateSortRef.current = true;
          return;
        }
      }
      // If no saved preference per user, infer from data: prefer 'custom' when order metadata exists
      if (pages && pages.length > 0 && pages.some(p => typeof p.order === 'number')) {
        setPageSortBy('custom');
      }
      didHydrateSortRef.current = true;
    } catch {
      didHydrateSortRef.current = true;
    }
  }, [sortStorageKey, pages]);

  // Save sort whenever it changes
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipFirstSaveRef.current) {
      // Skip saving on the very first run to avoid clobbering defaults (e.g., writing 'updated' as last)
      skipFirstSaveRef.current = false;
      return;
    }
    try {
      if (sortStorageKey) {
        window.localStorage.setItem(sortStorageKey, pageSortBy);
      }
      // Always maintain a global last for pre-auth/default usage, but only after first-run skip
      window.localStorage.setItem('onenot:pageSortBy:last', pageSortBy);
    } catch {}
  }, [pageSortBy, sortStorageKey]);

  // Removed noisy selection logging

  // Selections state for drawer logic and hint
  const allSelected = Boolean(selectedNotebook && selectedSection && selectedTopic);
  // Auto-open should happen whenever one or more selections are missing
  // Only show the next needed step instead of listing all missing
  const hierarchyHint = !selectedNotebook
    ? 'Select notebook'
    : !selectedSection
    ? 'Select section'
    : !selectedTopic
    ? 'Select topic'
    : 'All selected';

  // Auto-open drawer initially if nothing selected (runs once)
  const autoOpenRef = useRef(false);
  useEffect(() => {
    if (autoOpenRef.current) return;
    // Wait until auth has resolved and user is present so the full layout exists
    if (authLoading || !user) return;
    if (!allSelected) {
      openHierarchyOverlay();
      autoOpenRef.current = true;
    }
  }, [allSelected, openHierarchyOverlay, authLoading, user]);
  
  // Derived sorted pages for display
  const sortedPages = (pages || []).slice().sort((a, b) => {
    if (pageSortBy === 'custom') {
      const ao = a.order ?? a.createdAt ?? 0;
      const bo = b.order ?? b.createdAt ?? 0;
      return ao - bo;
    }
    if (pageSortBy === 'created') {
      // Oldest first when sorting by created
      return (a.createdAt || 0) - (b.createdAt || 0);
    }
    // Newest first when sorting by updated
    return (b.lastUpdated || 0) - (a.lastUpdated || 0);
  });
  
  // Type guard to check if selectedPage is a string or an object with an id
  const getPageId = (page: string | { id: string } | null): string | null => {
    if (!page) return null;
    return typeof page === 'string' ? page : page.id;
  };
  
  const router = useRouter();
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState<boolean>(false);
  const [viewOnlyEnabled, setViewOnlyEnabled] = useState<boolean>(false);
  // Editable page title state
  const [pageTitle, setPageTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  // Track when the title input is actively being edited to control live list override
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  // Editor binds directly to `content`
  const lastSavedRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contentReady, setContentReady] = useState(false);
  const [copied, setCopied] = useState(false);
  // Write with AI state (editor only)
  const [aiVisible, setAiVisible] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  // Share state for current page
  const [shareId, setShareId] = useState<string | null>(null);
  const [shareCanEdit, setShareCanEdit] = useState<boolean>(false);
  const [shareLoading, setShareLoading] = useState<boolean>(false);
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Share link input focus/copy helpers
  const shareLinkInputRef = useRef<HTMLInputElement | null>(null);
  const [shareJustCopied, setShareJustCopied] = useState(false);
  // Refs for click-outside close behavior
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);
  const sharePopoverRef = useRef<HTMLDivElement | null>(null);
  // Secret vault availability
  const [hasSecretVault, setHasSecretVault] = useState(false);
  // Moving loader for "move to secret"
  const [movingPageId, setMovingPageId] = useState<string | null>(null);
  // Local deleting state for per-item delete spinners (pages list)
  const [localDeleting, setLocalDeleting] = useState<Set<string>>(new Set());
  const [localDeletingNotebooks, setLocalDeletingNotebooks] = useState<Set<string>>(new Set());
  const [localDeletingSections, setLocalDeletingSections] = useState<Set<string>>(new Set());
  const [localDeletingTopics, setLocalDeletingTopics] = useState<Set<string>>(new Set());
  // Removed HeadingsNav feature; keep layout refs minimal
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const editorWrapRef = useRef<HTMLDivElement | null>(null);

  // Cover/Unsplash removed

  // Keep a stable ref for pages so onUpdate doesn't change identity on metadata updates (e.g., cover changes)
  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  // Handle content changes and auto-save
  const handleContentChange = useCallback((newContent: string) => {
    // Ignore if identical to current state to avoid loops
    setContent((prev) => (prev === newContent ? prev : newContent));
    setError(null);

    // Debounce saves to avoid thrashing
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      const pageId = getPageId(selectedPage);
      if (!pageId) return;
  // If page was deleted or no longer in list, do not attempt to save
  if (!pagesRef.current.find(p => p.id === pageId)) return;

      // Only save when actual content differs from last saved
      if (lastSavedRef.current === newContent) return;

      setIsSaving(true);
      updatePageContent(pageId, newContent)
        .then(() => {
          lastSavedRef.current = newContent;
        })
        .catch((err) => {
          setError('Failed to save changes. Please try again.');
        })
        .finally(() => setIsSaving(false));
    }, 600);
  }, [selectedPage, updatePageContent]);

  // Initialize the editor
  // Editor ref
  const editorRef = useRef<TiptapEditor | null>(null);

  // Handle editor ready
  const handleEditorReady = (editor: TiptapEditor) => {
    editorRef.current = editor;
  };

  // Append streamed text into the editor at the current cursor position
  const appendToEditor = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor || !text) return;
    const chain = editor.chain().focus();
    chain.insertContent(text).run();
  }, []);

  const stopAI = useCallback(() => {
    try { aiAbortRef.current?.abort(); } catch {}
    aiAbortRef.current = null;
    setAiRunning(false);
  }, []);

  const triggerAI = useCallback(async () => {
    if (aiRunning) return;
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiRunning(true);
    const controller = new AbortController();
    aiAbortRef.current = controller;
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
        credentials: 'include',
      });
      if (!res.ok || !res.body) throw new Error('Failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        if (chunk) appendToEditor(chunk);
      }
    } catch (e: any) {
      // aborted or failed; ignore
    } finally {
      setAiRunning(false);
      aiAbortRef.current = null;
    }
  }, [aiPrompt, aiRunning, appendToEditor]);

  // No custom bubble menu here; the Editor component provides contextual menus.

  // Editor configuration - only used on client side (memoized)
  const editorConfig = useMemo(() => ({
    editorProps: {
      attributes: {
        // Left, top, and right spacing for a cleaner canvas (Notion-like)
        // Keep left-aligned (no mx-auto) so the left gutter is visible
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-8 pt-10 pl-16 pr-16 h-full',
      },
    },
    autofocus: false,
    // Force client-side only rendering
    immediatelyRender: false,
    // Disable SSR for the editor
    enableInputRules: false,
    enablePasteRules: false,
    // Rely on Editor default extensions; add extras here only if not already included.
    editable: !viewOnlyEnabled,
  }), [viewOnlyEnabled]);
  
  // Spellcheck is controlled inside the Editor component via props
  
  // Formatting functions are handled inside the Editor's contextual menus

  // Removed: editorContent mirror state; Editor consumes `content` directly

  // Redirect to home if not authenticated (logout should land on /)
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);
  
  // Clear any pending save on unmount
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  // Close Share popover on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!shareOpen) return;
      const t = e.target as Node;
      const insidePopover = sharePopoverRef.current && sharePopoverRef.current.contains(t);
      const insideButton = shareBtnRef.current && shareBtnRef.current.contains(t);
      if (!insidePopover && !insideButton) {
        setShareOpen(false);
  setShareError(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [shareOpen]);

  // Subscribe to whether user has a secret vault (password set)
  useEffect(() => {
    if (!user?.uid) { setHasSecretVault(false); return; }
    const r = dbRef(rtdb, `users/${user.uid}/secret/password`);
    const unsub = onValue(r, (snap) => {
      setHasSecretVault(snap.exists() && typeof snap.val() === 'string' && snap.val());
    }, () => setHasSecretVault(false));
    return () => { try { unsub(); } catch {} };
  }, [user?.uid]);

  // Removed auto-clear error effect so errors persist until addressed

  // Load page content when selected page changes (robust to sync/async errors)
  useEffect(() => {
    const pageId = getPageId(selectedPage);
    setContentReady(false);
    let cancelled = false;

  const load = async () => {
      if (!pageId) {
        setContent('');
        lastSavedRef.current = '';
        setContentReady(true);
        return;
      }
      try {
        const html = await Promise.resolve(getPageContent(pageId));
        if (cancelled) return;
        const val = html ?? '';
        setContent(val);
        lastSavedRef.current = val;
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to load page content');
        setContent('');
        lastSavedRef.current = '';
      } finally {
        if (!cancelled) setContentReady(true);
      }
    };

    load();
    return () => { cancelled = true; };
    // getPageContent is stable from context
  }, [selectedPage, getPageContent]);

  // Keep editable title in sync with selected page and subscribe to share status live
  useEffect(() => {
    const id = getPageId(selectedPage);
    const current = id ? pages.find((p) => p.id === id) : null;
    setPageTitle(current?.name || '');
    setTitleError(null);
    // Reset share info when page changes
    setShareLoading(true);
    setShareId(null);
    setShareCanEdit(false);
    // Subscribe to RTDB shared link for this page to update dynamically
    if (!id || !user?.uid) { setShareLoading(false); return; }
    const r = dbRef(rtdb, `users/${user.uid}/sharedLinks/${id}`);
    const unsub = onValue(r, (snap) => {
      const v = (snap.exists() ? snap.val() : null) as { link?: string; canEdit?: boolean } | null;
      if (v && v.link) {
        setShareId(v.link);
        setShareCanEdit(!!v.canEdit);
      } else {
        setShareId(null);
        setShareCanEdit(false);
      }
      setShareLoading(false);
    }, () => setShareLoading(false));
    return () => {
      try { unsub(); } catch {}
    };
  }, [selectedPage]); // keep deps size stable; reacts on page switch

  const commitTitle = async () => {
    const id = getPageId(selectedPage);
    if (!id) return;
    const name = pageTitle.trim();
    const original = pages.find((p) => p.id === id)?.name || '';
    if (!name) {
      setPageTitle(original);
      setTitleError(null);
      setIsTitleEditing(false);
      return;
    }
    const dup = pages.some((p) => p.id !== id && (p.name || '').trim().toLowerCase() === name.toLowerCase());
    if (dup) {
      setTitleError('A page with this name already exists');
      return;
    }
    if (name === original) return;
  try {
      setIsRenaming(true);
      await renamePage(id, name);
      setTitleError(null);
    } catch (e) {
      setTitleError('Failed to rename page');
    } finally {
      setIsRenaming(false);
      setIsTitleEditing(false);
    }
  };

  // Live UI override: while typing a new title, reflect it in the Pages list without committing
  const uiPages = useMemo(() => {
    const id = getPageId(selectedPage);
    if (!id) return sortedPages;
    // Only override while user is actively editing the title to avoid transient mismatches on selection change
    if (!isTitleEditing) return sortedPages;
    const newName = pageTitle;
    return sortedPages.map((p) => (p.id === id ? { ...p, name: newName } : p));
  }, [sortedPages, selectedPage, pageTitle, isTitleEditing]);

  const selectedPageObj = useMemo(() => {
    const id = getPageId(selectedPage);
    return id ? pages.find((p) => p.id === id) || null : null;
  }, [selectedPage, pages]);

  // Cover/Unsplash removed

  // No effect needed; initial seed is set in state init to avoid hook-array size issues on HMR

  // If the currently selected page disappears from the list (deleted), cancel pending save
  useEffect(() => {
    const pageId = getPageId(selectedPage);
    if (pageId && !pages.find(p => p.id === pageId)) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    }
  }, [pages, selectedPage]);

  // Removed duplicate auto-save effect; handleContentChange is already debounced and called by editor onUpdate
  
  // Handle page creation with proper error handling and feedback
  const handleCreatePage = async (name: string) => {
  try {
      setError(null);
      const newId = await createPage(name);
      // Select the newly created page
      if (newId) selectPage(newId);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create page');
    }
  };

  if (authLoading || notebookLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="xl" text="Loading your notes..." />
      </div>
    );
  }
  // When logged out, don't show the notes loader; redirect effect above will navigate away
  if (!user) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {/* Header with hamburger on the left of the title */}
      <header className="bg-white shadow-sm z-10" ref={topSentinelRef}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!hierarchyVisible) {
                  openHierarchyOverlay();
                  return;
                }
                if (!hierarchyOpen) {
                  measureOverlayTop();
                  setHierarchyOpen(true);
                  return;
                }
                if (!allSelected) return;
                setHierarchyOpen(false);
                setTimeout(() => setHierarchyVisible(false), 250);
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-700"
              title="Open notebooks/sections/topics"
              aria-label="Open hierarchy"
            >
              <FiMenu />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">OneNot</h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* User avatar dropdown */}
            <UserMenu email={user?.email || ''} onLogout={signOut} />
          </div>
        </div>
      </header>

    {/* Main content: Pages always visible on the left; editor on the right */}
  <div ref={mainRef} className="flex flex-1 overflow-hidden">
    {/* Pages panel */}
    <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden text-gray-900">
          <Panel
            title="Pages"
            items={uiPages}
            selectedItem={selectedPage}
            onSelect={selectPage}
            onCreate={handleCreatePage}
            placeholder="No pages yet. Create one to get started!"
            disabled={!selectedTopic}
      showSort
      sortBy={pageSortBy}
      onChangeSort={setPageSortBy}
            onRename={renamePage}
            onDelete={async (id) => {
              // Provide a local deleting state so the trash button shows a spinner
              setLocalDeleting((prev) => new Set(prev).add(id));
              try {
                // Optimistically unselect and clear editor if this page is currently open
                const curId = getPageId(selectedPage);
                if (curId === id) {
                  selectPage(null);
                  setContent('');
                  setContentReady(true);
                }
                await deletePage(id);
              } finally {
                setLocalDeleting((prev) => { const n = new Set(prev); n.delete(id); return n; });
              }
            }}
            isDeleting={(id) => localDeleting.has(id)}
            isMoving={(id) => movingPageId === id}
            loading={Boolean(selectedTopic) && pagesLoading}
            enableDrag
            onReorder={(ids) => { setPageSortBy('custom'); reorderPages(ids); }}
          />
        </div>

        {/* Editor area: make the entire right pane scrollable so the scrollbar sits at the far right */}
  <div className="flex-1 overflow-y-auto" ref={scrollRootRef}>
          <div className="p-6 md:p-8">
            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
                <FiAlertCircle className="mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Removed success toast message */}

            {selectedPage ? (
              <div className="min-h-[500px] flex flex-col max-w-4xl mx-auto w-full">
                {/* Cover/Unsplash removed */}
                <div className="group mb-1 flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    {/* Cover/Unsplash removed */}
          <input
                      type="text"
                      value={pageTitle}
                      onChange={(e) => { setPageTitle(e.target.value); if (titleError) setTitleError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                        if (e.key === 'Escape') {
                          const id = getPageId(selectedPage);
                          const original = id ? pages.find((p) => p.id === id)?.name || '' : '';
                          setPageTitle(original);
                          setTitleError(null);
              setIsTitleEditing(false);
                        }
                      }}
            onFocus={() => setIsTitleEditing(true)}
            onBlur={commitTitle}
                      placeholder="Untitled"
                      size={Math.max(1, (pageTitle || 'Untitled').length)}
                      className={`inline-block bg-transparent text-xl font-semibold px-0 py-0.5 border-0 outline-none focus:outline-none focus:ring-0 text-gray-900 ${titleError ? 'ring-0' : ''}`}
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      inputMode="text"
                      aria-label="Page title"
                      disabled={isRenaming || viewOnlyEnabled}
                    />
                    {titleError && (
                      <div className="mt-1 text-xs text-red-600">{titleError}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
                      onClick={() => setShareOpen((v) => !v)}
                      ref={shareBtnRef}
                      title="Share"
                    >
                      <FiShare2 size={14} /> Share
                    </button>
                    {hasSecretVault && (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 p-1.5 text-xs rounded-md border ${movingPageId ? 'border-indigo-300 text-indigo-700 bg-indigo-50' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                        title={movingPageId ? 'Moving…' : 'Move to secret'}
                        aria-label="Move to secret"
                        onClick={async () => {
                          const pid = getPageId(selectedPage); if (!pid || !user) return;
                          if (!window.confirm('Move this page to your secret vault? It will be removed from this topic (original will not be deleted).')) return;
                          const currentContent = (editorRef.current?.getHTML?.() ?? content) || '';
                          setMovingPageId(pid);
                          // Immediately clear selection and editor UI
                          selectPage(null);
                          setContent('');
                          setContentReady(true);
                          setShareOpen(false);
                          try {
                            // Use server route to avoid client permission issues
                            const doCall = () => fetch('/api/secret-pages/move', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ pageId: pid, notebookId: selectedNotebook || undefined, sectionId: selectedSection || undefined, topicId: selectedTopic || undefined, content: currentContent }),
                            });
                            let resp = await doCall();
                            if (resp.status === 401 && typeof window !== 'undefined') {
                              try {
                                // refresh session cookie
                                const u = (await import('@/lib/firebase')).auth.currentUser;
                                if (u) {
                                  const idToken = await u.getIdToken(true);
                                  await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), credentials: 'include' });
                                  resp = await doCall();
                                }
                              } catch {}
                            }
                            // Grab new secretId, but no need to delete the original Firestore page now
                            try { const data = await resp.json(); /* const secretId = data?.id as string | undefined; */ } catch {}
                            // Remove any shares (best-effort)
                            try { await fetch('/api/share', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageId: pid }), credentials: 'include' }); } catch {}
                          } catch (e) {
                            // ignore
                          } finally { setMovingPageId(null); }
                        }}
                      >
                        {movingPageId ? (
                          <span className="inline-block w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <FiLock size={14} />
                        )}
                      </button>
                    )}
                    {shareOpen && (
                      <div ref={sharePopoverRef} className="absolute right-0 top-8 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-20 p-3" onMouseLeave={() => { /* keep open until click away */ }}>
                        <div className="mb-2 text-sm font-medium text-gray-800">Share page</div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-xs text-gray-600">Can edit</div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={shareCanEdit}
                            disabled={shareLoading}
                            onClick={async () => {
                              const next = !shareCanEdit;
                              setShareCanEdit(next);
                              if (shareId) {
                                try {
                                  setShareLoading(true);
                                  const res = await fetch(`/api/share/${shareId}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ canEdit: next }),
                                    credentials: 'include',
                                  });
                                  if (!res.ok) throw new Error('Failed');
                                } catch {}
                                finally { setShareLoading(false); }
                              }
                            }}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${shareCanEdit ? 'bg-indigo-600' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${shareCanEdit ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        {/* Generate / Link box */}
                        {shareLoading ? (
                          <div className="w-full flex items-center justify-center py-2">
                            <Loader size="sm" align="center" />
                          </div>
                        ) : !shareId ? (
                          <button
                            type="button"
                            disabled={!selectedPageObj || shareLoading}
                            onClick={async () => {
                              const pid = getPageId(selectedPage);
                              if (!pid) return;
                              try {
                                setShareLoading(true);
                                const res = await fetch('/api/share', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ pageId: pid, canEdit: shareCanEdit }),
                                  credentials: 'include',
                                });
                                if (!res.ok) throw new Error((await res.json()).error || 'Failed to create share');
                                const data = await res.json();
                                const id = data.id as string;
                                if (id) {
                                  setShareId(id);
                                  const url = `${window.location.origin}/share/${id}`;
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    setShareJustCopied(true);
                                    setTimeout(() => setShareJustCopied(false), 1200);
                                  } catch {}
                                  // ensure popover remains open and UI switches to input immediately
                                  setShareOpen(true);
                                }
                              } catch (e) {
                                // ignore
                              } finally {
                                setShareLoading(false);
                              }
                            }}
                            className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            <FiLink size={16} /> Generate link
                          </button>
                        ) : (
                          <div className="w-full">
                            <div className="flex items-center gap-2">
                            <input
                              ref={shareLinkInputRef}
                              type="text"
                              readOnly
                              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareId}`}
                              onFocus={(e) => e.currentTarget.select()}
                              onClick={(e) => e.currentTarget.select()}
                              className="flex-1 text-xs border border-gray-300 rounded px-2 py-2 text-gray-700 bg-gray-50"
                            />
                            <button
                              type="button"
                              title="Copy link"
                              className={`p-2 rounded border ${shareJustCopied ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                              onClick={async () => {
                                const url = `${window.location.origin}/share/${shareId}`;
                                try { await navigator.clipboard.writeText(url); setShareJustCopied(true); setTimeout(() => setShareJustCopied(false), 1200); } catch {}
                                if (shareLinkInputRef.current) {
                                  // Do not auto-select when copying later; user can click the input to select.
                                  try { /* no-op focus/select */ } catch {}
                                }
                              }}
                            >
                              {shareJustCopied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                            </button>
                            </div>
                            {shareJustCopied && (
                              <div className="mt-1 text-[11px] text-green-700">Link copied</div>
                            )}
                          </div>
                        )}
                        {/* Owner delete action */}
                        {shareId && (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              disabled={shareLoading}
                              onClick={async () => {
                                try {
                                  setShareLoading(true);
                                  const res = await fetch(`/api/share/${shareId}`, { method: 'DELETE', credentials: 'include' });
                                  if (res.ok) {
                                    setShareId(null);
                                    setShareCanEdit(false);
                                  }
                                } catch {}
                                finally { setShareLoading(false); }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-gray-200 text-red-600 hover:bg-red-50"
                            >
                              <FiTrash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {/* Cover/Unsplash removed */}
                {/* Status and controls above editor */}
                <div className="mb-3 flex justify-end items-center gap-4">
                  <div className="text-sm text-gray-500">{isSaving ? 'Saving changes…' : 'Synced'}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 select-none">Spell check</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={spellcheckEnabled}
                      onClick={() => setSpellcheckEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${spellcheckEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      title="Toggle browser spellcheck for the editor"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${spellcheckEnabled ? 'translate-x-4' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 select-none">View only</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={viewOnlyEnabled}
                      onClick={() => setViewOnlyEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${viewOnlyEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      title="Toggle view only mode"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${viewOnlyEnabled ? 'translate-x-4' : 'translate-x-1'}`}
                      />
                    </button>
                  </div>
                </div>
                {/* Copy markup button below sync toggle */}
                <div className="mb-3 flex justify-end">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const editor = editorRef.current;
                          const html = editor?.getHTML?.() ?? content ?? '';
                          const json = editor?.getJSON ? JSON.stringify(editor.getJSON()) : undefined;
                          const temp = document.createElement('div');
                          temp.innerHTML = html;
                          const plain = temp.textContent || temp.innerText || '';
                          const supportsRich = typeof window !== 'undefined' && 'ClipboardItem' in window && typeof navigator.clipboard.write === 'function';
                          if (supportsRich) {
                            const CI: any = (window as any).ClipboardItem;
                            const supports = typeof CI.supports === 'function' ? (type: string) => { try { return CI.supports(type); } catch { return false; } } : undefined;
                            const payload: Record<string, Blob> = {};
                            if (!supports || supports('text/html')) payload['text/html'] = new Blob([html], { type: 'text/html' });
                            if (!supports || supports('text/plain')) payload['text/plain'] = new Blob([plain], { type: 'text/plain' });
                            if (json && supports && supports('application/json')) payload['application/json'] = new Blob([json], { type: 'application/json' });
                            if (Object.keys(payload).length > 0) {
                              try {
                                const item = new CI(payload);
                                await navigator.clipboard.write([item]);
                              } catch {
                                await navigator.clipboard.writeText(html);
                              }
                            } else {
                              await navigator.clipboard.writeText(html);
                            }
                          } else {
                            await navigator.clipboard.writeText(html);
                          }
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1200);
                        } catch (err) {
                          // console.error('Copy failed', err);
                        }
                      }}
                      className={`p-1 rounded border text-gray-600 hover:bg-gray-50 transition transform ${copied ? 'bg-green-50 border-green-200 text-green-700 scale-105' : 'border-gray-200'}`}
                      title="Copy page as markup (HTML)"
                    >
                      {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                    </button>
                    <span className={`pointer-events-none absolute right-0 -top-6 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 shadow transition-all duration-300 ${copied ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
                      Copied
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col mt-4 md:mt-6" ref={editorWrapRef}>
                  <div className="flex-1 relative min-h-[300px] editor-container">
                    {contentReady ? (
                      <Editor
                        ref={editorRef}
                        content={content}
                        resetKey={getPageId(selectedPage) || ''}
                        onUpdate={(newContent: string) => handleContentChange(newContent)}
                        onEditorReady={handleEditorReady}
                        spellcheck={spellcheckEnabled}
                        lang="en-US"
                        className="h-full min-h-[300px] focus:outline-none text-gray-900"
                        config={editorConfig}
                        onRequestAI={() => setAiVisible(true)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader size="lg" text="Loading your notes..." />
                      </div>
                    )}
                    {/* Contextual menus are handled inside the Editor component */}
                  </div>
                </div>
                {/* Lightweight H1 outline rail + hover list */}
                {selectedPage && contentReady && (
                  <HeadingOutline
                    scrollRootRef={scrollRootRef}
                    editorWrapRef={editorWrapRef}
                    contentKey={getPageId(selectedPage) + ':' + (content?.length || 0)}
                  />)
                }
                {/* Write with AI inline prompt now appears inside the slash suggestions (in the Editor component) */}
                {/* Headings navigator removed */}
              </div>
            ) : (
              // After notebook/section/topic are chosen, show contextual guidance
              allSelected ? (
                pagesLoading ? (
                  <div className="h-full flex items-center justify-center"><Loader size="lg" text="Loading pages..." /></div>
                ) : pages.length === 0 ? (
                  <div className="min-h-[300px] max-w-2xl mx-auto w-full mt-12">
                    <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center bg-white">
                      <div className="text-lg font-medium text-gray-800 mb-2">No pages yet</div>
                      <div className="text-sm text-gray-600 mb-4">Create your first page to start writing.</div>
                      <button
                        type="button"
                        onClick={() => handleCreatePage('Untitled Page')}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow"
                      >
                        <FiPlus /> Create a page
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-h-[300px] max-w-2xl mx-auto w-full mt-12">
                    <div className="rounded-lg p-6 text-center bg-white border border-gray-200">
                      <div className="text-base text-gray-700">Select a page from the left to view or edit.</div>
                    </div>
                  </div>
                )
              ) : (
                // Hide hints until the three-step hierarchy is complete
                <div className="h-full" />
              )
            )}
          </div>
        </div>
      </div>
      {/* Overlay for hierarchy selection: left sliding drawer, aligned with Pages top */}
  {hierarchyVisible && overlayTop !== null && (
        <div
          className="fixed inset-x-0"
          style={{ top: overlayTop, bottom: 0, zIndex: 50 }}
        >
          {/* Backdrop with fade */}
          <div
            className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${hierarchyOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => {
              if (!allSelected) return; // do not close until everything is selected
              setHierarchyOpen(false);
              setTimeout(() => setHierarchyVisible(false), 250);
            }}
          />
          {/* Left drawer container with slide-in */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Hierarchy"
            className={`absolute left-0 top-0 h-full w-[44rem] max-w-[95vw] bg-white border-r border-gray-200 shadow-2xl overflow-hidden transform transition-transform duration-300 ease-out ${hierarchyOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
              <div className="text-sm text-gray-700 font-medium">{hierarchyHint}</div>
              <button
                onClick={() => {
                  if (!allSelected) return; // block closing until all chosen
                  setHierarchyOpen(false);
                  setTimeout(() => setHierarchyVisible(false), 250);
                }}
                className={`p-1 rounded ${allSelected ? 'hover:bg-gray-100' : 'opacity-50 cursor-not-allowed'}`}
                aria-label="Close hierarchy"
                title={allSelected ? 'Close' : 'Complete selections to close'}
              >
                <FiX />
              </button>
            </div>
            <div className="h-[calc(100%-41px)] flex">
              {/* Notebooks */}
              <div className="w-64 border-r border-gray-200 h-full">
                <Panel
                  title="Notebooks"
                  items={notebooks}
                  selectedItem={selectedNotebook}
                  onSelect={(id) => { selectNotebook(id); /* keep open to choose deeper */ }}
                  onCreate={createNotebook}
                  placeholder="No notebooks yet"
                  onRename={renameNotebook}
                  onDelete={async (id) => {
                    setLocalDeletingNotebooks((p) => new Set(p).add(id));
                    try { await deleteNotebook(id); } finally {
                      setLocalDeletingNotebooks((p) => { const n = new Set(p); n.delete(id); return n; });
                    }
                  }}
                  isDeleting={(id) => localDeletingNotebooks.has(id)}
                  loading={notebookLoading}
                />
              </div>
              {/* Sections */}
              <div className="w-56 border-r border-gray-200 h-full">
                <Panel
                  title="Sections"
                  items={sections}
                  selectedItem={selectedSection}
                  onSelect={(id) => { selectSection(id); /* keep open to choose topic */ }}
                  onCreate={createSection}
                  placeholder={selectedNotebook ? 'No sections' : 'Select a notebook'}
                  disabled={!selectedNotebook}
                  onRename={renameSection}
                  onDelete={async (id) => {
                    setLocalDeletingSections((p) => new Set(p).add(id));
                    try { await deleteSection(id); } finally {
                      setLocalDeletingSections((p) => { const n = new Set(p); n.delete(id); return n; });
                    }
                  }}
                  isDeleting={(id) => localDeletingSections.has(id)}
                  loading={Boolean(selectedNotebook) && sectionsLoading}
                  enableDrag
                  onReorder={(ids) => { reorderSections(ids); }}
                />
              </div>
              {/* Topics */}
              <div className="w-56 h-full">
                <Panel
                  title="Topics"
                  items={topics}
                  selectedItem={selectedTopic}
                  onSelect={(id) => {
                    selectTopic(id);
                    // Close only if all selected after choosing topic
                    if (selectedNotebook && selectedSection && id) {
                      setHierarchyOpen(false);
                      setTimeout(() => setHierarchyVisible(false), 250);
                    }
                  }}
                  onCreate={createTopic}
                  placeholder={selectedSection ? 'No topics' : 'Select a section'}
                  disabled={!selectedSection}
                  onRename={renameTopic}
                  onDelete={async (id) => {
                    setLocalDeletingTopics((p) => new Set(p).add(id));
                    try { await deleteTopic(id); } finally {
                      setLocalDeletingTopics((p) => { const n = new Set(p); n.delete(id); return n; });
                    }
                  }}
                  isDeleting={(id) => localDeletingTopics.has(id)}
                  loading={Boolean(selectedSection) && topicsLoading}
                  enableDrag
                  onReorder={(ids) => { reorderTopics(ids); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// Simple user avatar dropdown
function UserMenu({ email, onLogout }: { email: string; onLogout: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const initial = (email || '?').trim()[0]?.toUpperCase() || '?';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold cursor-pointer"
        title={email}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20">
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center cursor-pointer border-b border-gray-100"
          >
            <span className="mr-2">👤</span> Account
          </Link>
          <Link
            href="/changelog"
            onClick={() => setOpen(false)}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center cursor-pointer border-b border-gray-100"
          >
            <FiInfo className="mr-2" /> Changelog
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50 flex items-center cursor-pointer"
          >
            <FiLogOut className="mr-2" /> Logout
          </button>
        </div>
      )}
    </div>
  );
}

// Lightweight H1 outline rail component
function HeadingOutline({
  scrollRootRef,
  editorWrapRef,
  contentKey,
}: {
  scrollRootRef: RefObject<HTMLDivElement | null>;
  editorWrapRef: RefObject<HTMLDivElement | null>;
  contentKey: string; // resets when page or content length changes
}) {
  const [headings, setHeadings] = useState<{ id: string; text: string; top: number }[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [hovered, setHovered] = useState(false);
  // Respect reduced-motion for animations (e.g., tick rail movement)
  const [reducedMotion, setReducedMotion] = useState(false);
  // Visual sweep state for right-side list so the blue highlight travels through items
  const [sweeping, setSweeping] = useState(false);
  const [sweepPos, setSweepPos] = useState<number>(-1);
  const sweepTimerRef = useRef<number | null>(null);
  // Dynamic vertical bounds to avoid hovering over controls above the editor
  const [bounds, setBounds] = useState<{ top: number; bottom: number }>({ top: 96, bottom: 96 });
  const lastMeasureKey = useRef<string>('');
  const headingsRef = useRef<{ id: string; text: string; top: number }[]>([]);
  const activeRef = useRef<number>(-1);
  // Use a single, shared header offset for both active detection and scrolling
  const HEADER_OFFSET = 72; // px under any fixed header/toolbar

  // Observe prefers-reduced-motion and update state
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReducedMotion(!!mq.matches);
    apply();
    try { mq.addEventListener('change', apply); } catch { try { (mq as any).addListener(apply); } catch {} }
    return () => { try { mq.removeEventListener('change', apply); } catch { try { (mq as any).removeListener(apply); } catch {} } };
  }, []);

  // Utility: throttle with rAF
  const rafThrottle = useRef<number | null>(null);
  const schedule = (fn: () => void) => {
    if (rafThrottle.current != null) return;
    rafThrottle.current = requestAnimationFrame(() => {
      rafThrottle.current = null;
      fn();
    });
  };

  // Scan editor DOM for H1s and compute their positions relative to the scroll root
  const measure = useCallback(() => {
    const scrollEl = scrollRootRef.current;
    const wrap = editorWrapRef.current;
    if (!scrollEl || !wrap) return;

    const container = wrap.querySelector('.editor-container');
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('h1')) as HTMLElement[];
    const list: { id: string; text: string; top: number }[] = [];
    nodes.forEach((el, i) => {
      // Ensure each h1 has an id for anchor navigation
      if (!el.id) el.id = `h1-${i + 1}`;
      const rect = el.getBoundingClientRect();
      const scrollRect = scrollEl.getBoundingClientRect();
      const top = rect.top - scrollRect.top + scrollEl.scrollTop; // y within scroll container
      const text = (el.textContent || '').trim() || `Heading ${i + 1}`;
      list.push({ id: el.id, text, top });
    });
    // Only update state if headings actually changed (length, ids/texts, or top deltas > 0.5px)
    const prev = headingsRef.current;
    let changed = prev.length !== list.length;
    if (!changed) {
      for (let i = 0; i < list.length; i++) {
        const a = prev[i];
        const b = list[i];
        if (!a || a.id !== b.id || a.text !== b.text || Math.abs(a.top - b.top) > 0.5) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      headingsRef.current = list;
      setHeadings(list);
    }
  }, [scrollRootRef, editorWrapRef]);

  // Compute overlay vertical bounds so the hover zone starts at the editor, not at the top controls
  const measureBounds = useCallback(() => {
    const wrap = editorWrapRef.current as HTMLElement | null;
    const vpH = typeof window !== 'undefined' ? window.innerHeight : 0;
    if (!wrap || !vpH) {
      // Fallback to previous Tailwind top-24/bottom-24 (~96px)
      const next = { top: 96, bottom: 96 };
      setBounds((b) => (b.top !== next.top || b.bottom !== next.bottom ? next : b));
      return;
    }
    const r = wrap.getBoundingClientRect();
    // Clamp to at least 24px margin, but prefer aligning to editor box
    let top = Math.max(24, Math.floor(r.top));
    let bottom = Math.max(24, Math.floor(vpH - r.bottom));
    // Ensure we always leave a minimum visible space for the hover region
    const MIN_VISIBLE = 160; // px
    if (vpH - top - bottom < MIN_VISIBLE) {
      // Try reducing bottom first (down to 24)
      const need = MIN_VISIBLE - (vpH - top - bottom);
      const reducibleBottom = Math.max(0, bottom - 24);
      const reduceB = Math.min(reducibleBottom, need);
      bottom -= reduceB;
      // If still not enough, reduce top (down to 24)
      const remaining = MIN_VISIBLE - (vpH - top - bottom);
      if (remaining > 0) {
        const reducibleTop = Math.max(0, top - 24);
        const reduceT = Math.min(reducibleTop, remaining);
        top -= reduceT;
      }
      // Final guard: if still negative (rare), snap to a safe default margin box
      if (vpH - top - bottom < MIN_VISIBLE) {
        top = Math.min(top, Math.max(24, vpH - MIN_VISIBLE - 24));
        bottom = Math.max(24, vpH - MIN_VISIBLE - top);
      }
    }
    setBounds((b) => (b.top !== top || b.bottom !== bottom ? { top, bottom } : b));
  }, [editorWrapRef]);

  // Initial measure + on dependencies change
  useEffect(() => {
    schedule(measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  // Initial and reactive bounds measure
  useEffect(() => {
    measureBounds();
    const onResize = () => schedule(measureBounds);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measureBounds]);

  // Re-measure on resize (fonts, images inside content)
  useEffect(() => {
    const onResize = () => schedule(measure);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [measure]);

  // Observe minimal mutations to re-measure when headings are edited
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const container = wrap.querySelector('.editor-container');
    if (!container) return;
    const mo = new MutationObserver((muts) => {
      // Only react to child list or character changes inside headings/paragraphs
      if (!muts || muts.length === 0) return;
      schedule(measure);
    });
    mo.observe(container, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [editorWrapRef, measure]);

  // Track active heading while scrolling
  useEffect(() => {
    const scrollEl = scrollRootRef.current;
    if (!scrollEl) return;
    // Also re-measure vertical bounds on scroll so the fixed overlay tracks the editor box
    const onScrollBounds = () => schedule(measureBounds);
    const handler = () => {
      if (headingsRef.current.length === 0) {
        if (activeRef.current !== -1) { activeRef.current = -1; setActiveIndex(-1); }
        return;
      }
      // Support both container and window scrolling
      const containerCanScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
      const scrollTop = containerCanScroll ? scrollEl.scrollTop : (window.scrollY || window.pageYOffset || 0);
      const y = scrollTop + HEADER_OFFSET; // offset under header
      let idx = headingsRef.current.findIndex((h) => y < h.top - 4);
      if (idx === -1) idx = headingsRef.current.length; // below last
      const next = Math.max(0, idx - 1);
      if (next !== activeRef.current) {
        activeRef.current = next;
        setActiveIndex(next);
      }
    };
    const onScroll = () => schedule(handler);
    scrollEl.addEventListener('scroll', onScroll, { passive: true } as any);
    scrollEl.addEventListener('scroll', onScrollBounds, { passive: true } as any);
    // Also listen on window in case the container cannot scroll (small viewports)
    window.addEventListener('scroll', onScroll as any, { passive: true } as any);
    window.addEventListener('scroll', onScrollBounds as any, { passive: true } as any);
    handler();
    return () => {
      scrollEl.removeEventListener('scroll', onScroll as any);
      scrollEl.removeEventListener('scroll', onScrollBounds as any);
      window.removeEventListener('scroll', onScroll as any);
      window.removeEventListener('scroll', onScrollBounds as any);
    };
  }, [scrollRootRef]);

  // IntersectionObserver: keep activeIndex in sync while scrolling (more robust than math-only)
  useEffect(() => {
    const scrollEl = scrollRootRef.current;
    const wrap = editorWrapRef.current;
    if (!scrollEl || !wrap || typeof IntersectionObserver === 'undefined') return;
    const container = wrap.querySelector('.editor-container') as HTMLElement | null;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('h1')) as HTMLElement[];
    if (nodes.length === 0) return;

    // Decide which root scrolls: container or window
    const containerCanScroll = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
    const rootEl: any = containerCanScroll ? scrollEl : null; // null => viewport

    // Observe headings relative to the chosen root, accounting for the fixed header offset
    const io = new IntersectionObserver((entries) => {
      if (!entries || entries.length === 0) return;
      // Pick the entry whose top is closest to the HEADER_OFFSET within the viewport
      let bestIdx = activeRef.current;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const e of entries) {
        const el = e.target as HTMLElement;
        const idx = nodes.indexOf(el);
        if (idx === -1) continue;
        const r = el.getBoundingClientRect();
        const rootR = (rootEl ? rootEl.getBoundingClientRect() : { top: 0, height: window.innerHeight || 0 });
        const top = r.top - (rootEl ? rootR.top : 0); // px from root top
        const dist = Math.abs(top - HEADER_OFFSET);
        // Prefer visible entries; skip those entirely below/above if not intersecting
        if (!e.isIntersecting && top > (rootEl ? rootR.height : (window.innerHeight || 0))) continue;
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
      }
      if (bestIdx !== activeRef.current && bestIdx >= 0) {
        activeRef.current = bestIdx;
        setActiveIndex(bestIdx);
      }
    }, { root: rootEl, rootMargin: `-${HEADER_OFFSET}px 0px -60% 0px`, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] });

    nodes.forEach((n) => io.observe(n));
    // Initial sync
    try { (measure as any)(); } catch {}
    const startTop = containerCanScroll ? scrollEl.scrollTop : (window.scrollY || window.pageYOffset || 0);
    const y = startTop + HEADER_OFFSET;
    let idx = headingsRef.current.findIndex((h) => y < h.top - 4);
    if (idx === -1) idx = headingsRef.current.length;
    const next = Math.max(0, idx - 1);
    if (next !== activeRef.current) { activeRef.current = next; setActiveIndex(next); }

    return () => io.disconnect();
  }, [contentKey, scrollRootRef, editorWrapRef]);

  // Compute active heading immediately after headings are measured/updated
  useEffect(() => {
    const scrollEl = scrollRootRef.current;
    if (!scrollEl) return;
    if (headingsRef.current.length === 0) return;
    const y = scrollEl.scrollTop + HEADER_OFFSET;
    let idx = headingsRef.current.findIndex((h) => y < h.top - 4);
    if (idx === -1) idx = headingsRef.current.length;
    const next = Math.max(0, idx - 1);
    if (next !== activeRef.current) {
      activeRef.current = next;
      setActiveIndex(next);
    }
  }, [headings]);

  // Also recompute when the hover panel opens so selection is visible instantly
  useEffect(() => {
    if (!hovered) return;
    const scrollEl = scrollRootRef.current;
    if (!scrollEl || headingsRef.current.length === 0) return;
    const y = scrollEl.scrollTop + HEADER_OFFSET;
    let idx = headingsRef.current.findIndex((h) => y < h.top - 4);
    if (idx === -1) idx = headingsRef.current.length;
    const next = Math.max(0, idx - 1);
    if (next !== activeRef.current) {
      activeRef.current = next;
      setActiveIndex(next);
    }
  }, [hovered]);

  // Visually highlight the active H1 in the editor
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const container = wrap.querySelector('.editor-container') as HTMLElement | null;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('h1')) as HTMLElement[];
    nodes.forEach((el, i) => {
      if (i === activeRef.current) el.classList.add('active-heading');
      else el.classList.remove('active-heading');
    });
  }, [activeIndex, editorWrapRef]);

  // Re-measure when images inside the editor load (they can shift layout without DOM mutations)
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const container = wrap.querySelector('.editor-container') as HTMLElement | null;
    if (!container) return;
    const imgs = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
    const onImg = () => schedule(measure);
    imgs.forEach((img) => {
      img.addEventListener('load', onImg);
      img.addEventListener('error', onImg);
      // If already loaded, schedule a measure soon
      if (img.complete) schedule(measure);
    });
    return () => {
      imgs.forEach((img) => {
        img.removeEventListener('load', onImg);
        img.removeEventListener('error', onImg);
      });
    };
  }, [editorWrapRef, contentKey, measure]);

  // Re-measure when the editor container resizes (e.g., fonts applied, image intrinsic size changes)
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const container = wrap.querySelector('.editor-container') as HTMLElement | null;
    if (!container) return;
    const ro = new ResizeObserver(() => schedule(measure));
    ro.observe(container);
    return () => ro.disconnect();
  }, [editorWrapRef, measure]);

  const scrollToIndex = (index: number) => {
  const prevActive = activeRef.current;
    // Optimistically set the active item so the blue state updates immediately
    if (activeRef.current !== index) {
      activeRef.current = index;
      setActiveIndex(index);
    }
    // Start a visual sweep through intermediate list items on click (skip if reduced motion)
    try {
      if (!reducedMotion) {
    const from = sweeping && sweepPos >= 0 ? sweepPos : prevActive;
        const to = index;
        const diff = to - from;
        if (Math.abs(diff) > 1) {
          if (sweepTimerRef.current != null) {
            clearInterval(sweepTimerRef.current);
            sweepTimerRef.current = null;
          }
          setSweeping(true);
          setSweepPos(from);
          const dir = diff > 0 ? 1 : -1;
          let cur = from;
          // Step through each intermediate index
          sweepTimerRef.current = window.setInterval(() => {
            cur += dir;
            setSweepPos(cur);
            if (cur === to) {
              if (sweepTimerRef.current != null) {
                clearInterval(sweepTimerRef.current);
                sweepTimerRef.current = null;
              }
              setSweeping(false);
            }
          }, 60);
        } else {
          // Small move (adjacent) — no sweep needed
          if (sweepTimerRef.current != null) {
            clearInterval(sweepTimerRef.current);
            sweepTimerRef.current = null;
          }
          setSweeping(false);
          setSweepPos(index);
        }
      }
    } catch {}
    const scrollEl = scrollRootRef.current;
    if (!scrollEl) return;
    // Resolve the target element by live DOM query to avoid stale IDs after editor reflows
    const wrap = editorWrapRef.current;
    const container = wrap?.querySelector('.editor-container') as HTMLElement | null;
    const nodes = container ? (Array.from(container.querySelectorAll('h1')) as HTMLElement[]) : [];
    const target = nodes[index] || null;
    if (!target) return;
    // Re-measure immediately to get fresh positions
    try { (measure as any)(); } catch {}
    // Recompute exact target position at click time in case layout shifted (images, fonts)
    const rect = target.getBoundingClientRect();
    const srect = scrollEl.getBoundingClientRect();
    const targetTop = rect.top - srect.top + scrollEl.scrollTop;
    const dest = Math.max(0, Math.min(scrollEl.scrollHeight - scrollEl.clientHeight, targetTop - HEADER_OFFSET));
    const prefersReduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canScrollContainer = scrollEl.scrollHeight > scrollEl.clientHeight + 1;
    if (canScrollContainer) {
      if (prefersReduce) {
        scrollEl.scrollTop = dest;
      } else {
        const startTop = scrollEl.scrollTop;
        (scrollEl as any).scrollTo?.({ top: dest, behavior: 'smooth' });
        // Cancel on user interaction or when scrolling ends
        let done = false;
        const clear = () => {
          if (done) return; done = true;
          scrollEl.removeEventListener('scrollend', onEnd as any);
          scrollEl.removeEventListener('wheel', onCancel as any);
          scrollEl.removeEventListener('touchstart', onCancel as any);
        };
        const onEnd = () => clear();
        const onCancel = () => clear();
        scrollEl.addEventListener('scrollend', onEnd as any, { passive: true } as any);
        scrollEl.addEventListener('wheel', onCancel as any, { passive: true } as any);
        scrollEl.addEventListener('touchstart', onCancel as any, { passive: true } as any);
        // Fallback only if the container didn't move at all (smooth unsupported)
        setTimeout(() => {
          if (done) return;
          const moved = Math.abs(scrollEl.scrollTop - startTop);
          const delta = Math.abs(scrollEl.scrollTop - dest);
          if (moved < 2 && delta > 4) scrollEl.scrollTop = dest;
          clear();
        }, 1200);
      }
      return;
    }
    // Fallback: scroll the main document if the container cannot scroll
    const docDest = Math.max(0, (window.scrollY || window.pageYOffset || 0) + rect.top - HEADER_OFFSET);
    if (prefersReduce) {
      window.scrollTo(0, docDest);
    } else {
      const startY = window.scrollY || window.pageYOffset || 0;
      window.scrollTo({ top: docDest, behavior: 'smooth' as ScrollBehavior });
      let done = false;
      const clear = () => {
        if (done) return; done = true;
        window.removeEventListener('scrollend', onEnd as any);
        window.removeEventListener('wheel', onCancel as any);
        window.removeEventListener('touchstart', onCancel as any);
      };
      const onEnd = () => clear();
      const onCancel = () => clear();
      window.addEventListener('scrollend', onEnd as any, { passive: true } as any);
      window.addEventListener('wheel', onCancel as any, { passive: true } as any);
      window.addEventListener('touchstart', onCancel as any, { passive: true } as any);
      setTimeout(() => {
        if (done) return;
        const moved = Math.abs((window.scrollY || window.pageYOffset || 0) - startY);
        const delta = Math.abs((window.scrollY || window.pageYOffset || 0) - docDest);
        if (moved < 2 && delta > 4) window.scrollTo(0, docDest);
        clear();
      }, 1200);
    }
  };

  // Clear sweep timer on unmount (placed before any conditional returns to preserve hooks order)
  useEffect(() => {
    return () => {
      if (sweepTimerRef.current != null) {
        clearInterval(sweepTimerRef.current);
        sweepTimerRef.current = null;
      }
    };
  }, []);

  if (!headings.length) return null;

  // Keep original spacing (no compression); show only a small viewport like a scrollbar (no visible scrollbar)
  const GAP = 12; // px between ticks, stays constant
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 0;
  const VIEWPORT = vpH ? Math.max(160, Math.min(240, Math.floor(vpH * 0.35))) : 200; // fixed visible region
  const trackPx = VIEWPORT;
  const innerHeight = Math.max(12, (headings.length - 1) * GAP);
  const maxOffset = Math.max(0, innerHeight - trackPx);
  const desiredOffset = activeIndex >= 0 ? activeIndex * GAP - trackPx / 2 : 0;
  const offset = Math.max(0, Math.min(maxOffset, desiredOffset));
  // Position the tick viewport vertically at the page center while keeping the same horizontal location
  const overlayHeight = vpH ? Math.max(0, vpH - bounds.top - bounds.bottom) : 0;
  let centerTop = vpH ? (vpH / 2 - bounds.top) : 0; // measured in overlay local coords
  if (overlayHeight > 0) centerTop = Math.max(0, Math.min(overlayHeight, centerTop));
  // Align list panel to the top edge of the tick viewport (so both start at same height)
  const listTop = Math.max(0, centerTop - trackPx / 2);

  return (
    <div
      className="fixed right-6 md:right-8 pointer-events-none select-none z-30"
      style={{ top: bounds.top, bottom: bounds.bottom }}
    >
      {/* Hover region spanning left of list + bar + list; keeps open while inside */}
      <div
        className={`absolute right-0 top-0 bottom-0 pointer-events-auto transition-[width] duration-150 ${hovered ? 'w-[300px]' : 'w-[180px]'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
  <div className="relative h-full">
          {/* Continuous vertical bar at far right (hidden to avoid visual line) */}
          <div className="absolute right-0 top-[14%] bottom-[14%] w-[2px] bg-transparent rounded-full pointer-events-none" />
          {/* Dense tick stack centered vertically at page center; hidden/disabled when hovered */}
          <div
            className={`absolute right-0 -translate-y-1/2 transition-opacity w-4 ${hovered ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ top: `${centerTop}px`, height: `${trackPx}px`, overflow: 'hidden' }}
          >
            <div
              className="relative"
              style={{
                height: `${innerHeight}px`,
                transform: `translateY(-${offset}px)`,
                transition: reducedMotion ? undefined : 'transform 240ms ease-out',
                willChange: reducedMotion ? undefined : 'transform',
              }}
            >
              {headings.map((h, i) => (
                <button
                  key={h.id}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  style={{ top: `${i * GAP}px`, backgroundColor: i === activeIndex ? '#2563eb' : undefined }}
                  className={`absolute -translate-y-1/2 left-0 h-[2px] w-4 rounded-full cursor-pointer transition-colors ${i === activeIndex ? '' : 'bg-gray-300 hover:bg-gray-400'}`}
                  title={h.text}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollToIndex(i); }}
                />
              ))}
            </div>
          </div>

          {/* H1 list panel appears to the left of the bar; aligned to the tick viewport's top */}
          <div
            className={`absolute right-0 max-h-64 sm:max-h-72 w-56 rounded-xl border bg-white shadow-xl overflow-auto transition-opacity duration-100 z-40 ${hovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            style={{ top: `${listTop}px` }}
            onMouseEnter={() => setHovered(true)}
          >
            <ul className="py-1 text-xs leading-snug text-gray-800 space-y-1">
              {headings.map((h, i) => (
                <li key={h.id} className="px-2">
                  <button
                    aria-current={(sweeping ? i === sweepPos : i === activeIndex) ? 'true' : undefined}
                    className={`w-full text-left px-2 py-1 rounded-md cursor-pointer transition-colors duration-200 ${
                      (sweeping ? i === sweepPos : i === activeIndex)
                        ? 'text-blue-600 font-medium'
                        : 'text-gray-800 hover:bg-gray-100'
                    }`}
                    aria-selected={(sweeping ? i === sweepPos : i === activeIndex) ? true : undefined}
                    onClick={(e) => { e.preventDefault(); scrollToIndex(i); }}
                    title={h.text}
                  >
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Removed invisible pre-hover strip to avoid intercepting clicks on the list */}
        </div>
      </div>
    </div>
  );
}




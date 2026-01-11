'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, rtdb, auth } from '@/lib/firebase';
import { collection, doc, setDoc, getDoc, updateDoc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { ref, onValue, set, push, remove, update, get } from 'firebase/database';
import { generateWorkspaceSlug, ensureUniqueSlug } from '@/lib/workspace-slug';
import { logAction } from '@/lib/audit-logs';

// ====== Interfaces ======

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
  lastAccessedAt?: number;
}

interface Notebook {
  id: string;
  name: string;
  order?: number;
}

interface Section {
  id: string;
  name: string;
  order?: number;
}

interface Topic {
  id: string;
  name: string;
  order?: number;
}

export interface Page {
  id: string;
  name: string;
  lastUpdated: number;
  createdAt: number;
  order?: number;
  parentPageId?: string | null;
  createdBy?: string;
  owner?: string;
  pinned?: boolean;
  content?: string;
  drawings?: any[];
  creating?: boolean;
}

interface NotebookContextType {
  // ====== Workspace Layer ======
  workspaces: Workspace[];
  selectedWorkspace: string | null;
  workspacesLoading: boolean;
  createWorkspace: (name: string, description?: string) => Promise<string>;
  renameWorkspace: (id: string, name: string) => Promise<void>;
  updateWorkspaceDescription: (id: string, description: string) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  selectWorkspace: (id: string | null) => void;
  getWorkspaceBySlug: (slug: string) => Workspace | null;

  // ====== Notebook Layer ======
  notebooks: Notebook[];
  sections: Section[];
  topics: Topic[];
  pages: Page[];
  selectedNotebook: string | null;
  selectedSection: string | null;
  selectedTopic: string | null;
  selectedPage: string | null;
  loading: boolean;
  notebooksLoading: boolean;
  sectionsLoading: boolean;
  topicsLoading: boolean;
  pagesLoading: boolean;

  createNotebook: (name: string) => Promise<void>;
  createSection: (name: string) => Promise<void>;
  createTopic: (name: string) => Promise<void>;
  createPage: (name: string, parentPageId?: string) => Promise<string>;
  renameNotebook: (id: string, name: string) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;
  renameSection: (id: string, name: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  renameTopic: (id: string, name: string) => Promise<void>;
  deleteTopic: (id: string) => Promise<void>;
  renamePage: (id: string, name: string) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
  selectNotebook: (id: string | null) => void;
  selectSection: (id: string | null) => void;
  selectTopic: (id: string | null) => void;
  selectPage: (id: string | null) => void;
  gotoPage: (pageId: string) => Promise<void>;
  getPageContent: (pageId: string) => Promise<string>;
  updatePageContent: (pageId: string, content: string) => Promise<void>;
  setPageParent: (pageId: string, parentPageId: string | null) => Promise<void>;
  reorderSections: (orderedIds: string[]) => Promise<void>;
  reorderTopics: (orderedIds: string[]) => Promise<void>;
  reorderPages: (orderedIds: string[]) => Promise<void>;
  togglePagePinned: (pageId: string, pinned: boolean) => Promise<void>;

  // Global search
  globalSearch: (query: string) => Promise<{
    workspaces: Array<{ id: string; name: string; type: 'workspace' }>;
    notebooks: Array<{ id: string; name: string; type: 'notebook'; workspaceId: string; workspaceName: string }>;
    sections: Array<{ id: string; name: string; type: 'section'; workspaceId: string; workspaceName: string; notebookId: string; notebookName: string }>;
    topics: Array<{ id: string; name: string; type: 'topic'; workspaceId: string; workspaceName: string; sectionId: string; sectionName: string; notebookId: string; notebookName: string }>;
    pages: Array<{ id: string; name: string; type: 'page'; workspaceId: string; workspaceName: string; topicId: string; topicName: string; sectionId: string; sectionName: string; notebookId: string; notebookName: string }>;
  }>;
}

type NotebookContextValue = NotebookContextType;

const NotebookContext = createContext<NotebookContextValue | undefined>(undefined);

export const NotebookProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();

  // ====== Workspace State ======
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [workspacesLoading, setWorkspacesLoading] = useState(true);
  const selectedWorkspaceRef = useRef<string | null>(selectedWorkspace);
  useEffect(() => { selectedWorkspaceRef.current = selectedWorkspace; }, [selectedWorkspace]);

  // ====== Notebook State ======
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const pagesRef = useRef<Page[]>([]);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);

  const selectedNotebookRef = useRef<string | null>(selectedNotebook);
  const selectedSectionRef = useRef<string | null>(selectedSection);
  const selectedTopicRef = useRef<string | null>(selectedTopic);
  useEffect(() => { selectedNotebookRef.current = selectedNotebook; }, [selectedNotebook]);
  useEffect(() => { selectedSectionRef.current = selectedSection; }, [selectedSection]);
  useEffect(() => { selectedTopicRef.current = selectedTopic; }, [selectedTopic]);

  const [loading, setLoading] = useState(true);
  const [notebooksLoading, setNotebooksLoading] = useState(false);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);

  // ====== Load Workspaces ======
  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      setNotebooks([]);
      setSections([]);
      setTopics([]);
      setPages([]);
      setSelectedWorkspace(null);
      setSelectedNotebook(null);
      setSelectedSection(null);
      setSelectedTopic(null);
      setSelectedPage(null);
      setWorkspacesLoading(false);
      setLoading(false);
      return;
    }

    setWorkspacesLoading(true);
    try {
      const workspacesRef = ref(rtdb, `users/${user.uid}/workspaces`);
      const unsubscribe = onValue(workspacesRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() || {};
          const workspacesList = Object.entries(data).map(([id, ws]: [string, any]) => ({
            id,
            name: ws.name || 'Untitled Workspace',
            slug: ws.slug || generateWorkspaceSlug(ws.name || 'untitled'),
            description: ws.description || '',
            createdAt: ws.createdAt || 0,
            updatedAt: ws.updatedAt || 0,
            lastAccessedAt: ws.lastAccessedAt || 0,
          }));
          // Sort by lastAccessedAt descending, then createdAt
          workspacesList.sort((a, b) => (b.lastAccessedAt || b.createdAt || 0) - (a.lastAccessedAt || a.createdAt || 0));
          setWorkspaces(workspacesList);
        } else {
          setWorkspaces([]);
        }
        setWorkspacesLoading(false);
        setLoading(false);
      }, (error) => {
        console.error('Error loading workspaces:', error);
        setWorkspacesLoading(false);
        setLoading(false);
      });

      return () => {
        try { unsubscribe(); } catch (e) { }
      };
    } catch (error) {
      console.error('Error setting up workspaces listener:', error);
      setWorkspacesLoading(false);
      setLoading(false);
    }
  }, [user]);

  // ====== Load Notebooks when workspace is selected ======
  useEffect(() => {
    if (!user || !selectedWorkspace) {
      setNotebooks([]);
      setSelectedNotebook(null);
      setNotebooksLoading(false);
      return;
    }

    try {
      setNotebooksLoading(true);
      const notebooksRef = ref(rtdb, `workspaces/${selectedWorkspace}/notebooks`);
      const unsubscribe = onValue(notebooksRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, { name?: string; order?: number; createdAt?: number }>;
        const notebooksList = Object.entries(data).map(([id, nb]) => ({
          id,
          name: nb.name ?? 'Untitled Notebook',
          order: nb.order,
          createdAt: nb.createdAt || 0,
        }));
        notebooksList.sort((a, b) => {
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          return ao - bo;
        });
        setNotebooks(notebooksList);
        setNotebooksLoading(false);
      }, (error) => {
        console.error('Error loading notebooks:', error);
        setNotebooksLoading(false);
      });

      // Update lastAccessedAt - only update if user owns the workspace
      // For shared workspaces, update shared_workspaces instead
      get(ref(rtdb, `workspaces/${selectedWorkspace}/owner`)).then((ownerSnap) => {
        const ownerId = ownerSnap.val();
        if (ownerId === user.uid) {
          // User owns this workspace, update their workspaces node
          update(ref(rtdb, `users/${user.uid}/workspaces/${selectedWorkspace}`), {
            lastAccessedAt: Date.now()
          }).catch(() => { });
        } else {
          // User is a member, update their shared_workspaces node
          update(ref(rtdb, `users/${user.uid}/shared_workspaces/${selectedWorkspace}`), {
            lastAccessedAt: Date.now()
          }).catch(() => { });
        }
      }).catch(() => { });

      return () => {
        try { unsubscribe(); } catch (e) { }
      };
    } catch (error) {
      console.error('Error setting up notebooks listener:', error);
      setNotebooksLoading(false);
    }
  }, [user, selectedWorkspace]);

  // ====== Load Sections when notebook is selected ======
  useEffect(() => {
    if (!user || !selectedWorkspace || !selectedNotebook) {
      setSections([]);
      setSelectedSection(null);
      setSectionsLoading(false);
      return;
    }

    try {
      setSectionsLoading(true);
      const sectionsRef = ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections`);
      const unsubscribe = onValue(sectionsRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, { name?: string; order?: number; createdAt?: number }>;
        const sectionsList = Object.entries(data).map(([id, section]) => ({
          id,
          name: section.name ?? 'Untitled Section',
          order: section.order,
          createdAt: section.createdAt || 0,
        }));
        sectionsList.sort((a, b) => {
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          return ao - bo;
        });
        setSections(sectionsList);
        setSectionsLoading(false);
      }, (error) => {
        console.error('Error loading sections:', error);
        setSectionsLoading(false);
      });

      return () => {
        try { unsubscribe(); } catch (e) { }
      };
    } catch (error) {
      console.error('Error setting up sections listener:', error);
      setSectionsLoading(false);
    }
  }, [user, selectedWorkspace, selectedNotebook]);

  // ====== Load Topics when section is selected ======
  useEffect(() => {
    if (!user || !selectedWorkspace || !selectedNotebook || !selectedSection) {
      setTopics([]);
      setSelectedTopic(null);
      setTopicsLoading(false);
      return;
    }

    try {
      setTopicsLoading(true);
      const topicsRef = ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics`);
      const unsubscribe = onValue(topicsRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, { name?: string; order?: number; createdAt?: number }>;
        const topicsList = Object.entries(data).map(([id, topic]) => ({
          id,
          name: topic.name ?? 'Untitled Topic',
          order: topic.order,
          createdAt: topic.createdAt || 0,
        }));
        topicsList.sort((a, b) => {
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          return ao - bo;
        });
        setTopics(topicsList);
        setTopicsLoading(false);
      }, (error) => {
        console.error('Error loading topics:', error);
        setTopicsLoading(false);
      });

      return () => {
        try { unsubscribe(); } catch (e) { }
      };
    } catch (error) {
      console.error('Error setting up topics listener:', error);
      setTopicsLoading(false);
    }
  }, [user, selectedWorkspace, selectedNotebook, selectedSection]);

  // ====== Load Pages when topic is selected ======
  useEffect(() => {
    if (!user || !selectedWorkspace || !selectedNotebook || !selectedSection || !selectedTopic) {
      setPages([]);
      setSelectedPage(null);
      setPagesLoading(false);
      return;
    }

    const sortByRef = { current: localStorage.getItem('onenot:pageSortBy:last') || 'updated' };
    const mountedRef = { current: true };
    const lastSortedPagesRef = { current: new Map<string, Page[]>() };
    let currentPagesMap = new Map<string, Page>();

    const sortPages = (list: Page[], sortBy: string): Page[] => {
      const hashList = (items: Page[]): string => {
        return items.map(p =>
          `${p.id}:${p.lastUpdated}:${p.order}:${p.pinned ? 1 : 0}:${p.creating ? 1 : 0}`
        ).join('|');
      };

      const cacheKey = `${sortBy}-${hashList(list)}`;
      const cached = lastSortedPagesRef.current.get(cacheKey);
      if (cached) return cached;

      const sorted = [...list];

      const comparePinned = (a: Page, b: Page) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      };

      if (sortBy === 'custom') {
        sorted.sort((a, b) => {
          const pinDiff = comparePinned(a, b);
          if (pinDiff !== 0) return pinDiff;
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          const orderDiff = ao - bo;
          return orderDiff || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
        });
      } else if (sortBy === 'created') {
        sorted.sort((a, b) => {
          const pinDiff = comparePinned(a, b);
          if (pinDiff !== 0) return pinDiff;
          if (a.creating && !b.creating) return -1;
          if (!a.creating && b.creating) return 1;
          const diff = a.createdAt - b.createdAt;
          return diff || (a.id < b.id ? -1 : 1);
        });
      } else {
        sorted.sort((a, b) => {
          const pinDiff = comparePinned(a, b);
          if (pinDiff !== 0) return pinDiff;
          if (a.creating && !b.creating) return -1;
          if (!a.creating && b.creating) return 1;
          const diff = b.lastUpdated - a.lastUpdated;
          return diff || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1);
        });
      }

      lastSortedPagesRef.current.set(cacheKey, sorted);
      if (lastSortedPagesRef.current.size > 10) {
        const keys = Array.from(lastSortedPagesRef.current.keys());
        for (let i = 0; i < keys.length - 5; i++) {
          lastSortedPagesRef.current.delete(keys[i]);
        }
      }

      return sorted;
    };

    setPages([]);

    try {
      setPagesLoading(true);
      const pagesPath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`;
      const pagesRef = ref(rtdb, pagesPath);

      const handleSortChange = () => {
        const newSortBy = localStorage.getItem('onenot:pageSortBy:last') || 'updated';
        if (newSortBy !== sortByRef.current) {
          sortByRef.current = newSortBy;
          if (mountedRef.current && currentPagesMap.size > 0) {
            const sorted = sortPages(Array.from(currentPagesMap.values()), newSortBy);
            setPages(sorted);
          }
        }
      };
      window.addEventListener('storage', handleSortChange);

      const unsubscribe = onValue(pagesRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, {
          name?: string;
          lastUpdated?: number;
          updatedAt?: number;
          createdAt?: number;
          order?: number;
          parentPageId?: string | null;
          creating?: boolean;
          owner?: string;
          createdBy?: string;
          pinned?: boolean;
        }>;

        const newPagesMap = new Map<string, Page>();

        Object.entries(data).forEach(([id, page]) => {
          const pagePinned = !!(page as any).pinned;
          const pageParentId = page.parentPageId || null;
          const pageName = page.name ?? 'Untitled Page';
          const pageLastUpdated = page.lastUpdated || page.updatedAt || 0;

          const existing = currentPagesMap.get(id);
          if (existing &&
            existing.name === pageName &&
            existing.lastUpdated === pageLastUpdated &&
            existing.order === page.order &&
            existing.parentPageId === pageParentId &&
            existing.pinned === pagePinned &&
            existing.creating === !!page.creating) {
            newPagesMap.set(id, existing);
            return;
          }

          newPagesMap.set(id, {
            id,
            name: pageName,
            lastUpdated: pageLastUpdated,
            createdAt: page.createdAt || 0,
            order: page.order,
            parentPageId: pageParentId,
            owner: page.owner || page.createdBy || undefined,
            pinned: pagePinned,
            creating: !!page.creating
          });
        });

        if (!mountedRef.current) return;

        const finalPages = Array.from(newPagesMap.values());
        const sorted = sortPages(finalPages, sortByRef.current);

        const hasChanges = finalPages.length !== currentPagesMap.size ||
          finalPages.some(page => {
            const existing = currentPagesMap.get(page.id);
            return !existing || existing !== newPagesMap.get(page.id);
          });

        if (hasChanges) {
          currentPagesMap = newPagesMap;
          setPages(sorted);
        }

        setPagesLoading(false);
      }, (error) => {
        if (mountedRef.current) setPagesLoading(false);
      });

      return () => {
        mountedRef.current = false;
        window.removeEventListener('storage', handleSortChange);
        try { unsubscribe(); } catch (error) {
          console.error('Error unsubscribing:', error);
        }
      };
    } catch (error) {
      if (mountedRef.current) setPagesLoading(false);
    }
  }, [user, selectedWorkspace, selectedNotebook, selectedSection, selectedTopic]);

  // ====== Selection Functions ======
  const selectWorkspace = useCallback((id: string | null) => {
    if (selectedWorkspaceRef.current === id) return;
    setSelectedWorkspace(id);
    setSelectedNotebook(null);
    setSelectedSection(null);
    setSelectedTopic(null);
    setSelectedPage(null);
    setNotebooks([]);
    setSections([]);
    setTopics([]);
    setPages([]);
  }, []);

  const selectNotebook = useCallback((id: string | null) => {
    if (selectedNotebookRef.current === id) return;
    setSelectedNotebook(id);
    setSelectedSection(null);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, []);

  const selectSection = useCallback((id: string | null) => {
    if (selectedSectionRef.current === id) return;
    setSelectedSection(id);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, []);

  const selectTopic = useCallback((id: string | null) => {
    if (selectedTopicRef.current === id) return;
    setSelectedTopic(id);
    setSelectedPage(null);
  }, []);

  const selectPage = useCallback((id: string | null) => {
    setSelectedPage((prev) => (prev === id ? prev : id));
  }, []);

  // ====== Workspace CRUD ======
  const createWorkspace = async (name: string, description?: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    const now = Date.now();

    // Check for duplicate names and collect existing slugs
    const existingSnap = await get(ref(rtdb, `users/${user.uid}/workspaces`));
    const existing = (existingSnap.val() || {}) as Record<string, { name?: string; slug?: string }>;
    const exists = Object.values(existing).some((w) => (w.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (exists) throw new Error('A workspace with this name already exists');

    // Generate unique slug
    const baseSlug = generateWorkspaceSlug(name);
    const existingSlugs = Object.values(existing).map(w => w.slug || '').filter(Boolean);
    const slug = ensureUniqueSlug(baseSlug, existingSlugs);

    // Create workspace at root level
    const newWorkspaceRef = push(ref(rtdb, `workspaces`));
    const workspaceId = newWorkspaceRef.key;
    if (!workspaceId) throw new Error('Failed to create workspace');

    await set(ref(rtdb, `workspaces/${workspaceId}`), {
      owner: user.uid,
      name,
      slug,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      notebooks: {},
    });

    // Link under user
    await set(ref(rtdb, `users/${user.uid}/workspaces/${workspaceId}`), {
      name,
      slug,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    });

    return workspaceId;
  };

  const renameWorkspace = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    const now = Date.now();

    // Generate new slug for the new name
    const existingSnap = await get(ref(rtdb, `users/${user.uid}/workspaces`));
    const existing = (existingSnap.val() || {}) as Record<string, { slug?: string }>;
    const baseSlug = generateWorkspaceSlug(name);
    const existingSlugs = Object.entries(existing)
      .filter(([wsId]) => wsId !== id) // Exclude current workspace
      .map(([, ws]) => ws.slug || '')
      .filter(Boolean);
    const slug = ensureUniqueSlug(baseSlug, existingSlugs);

    await update(ref(rtdb), {
      [`workspaces/${id}/name`]: name,
      [`workspaces/${id}/slug`]: slug,
      [`workspaces/${id}/updatedAt`]: now,
      [`users/${user.uid}/workspaces/${id}/name`]: name,
      [`users/${user.uid}/workspaces/${id}/slug`]: slug,
      [`users/${user.uid}/workspaces/${id}/updatedAt`]: now,
    });
  };

  const updateWorkspaceDescription = async (id: string, description: string) => {
    if (!user) throw new Error('User not authenticated');
    const now = Date.now();
    await update(ref(rtdb), {
      [`workspaces/${id}/description`]: description,
      [`workspaces/${id}/updatedAt`]: now,
      [`users/${user.uid}/workspaces/${id}/description`]: description,
      [`users/${user.uid}/workspaces/${id}/updatedAt`]: now,
    });
  };

  const deleteWorkspace = async (id: string) => {
    if (!user) throw new Error('User not authenticated');

    // Fetch workspace to collect all page IDs for cleanup
    const snap = await get(ref(rtdb, `workspaces/${id}`));
    const ws = snap.val();
    const pageIds = collectPageIdsFromWorkspace(ws);

    // Delete pages via API
    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during workspace deletion:', error);
    }

    // Remove RTDB nodes
    await remove(ref(rtdb, `workspaces/${id}`));
    await remove(ref(rtdb, `users/${user.uid}/workspaces/${id}`));

    if (selectedWorkspace === id) selectWorkspace(null);
  };

  // Helper: collect all page IDs from a workspace
  const collectPageIdsFromWorkspace = (ws: any): string[] => {
    const pages: string[] = [];
    if (!ws || !ws.notebooks) return pages;

    Object.values(ws.notebooks as Record<string, any>).forEach((notebook) => {
      if (!notebook.sections) return;
      Object.values(notebook.sections as Record<string, any>).forEach((section) => {
        if (!section.topics) return;
        Object.values(section.topics as Record<string, any>).forEach((topic) => {
          if (!topic.pages) return;
          Object.keys(topic.pages as Record<string, unknown>).forEach((pid) => pages.push(pid));
        });
      });
    });
    return pages;
  };

  // ====== Notebook CRUD ======
  const createNotebook = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace) throw new Error('No workspace selected');

    const now = Date.now();
    const notebooksPath = `workspaces/${selectedWorkspace}/notebooks`;

    // Check for duplicate
    const existingSnap = await get(ref(rtdb, notebooksPath));
    const existing = (existingSnap.val() || {}) as Record<string, { name?: string }>;
    const exists = Object.values(existing).some((n) => (n.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (exists) throw new Error('A notebook with this name already exists');

    const maxOrder = Object.values(existing as Record<string, { order?: number }>).reduce((acc, n) => Math.max(acc, n.order ?? -1), -1);
    const nextOrder = maxOrder + 1;

    const newNotebookRef = push(ref(rtdb, notebooksPath));
    const notebookId = newNotebookRef.key;
    if (!notebookId) throw new Error('Failed to create notebook');

    await set(ref(rtdb, `${notebooksPath}/${notebookId}`), {
      owner: user.uid,
      name,
      createdAt: now,
      updatedAt: now,
      order: nextOrder,
      sections: {},
    });

    try { selectNotebook(notebookId); } catch (error) {
      console.error('Error selecting notebook:', error);
    }

    // Audit Log
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'NOTEBOOK_CREATED',
      targetId: notebookId,
      targetName: name,
    });
  };

  const renameNotebook = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace) throw new Error('No workspace selected');
    const now = Date.now();
    await update(ref(rtdb), {
      [`workspaces/${selectedWorkspace}/notebooks/${id}/name`]: name,
      [`workspaces/${selectedWorkspace}/notebooks/${id}/updatedAt`]: now,
    });

    // Audit Log
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'NOTEBOOK_RENAMED' as any, // Added this action or just use a generic one
      targetId: id,
      targetName: name,
    });
  };

  const deleteNotebook = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace) throw new Error('No workspace selected');

    const snap = await get(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${id}`));
    const nb = snap.val();
    const pageIds = collectPageIdsFromNotebook(nb);

    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during notebook deletion:', error);
    }

    await remove(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${id}`));
    if (selectedNotebook === id) selectNotebook(null);

    // Audit Log
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'NOTEBOOK_DELETED',
      targetId: id,
      targetName: nb?.name || 'Unknown',
    });
  };

  const collectPageIdsFromNotebook = (nb: any): string[] => {
    const pages: string[] = [];
    if (!nb || !nb.sections) return pages;
    Object.values(nb.sections as Record<string, any>).forEach((section) => {
      if (!section.topics) return;
      Object.values(section.topics as Record<string, any>).forEach((topic) => {
        if (!topic.pages) return;
        Object.keys(topic.pages as Record<string, unknown>).forEach((pid) => pages.push(pid));
      });
    });
    return pages;
  };

  // ====== Section CRUD ======
  const createSection = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook) throw new Error('No notebook selected');

    const now = Date.now();
    const sectionsPath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections`;

    const sectionsSnap = await get(ref(rtdb, sectionsPath));
    const existingSections = (sectionsSnap.val() || {}) as Record<string, { name?: string; order?: number }>;
    const dup = Object.values(existingSections).some((s) => (s.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) throw new Error('A section with this name already exists in this notebook');

    const maxOrder = Object.values(existingSections).reduce((acc, s) => Math.max(acc, s.order ?? -1), -1);
    const nextOrder = maxOrder + 1;

    const newSectionRef = push(ref(rtdb, sectionsPath));
    const sectionId = newSectionRef.key;
    if (!sectionId) throw new Error('Failed to create section');

    await set(ref(rtdb, `${sectionsPath}/${sectionId}`), {
      owner: user.uid,
      name,
      createdAt: now,
      updatedAt: now,
      order: nextOrder,
      topics: {},
    });

    try { selectSection(sectionId); } catch (error) {
      console.error('Error selecting section:', error);
    }

    // Audit Log
    const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'SECTION_CREATED',
      targetId: sectionId,
      targetName: `${nbName}/${name}`,
    });
  };

  const renameSection = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook) throw new Error('No notebook selected');
    const now = Date.now();
    await update(ref(rtdb), {
      [`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${id}/name`]: name,
      [`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${id}/updatedAt`]: now,
    });
  };

  const deleteSection = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook) throw new Error('No notebook selected');

    const snap = await get(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${id}`));
    const sec = snap.val();
    const pageIds = collectPageIdsFromSection(sec);

    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during section deletion:', error);
    }

    await remove(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${id}`));
    if (selectedSection === id) selectSection(null);

    // Audit Log
    const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'SECTION_DELETED',
      targetId: id,
      targetName: `${nbName}/${sec?.name || 'Unknown'}`,
    });
  };

  const collectPageIdsFromSection = (sec: any): string[] => {
    const pages: string[] = [];
    if (!sec || !sec.topics) return pages;
    Object.values(sec.topics as Record<string, any>).forEach((topic) => {
      if (!topic.pages) return;
      Object.keys(topic.pages as Record<string, unknown>).forEach((pid) => pages.push(pid));
    });
    return pages;
  };

  // ====== Topic CRUD ======
  const createTopic = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection) throw new Error('No section selected');

    const now = Date.now();
    const topicsPath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics`;

    const topicsSnap = await get(ref(rtdb, topicsPath));
    const topicsData = (topicsSnap.val() || {}) as Record<string, { name?: string; order?: number }>;
    const dup = Object.values(topicsData).some((t) => (t.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) throw new Error('A topic with this name already exists in this section');

    const maxOrder = Object.values(topicsData).reduce((acc, t) => Math.max(acc, t.order ?? -1), -1);
    const nextOrder = maxOrder + 1;

    const newTopicRef = push(ref(rtdb, topicsPath));
    const topicId = newTopicRef.key;
    if (!topicId) throw new Error('Failed to create topic');

    await set(ref(rtdb, `${topicsPath}/${topicId}`), {
      owner: user.uid,
      name,
      createdAt: now,
      updatedAt: now,
      order: nextOrder,
      pages: {},
    });

    try { selectTopic(topicId); } catch (error) {
      console.error('Error selecting topic:', error);
    }

    // Audit Log
    const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
    const secName = sections.find(s => s.id === selectedSection)?.name || 'Unknown';
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'TOPIC_CREATED',
      targetId: topicId,
      targetName: `${nbName}/${secName}/${name}`,
    });
  };

  const renameTopic = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection) throw new Error('No section selected');
    const now = Date.now();
    await update(ref(rtdb), {
      [`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/name`]: name,
      [`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/updatedAt`]: now,
    });
  };

  const deleteTopic = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection) throw new Error('No section selected');

    const snap = await get(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    const tp = snap.val();
    const pageIds = collectPageIdsFromTopic(tp);

    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during topic deletion:', error);
    }

    await remove(ref(rtdb, `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    if (selectedTopic === id) selectTopic(null);

    // Audit Log
    const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
    const secName = sections.find(s => s.id === selectedSection)?.name || 'Unknown';
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'TOPIC_DELETED',
      targetId: id,
      targetName: `${nbName}/${secName}/${tp?.name || 'Unknown'}`,
    });
  };

  const collectPageIdsFromTopic = (tp: any): string[] => {
    const pages: string[] = [];
    if (!tp || !tp.pages) return pages;
    Object.keys(tp.pages as Record<string, unknown>).forEach((pid) => pages.push(pid));
    return pages;
  };

  // ====== Page CRUD ======
  const createPage = async (name: string, parentPageId?: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection || !selectedTopic) {
      throw new Error('Please select workspace, notebook, section, and topic first');
    }

    const now = Date.now();
    const pagesPath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`;
    const pagesSnap = await get(ref(rtdb, pagesPath));
    const pagesData = (pagesSnap.val() || {}) as Record<string, { name?: string; order?: number }>;

    const dup = Object.values(pagesData).some((p) => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) throw new Error('A page with this name already exists in this topic');

    const maxOrder = Object.values(pagesData).reduce((acc, p) => Math.max(acc, p.order ?? -1), -1);
    const nextOrder = maxOrder + 1;
    const pageId = crypto.randomUUID();

    try {
      const pageDocRef = doc(db, 'pages', pageId);

      const rtdbUpdates: Record<string, any> = {
        [`${pagesPath}/${pageId}/name`]: name,
        [`${pagesPath}/${pageId}/lastUpdated`]: now,
        [`${pagesPath}/${pageId}/createdAt`]: now,
        [`${pagesPath}/${pageId}/order`]: nextOrder,
        [`${pagesPath}/${pageId}/owner`]: user.uid,
        [`${pagesPath}/${pageId}/creating`]: true,
        [`users/${user.uid}/pageIndex/${pageId}`]: {
          workspaceId: selectedWorkspace,
          notebookId: selectedNotebook,
          sectionId: selectedSection,
          topicId: selectedTopic,
          parentPageId: parentPageId ?? null,
          owner: user.uid,
          name,
        },
      };

      if (parentPageId) {
        rtdbUpdates[`${pagesPath}/${pageId}/parentPageId`] = parentPageId;
      }

      await update(ref(rtdb), rtdbUpdates);

      await setDoc(pageDocRef, {
        content: '',
        name,
        owner: user.uid,
      });

      setTimeout(() => {
        update(ref(rtdb), {
          [`${pagesPath}/${pageId}/creating`]: null
        }).catch(() => { });
      }, 500);

      return pageId;
    } catch (error) {
      try {
        await remove(ref(rtdb, `${pagesPath}/${pageId}`));
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      throw error;
    } finally {
      // Audit Log
      const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
      const secName = sections.find(s => s.id === selectedSection)?.name || 'Unknown';
      const tpName = topics.find(t => t.id === selectedTopic)?.name || 'Unknown';
      logAction({
        workspaceId: selectedWorkspace,
        userId: user.uid,
        userEmail: user.email || '',
        userName: user.displayName || '',
        action: 'PAGE_CREATED',
        targetId: pageId,
        targetName: `${nbName}/${secName}/${tpName}/${name}`,
      });
    }
  };

  const renamePage = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');

    const pageMeta = pages.find((p) => p.id === id);
    const owner = (pageMeta as any)?.createdBy || (pageMeta as any)?.owner;
    // Removed generic owner check to allow shared workspace editing

    const now = Date.now();
    const pagePath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}`;

    await update(ref(rtdb), {
      [`${pagePath}/name`]: name,
      [`${pagePath}/updatedAt`]: now,
      [`users/${user.uid}/pageIndex/${id}/name`]: name,
    });

    await updateDoc(doc(db, 'pages', id), { name, owner: owner ?? user.uid });

    // Audit Log
    const nbName = notebooks.find(n => n.id === selectedNotebook)?.name || 'Unknown';
    const secName = sections.find(s => s.id === selectedSection)?.name || 'Unknown';
    const tpName = topics.find(t => t.id === selectedTopic)?.name || 'Unknown';
    logAction({
      workspaceId: selectedWorkspace,
      userId: user.uid,
      userEmail: user.email || '',
      userName: user.displayName || '',
      action: 'PAGE_RENAMED',
      targetId: id,
      targetName: `${nbName}/${secName}/${tpName}/${name}`,
    });
  };

  const deletePage = async (id: string) => {
    if (!user) throw new Error('User not authenticated');

    type Meta = { workspaceId?: string; notebookId?: string; sectionId?: string; topicId?: string; createdBy?: string };
    const metaById = new Map<string, Meta>();
    const allIds: string[] = [];
    const queue: string[] = [id];
    const seen = new Set<string>([id]);

    const loadMeta = async (pid: string): Promise<Meta> => {
      const snap = await getDoc(doc(db, 'pages', pid));
      const data: any = snap.exists() ? (snap.data() || {}) : {};
      const meta: Meta = {
        workspaceId: data.workspaceId,
        notebookId: data.notebookId,
        sectionId: data.sectionId,
        topicId: data.topicId,
        createdBy: data.createdBy,
      };
      metaById.set(pid, meta);
      return meta;
    };

    while (queue.length) {
      const cur = queue.shift() as string;
      allIds.push(cur);
      let curMeta: Meta = {};
      try {
        curMeta = await loadMeta(cur);
      } catch (error) {
        console.error(`Error loading metadata for page ${cur}:`, error);
      }
      try {
        const qs = await getDocs(query(collection(db, 'pages'), where('parentPageId', '==', cur)));
        const kids = qs.docs.map((d) => d.id);
        for (const k of kids) { if (!seen.has(k)) { seen.add(k); queue.push(k); } }
      } catch (error) {
        console.error(`Error fetching child pages for ${cur}:`, error);
      }
      try {
        const ws = curMeta.workspaceId ?? selectedWorkspace;
        const nb = curMeta.notebookId ?? selectedNotebook;
        const sec = curMeta.sectionId ?? selectedSection;
        const tp = curMeta.topicId ?? selectedTopic;
        if (ws && nb && sec && tp) {
          const base = `workspaces/${ws}/notebooks/${nb}/sections/${sec}/topics/${tp}/pages`;
          const snap = await get(ref(rtdb, base));
          const data = (snap.val() || {}) as Record<string, { parentPageId?: string }>;
          for (const [pid, info] of Object.entries(data)) {
            if (info && info.parentPageId === cur && !seen.has(pid)) { seen.add(pid); queue.push(pid); }
          }
        }
      } catch (error) {
        console.error(`Error checking RTDB mapping for ${cur}:`, error);
      }
    }

    for (let i = allIds.length - 1; i >= 0; i--) {
      const pid = allIds[i];
      const meta = metaById.get(pid) || {};
      // Removed generic owner check to allow shared workspace deletion


      try {
        await fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' });
      } catch (error) {
        console.error(`Error deleting page ${pid} via API:`, error);
      }

      try {
        await deleteDoc(doc(db, 'pages', pid));
      } catch (error) {
        console.error(`Error deleting Firestore document for page ${pid}:`, error);
      }

      const ws = meta.workspaceId ?? selectedWorkspace;
      const nb = meta.notebookId ?? selectedNotebook;
      const sec = meta.sectionId ?? selectedSection;
      const tp = meta.topicId ?? selectedTopic;
      if (ws && nb && sec && tp) {
        try {
          await remove(ref(rtdb, `workspaces/${ws}/notebooks/${nb}/sections/${sec}/topics/${tp}/pages/${pid}`));
        } catch (error) {
          console.error(`Error removing RTDB reference for page ${pid}:`, error);
        }
      }

      try {
        await update(ref(rtdb), { [`users/${user.uid}/pageIndex/${pid}`]: null });
      } catch (error) {
        console.error(`Error removing page index for ${pid}:`, error);
      }

      if (selectedPage === pid) selectPage(null);

      // Audit Log
      const nbName = notebooks.find(n => n.id === (meta.notebookId ?? selectedNotebook))?.name || 'Unknown';
      const secName = sections.find(s => s.id === (meta.sectionId ?? selectedSection))?.name || 'Unknown';
      const tpName = topics.find(t => t.id === (meta.topicId ?? selectedTopic))?.name || 'Unknown';
      const pName = pages.find(p => p.id === pid)?.name || 'Page';

      logAction({
        workspaceId: selectedWorkspace || '',
        userId: user.uid,
        userEmail: user.email || '',
        userName: user.displayName || '',
        action: 'PAGE_DELETED',
        targetId: pid,
        targetName: `${nbName}/${secName}/${tpName}/${pName}`,
      });
    }
  };

  const setPageParent = useCallback(async (pageId: string, parentPageId: string | null) => {
    if (!user) throw new Error('User not authenticated');
    if (pageId === parentPageId) return;

    try {
      const pageMeta = pages.find(p => p.id === pageId);
      // Removed generic owner check to allow shared workspace editing


      const updates: Record<string, any> = {
        [`users/${user.uid}/pageIndex/${pageId}/parentPageId`]: parentPageId ?? null,
      };

      if (selectedWorkspace && selectedNotebook && selectedSection && selectedTopic) {
        const pagePath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${pageId}`;
        updates[`${pagePath}/parentPageId`] = parentPageId ?? null;
        updates[`${pagePath}/lastUpdated`] = Date.now();
      }

      await update(ref(rtdb), updates);
    } catch (error) {
      console.error('Error updating page parent:', error);
      throw error;
    }
  }, [user, pages, selectedWorkspace, selectedNotebook, selectedSection, selectedTopic]);

  const togglePagePinned = useCallback(async (pageId: string, pinned: boolean) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');

    const pagePath = `workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${pageId}`;
    const updates: Record<string, any> = {
      [`${pagePath}/pinned`]: pinned,
      [`users/${user.uid}/pageIndex/${pageId}/pinned`]: pinned,
    };

    try {
      await update(ref(rtdb), updates);
    } catch (error) {
      console.error('Failed to toggle page pin state:', error);
      throw error;
    }
  }, [selectedWorkspace, selectedNotebook, selectedSection, selectedTopic, user]);

  const updatePageContent = useCallback(async (pageId: string, content: string) => {
    if (!user) throw new Error('User not authenticated');
    const pageMeta = pagesRef.current.find((p) => p.id === pageId);
    const owner = pageMeta?.createdBy || pageMeta?.owner;
    // Removed generic owner check to allow shared workspace editing



    const pageRef = doc(db, 'pages', pageId);
    await updateDoc(pageRef, { content, owner: owner ?? user.uid });
  }, [user]);

  const getPageContent = useCallback(async (pageId: string): Promise<string> => {
    try {
      if (!user) return '';

      const page = pages.find(p => p.id === pageId);
      if (!page) return '';

      const owner = (page as any).createdBy || (page as any).owner;
      // Removed generic owner check to allow shared workspace viewing


      const pageDoc = await getDoc(doc(db, 'pages', pageId));
      if (!pageDoc.exists()) return '';

      const pageData: any = pageDoc.data() || {};
      // Removed ownerFromDoc check to allow shared workspace viewing


      return (pageData.content as string) || '';
    } catch (error) {
      console.error('Error getting page content:', error);
      return '';
    }
  }, [user, pages]);

  const gotoPage = useCallback(async (pageId: string) => {
    if (!user || !pageId) return;

    try {
      const existing = pagesRef.current.find((p) => p.id === pageId);
      if (existing) {
        setSelectedPage((prev) => (prev === pageId ? prev : pageId));
        return;
      }

      if (selectedTopicRef.current) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, attempt * 200));
          const existingAfterWait = pagesRef.current.find((p) => p.id === pageId);
          if (existingAfterWait) {
            setSelectedPage((prev) => (prev === pageId ? prev : pageId));
            return;
          }
        }
      }

      throw new Error('Page not found or access denied');
    } catch (error) {
      console.error('Error navigating to page:', error);
      throw error;
    }
  }, [user]);

  // ====== Reorder Functions ======
  const reorderSections = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook) throw new Error('No notebook selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  const reorderTopics = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection) throw new Error('No section selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  const reorderPages = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedWorkspace || !selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`workspaces/${selectedWorkspace}/notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  // ====== Global Search ======
  const globalSearch = useCallback(async (queryStr: string) => {
    if (!user || !queryStr.trim()) {
      return { workspaces: [], notebooks: [], sections: [], topics: [], pages: [] };
    }

    const searchQuery = queryStr.toLowerCase().trim();
    const results = {
      workspaces: [] as Array<{ id: string; name: string; type: 'workspace' }>,
      notebooks: [] as Array<{ id: string; name: string; type: 'notebook'; workspaceId: string; workspaceName: string }>,
      sections: [] as Array<{ id: string; name: string; type: 'section'; workspaceId: string; workspaceName: string; notebookId: string; notebookName: string }>,
      topics: [] as Array<{ id: string; name: string; type: 'topic'; workspaceId: string; workspaceName: string; sectionId: string; sectionName: string; notebookId: string; notebookName: string }>,
      pages: [] as Array<{ id: string; name: string; type: 'page'; workspaceId: string; workspaceName: string; topicId: string; topicName: string; sectionId: string; sectionName: string; notebookId: string; notebookName: string }>
    };

    try {
      // Search workspaces
      workspaces.forEach(workspace => {
        if (workspace.name.toLowerCase().includes(searchQuery)) {
          results.workspaces.push({
            id: workspace.id,
            name: workspace.name,
            type: 'workspace'
          });
        }
      });

      // Search within all workspaces
      const workspacesSnapshot = await get(ref(rtdb, `users/${user.uid}/workspaces`));
      if (workspacesSnapshot.exists()) {
        const workspacesData = workspacesSnapshot.val() || {};

        for (const [workspaceId, workspaceData] of Object.entries(workspacesData)) {
          const workspace = workspaceData as any;
          const workspaceName = workspace.name || 'Untitled Workspace';

          // Get notebooks for this workspace
          const notebooksSnapshot = await get(ref(rtdb, `workspaces/${workspaceId}/notebooks`));
          if (notebooksSnapshot.exists()) {
            const notebooksData = notebooksSnapshot.val() || {};

            for (const [notebookId, notebookData] of Object.entries(notebooksData)) {
              const notebook = notebookData as any;
              const notebookName = notebook.name || 'Untitled Notebook';

              if (notebookName.toLowerCase().includes(searchQuery)) {
                results.notebooks.push({
                  id: notebookId,
                  name: notebookName,
                  type: 'notebook',
                  workspaceId,
                  workspaceName
                });
              }

              // Get sections for this notebook
              const sectionsSnapshot = await get(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections`));
              if (sectionsSnapshot.exists()) {
                const sectionsData = sectionsSnapshot.val() || {};

                for (const [sectionId, sectionData] of Object.entries(sectionsData)) {
                  const section = sectionData as any;
                  const sectionName = section.name || 'Untitled Section';

                  if (sectionName.toLowerCase().includes(searchQuery)) {
                    results.sections.push({
                      id: sectionId,
                      name: sectionName,
                      type: 'section',
                      workspaceId,
                      workspaceName,
                      notebookId,
                      notebookName
                    });
                  }

                  // Get topics for this section
                  const topicsSnapshot = await get(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics`));
                  if (topicsSnapshot.exists()) {
                    const topicsData = topicsSnapshot.val() || {};

                    for (const [topicId, topicData] of Object.entries(topicsData)) {
                      const topic = topicData as any;
                      const topicName = topic.name || 'Untitled Topic';

                      if (topicName.toLowerCase().includes(searchQuery)) {
                        results.topics.push({
                          id: topicId,
                          name: topicName,
                          type: 'topic',
                          workspaceId,
                          workspaceName,
                          sectionId,
                          sectionName,
                          notebookId,
                          notebookName
                        });
                      }

                      // Get pages for this topic
                      const pagesSnapshot = await get(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages`));
                      if (pagesSnapshot.exists()) {
                        const pagesData = pagesSnapshot.val() || {};

                        for (const [pageId, pageData] of Object.entries(pagesData)) {
                          const page = pageData as any;
                          const pageName = page.name || 'Untitled Page';

                          if (pageName.toLowerCase().includes(searchQuery)) {
                            results.pages.push({
                              id: pageId,
                              name: pageName,
                              type: 'page',
                              workspaceId,
                              workspaceName,
                              topicId,
                              topicName,
                              sectionId,
                              sectionName,
                              notebookId,
                              notebookName
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in global search:', error);
    }

    return results;
  }, [user, workspaces]);

  // Get workspace by slug
  const getWorkspaceBySlug = useCallback((slug: string): Workspace | null => {
    return workspaces.find(ws => ws.slug === slug) || null;
  }, [workspaces]);

  // ====== Context Value ======
  const contextValue: NotebookContextType = {
    // Workspace
    workspaces,
    selectedWorkspace,
    workspacesLoading,
    createWorkspace,
    renameWorkspace,
    updateWorkspaceDescription,
    deleteWorkspace,
    selectWorkspace,
    getWorkspaceBySlug,
    // Notebook
    notebooks,
    sections,
    topics,
    pages,
    selectedNotebook,
    selectedSection,
    selectedTopic,
    selectedPage,
    loading,
    notebooksLoading,
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
    selectNotebook,
    selectSection,
    selectTopic,
    selectPage,
    gotoPage,
    getPageContent,
    updatePageContent,
    setPageParent,
    reorderSections,
    reorderTopics,
    reorderPages,
    togglePagePinned,
    globalSearch,
  };

  return (
    <NotebookContext.Provider value={contextValue}>
      {children}
    </NotebookContext.Provider>
  );
}

export const useNotebook = (): NotebookContextValue => {
  const context = useContext(NotebookContext);
  if (context === undefined) {
    throw new Error('useNotebook must be used within a NotebookProvider');
  }
  return context;
}

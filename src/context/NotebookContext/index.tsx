'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, rtdb } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, query, where, orderBy } from 'firebase/firestore';
import { ref, get, set, update, remove, onValue, off, push, query as rtdbQuery, orderByChild, equalTo } from 'firebase/database';

interface Notebook {
  id: string;
  name: string;
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
  content?: string;
  creating?: boolean;
}

interface NotebookContextType {
  notebooks: Notebook[];
  sections: Section[];
  topics: Topic[];
  pages: Page[];
  selectedNotebook: string | null;
  selectedSection: string | null;
  selectedTopic: string | null;
  selectedPage: string | null;
  loading: boolean;
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
  // Navigate to a page by id (sets notebook/section/topic/page selections)
  gotoPage: (pageId: string) => Promise<void>;
  getPageContent: (pageId: string) => Promise<string>;
  updatePageContent: (pageId: string, content: string) => Promise<void>;
  // Set or clear a page's parent relationship
  setPageParent: (pageId: string, parentPageId: string | null) => Promise<void>;
  // Persist custom order
  reorderSections: (orderedIds: string[]) => Promise<void>;
  reorderTopics: (orderedIds: string[]) => Promise<void>;
  reorderPages: (orderedIds: string[]) => Promise<void>;
}

// Define the context type with notebooks
type NotebookContextValue = NotebookContextType;

const NotebookContext = createContext<NotebookContextValue | undefined>(undefined);

export const NotebookProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
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
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);

  // Load notebooks when user changes (from users/{uid}/notebooks)
  // Load notebooks for the current user
  useEffect(() => {
    if (!user) {
      setNotebooks([]);
      setSections([]);
      setTopics([]);
      setPages([]);
      setSelectedNotebook(null);
      setSelectedSection(null);
      setSelectedTopic(null);
      setSelectedPage(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const notebooksRef = ref(rtdb, `users/${user.uid}/notebooks`);
      const unsubscribe = onValue(notebooksRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() || {};
          const notebooksList = Object.entries(data).map(([id, notebook]: [string, any]) => ({
            id,
            name: notebook.name || 'Untitled Notebook',
          }));
          setNotebooks(notebooksList);
        }
        setLoading(false);
      }, (error) => {
        console.error('Error loading notebooks:', error);
        setLoading(false);
      });

      return () => {
        try {
          unsubscribe();
        } catch (e) {}
      };
    } catch (error) {
      console.error('Error setting up notebooks listener:', error);
      setLoading(false);
    }
  }, [user]);

  // Load sections when notebook is selected (from notebooks/{notebookId}/sections)
  useEffect(() => {
    if (!user || !selectedNotebook) {
      setSections([]);
      setSelectedSection(null);
      setSectionsLoading(false);
      return;
    }

    try {
      setSectionsLoading(true);
      const sectionsRef = ref(rtdb, `notebooks/${selectedNotebook}/sections`);
      const unsubscribe = onValue(sectionsRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, { name?: string; order?: number; createdAt?: number }>;
        const sectionsList = Object.entries(data).map(([id, section]) => ({
          id,
          name: section.name ?? 'Untitled Section',
          order: section.order,
          createdAt: section.createdAt || 0,
        }));
        // Sort by custom order if present, else by createdAt
        sectionsList.sort((a, b) => {
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          return ao - bo;
        });
        setSections(sectionsList);
        // No auto-selection - let the user choose what to select
        setSectionsLoading(false);
      }, (error) => {
        // console.error('Error loading sections:', error);
        setSectionsLoading(false);
      });

      return () => {
        try {
          unsubscribe();
        } catch (e) {
          // console.error('Error unsubscribing from sections:', e);
        }
      };
    } catch (error) {
      // console.error('Error setting up sections listener:', error);
      setSectionsLoading(false);
    }
  }, [user, selectedNotebook]);

  // Load topics when section is selected (from notebooks/{notebook}/sections/{section}/topics)
  useEffect(() => {
    if (!user || !selectedNotebook || !selectedSection) {
      setTopics([]);
      setSelectedTopic(null);
      setTopicsLoading(false);
      return;
    }

    try {
      setTopicsLoading(true);
      const topicsRef = ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics`);
      const unsubscribe = onValue(topicsRef, (snapshot) => {
        const data = (snapshot.val() || {}) as Record<string, { name?: string; order?: number; createdAt?: number }>;
        const topicsList = Object.entries(data).map(([id, topic]) => ({
          id,
          name: topic.name ?? 'Untitled Topic',
          order: topic.order,
          createdAt: topic.createdAt || 0,
        }));
        // Sort by custom order if present, else by createdAt
        topicsList.sort((a, b) => {
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          return ao - bo;
        });
        setTopics(topicsList);
        // No auto-selection - let the user choose what to select
        setTopicsLoading(false);
      }, (error) => {
        // console.error('Error loading topics:', error);
        setTopicsLoading(false);
      });

      return () => {
        try {
          unsubscribe();
        } catch (e) {
          // console.error('Error unsubscribing from topics:', e);
        }
      };
    } catch (error) {
      // console.error('Error setting up topics listener:', error);
      setTopicsLoading(false);
    }
  }, [user, selectedNotebook, selectedSection]);

  // Load pages when topic is selected (from notebooks/{notebook}/sections/{section}/topics/{topic}/pages)
  useEffect(() => {
    if (!user || !selectedNotebook || !selectedSection || !selectedTopic) {
      setPages([]);
      setSelectedPage(null);
      setPagesLoading(false);
      return;
    }

    // Use ref to track current sort preference to avoid re-renders
    const sortByRef = { current: localStorage.getItem('onenot:pageSortBy:last') || 'updated' };
    // Track if component is still mounted
    const mountedRef = { current: true };
    
    // Cache sorted pages to avoid unnecessary re-renders 
    const lastSortedPagesRef = { current: new Map<string, Page[]>() };
    let currentPagesMap = new Map<string, Page>();

    // Sort helper function with stable output and memoization
    const sortPages = (list: Page[], sortBy: string): Page[] => {
      // Simple hash function for arrays
      const hashList = (items: Page[]): string => {
        return items.map(p => 
          `${p.id}:${p.lastUpdated}:${p.order}:${p.creating ? 1 : 0}`
        ).join('|');
      };

      const cacheKey = `${sortBy}-${hashList(list)}`;
      const cached = lastSortedPagesRef.current.get(cacheKey);
      if (cached) return cached;

      const sorted = [...list];
      const now = Date.now();

      if (sortBy === 'custom') {
        sorted.sort((a, b) => {
          // New pages (creating=true) always go to the top
          if (a.creating && !b.creating) return -1;
          if (!a.creating && b.creating) return 1;
          // Then sort by order/created
          const ao = a.order ?? a.createdAt ?? 0;
          const bo = b.order ?? b.createdAt ?? 0;
          const orderDiff = ao - bo;
          // Ensure stable sort
          return orderDiff || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
        });
      } else if (sortBy === 'created') {
        sorted.sort((a, b) => {
          // New pages always first
          if (a.creating && !b.creating) return -1;
          if (!a.creating && b.creating) return 1;
          const diff = a.createdAt - b.createdAt;
          return diff || (a.id < b.id ? -1 : 1);
        });
      } else {
        // Default: sort by lastUpdated
        sorted.sort((a, b) => {
          // New pages always first
          if (a.creating && !b.creating) return -1;
          if (!a.creating && b.creating) return 1;
          const diff = b.lastUpdated - a.lastUpdated;
          return diff || b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1);
        });
      }

      // Cache the sorted result with improved memory management
      lastSortedPagesRef.current.set(cacheKey, sorted);
      if (lastSortedPagesRef.current.size > 10) {
        const keys = Array.from(lastSortedPagesRef.current.keys());
        for (let i = 0; i < keys.length - 5; i++) {
          lastSortedPagesRef.current.delete(keys[i]);
        }
      }

      return sorted;
    };

    try {
      setPagesLoading(true);
      const pagesRef = ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`);
      
      // Watch for sort preference changes without causing re-renders
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

      // Debounce updates to avoid rapid re-renders
      let batchTimeout: any = null;

      // Subscribe to page changes with debounced batch updates
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
        }>;
        
        // Convert to a Map for efficient duplicate detection
        const newPagesMap = new Map<string, Page>();
        
        Object.entries(data).forEach(([id, page]) => {
          // Skip if we already have this exact version
          const existing = currentPagesMap.get(id);
          if (existing && 
              existing.name === (page.name ?? 'Untitled Page') &&
              existing.lastUpdated === (page.lastUpdated || page.updatedAt || 0) &&
              existing.order === page.order &&
              existing.parentPageId === (page.parentPageId || null)) {
            newPagesMap.set(id, existing);
            return;
          }

          // Create new page object only if needed
          newPagesMap.set(id, {
            id,
            name: page.name ?? 'Untitled Page',
            lastUpdated: page.lastUpdated || page.updatedAt || 0,
            createdAt: page.createdAt || 0,
            order: page.order,
            parentPageId: page.parentPageId || null,
            owner: page.owner || page.createdBy || undefined,
            creating: !!page.creating
          });
        });

        // Clear any pending timeout
        if (batchTimeout) clearTimeout(batchTimeout);

        // Schedule a new batch update
        batchTimeout = setTimeout(() => {
          if (!mountedRef.current) return;

          const finalPages = Array.from(newPagesMap.values());
          const sorted = sortPages(finalPages, sortByRef.current);
          
          // Update our tracking Map
          currentPagesMap = newPagesMap;
          
          setPages(sorted);
          setPagesLoading(false);
        }, 16); // Reduced to single frame delay

      }, (error) => {
        if (mountedRef.current) setPagesLoading(false);
      });

      return () => {
        mountedRef.current = false;
        window.removeEventListener('storage', handleSortChange);
        if (batchTimeout) clearTimeout(batchTimeout);
        try { unsubscribe(); } catch (error) {
        console.error('Error unsubscribing:', error);
      }
      };
    } catch (error) {
      if (mountedRef.current) setPagesLoading(false);
    }
  }, [user, selectedNotebook, selectedSection, selectedTopic]);

  const selectNotebook = useCallback((id: string | null) => {
    if (selectedNotebookRef.current === id) return;
    setSelectedNotebook(id);
    setSelectedSection(null);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, [selectedNotebookRef]);

  const selectSection = useCallback((id: string | null) => {
    if (selectedSectionRef.current === id) return;
    setSelectedSection(id);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, [selectedSectionRef]);

  const selectTopic = useCallback((id: string | null) => {
    if (selectedTopicRef.current === id) return;
    setSelectedTopic(id);
    setSelectedPage(null);
  }, [selectedTopicRef]);

  const selectPage = useCallback((id: string | null) => {
    setSelectedPage((prev) => (prev === id ? prev : id));
  }, []);

  const createNotebook = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    try {
      const now = Date.now();
  // Prevent duplicate notebook names for this user (case-insensitive)
  const existingSnap = await get(ref(rtdb, `users/${user.uid}/notebooks`));
  const existing = (existingSnap.val() || {}) as Record<string, { name?: string }>
  const exists = Object.values(existing).some((n) => (n.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  if (exists) throw new Error('A notebook with this name already exists');
  // Create under top-level notebooks and link under users
  const newNotebookRef = push(ref(rtdb, `notebooks`));
  const notebookId = newNotebookRef.key;
  if (!notebookId) throw new Error('Failed to create notebook');
  // 1) Top-level notebooks
      await set(ref(rtdb, `notebooks/${notebookId}`), {
        owner: user.uid,
        name,
        createdAt: now,
        updatedAt: now,
        sections: {},
      });
  // 2) Link notebook under users/${uid}/notebooks map
      await set(ref(rtdb, `users/${user.uid}/notebooks/${notebookId}`), {
        name,
        createdAt: now,
        updatedAt: now,
      });
      // Auto-select the newly created notebook
      try { selectNotebook(notebookId); } catch (error) {
        console.error('Error selecting notebook:', error);
      }
    } catch (error) {
      // console.error('Error creating notebook:', error);
      throw error;
    }
  };

  const createSection = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook) throw new Error('No notebook selected');
    try {
  const now = Date.now();
  // Prevent duplicate section names within the selected notebook (case-insensitive)
  const sectionsSnap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections`));
  const existingSections = (sectionsSnap.val() || {}) as Record<string, { name?: string; order?: number }>
  const dup = Object.values(existingSections).some((s) => (s.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  if (dup) throw new Error('A section with this name already exists in this notebook');
  // compute next order index for sections
  const sectionsData = existingSections as Record<string, { order?: number }>; 
  const maxOrder = Object.values(sectionsData).reduce((acc, s) => Math.max(acc, s.order ?? -1), -1);
  const nextOrder = maxOrder + 1;
  const newSectionRef = push(ref(rtdb, `notebooks/${selectedNotebook}/sections`));
  const sectionId = newSectionRef.key;
  if (!sectionId) throw new Error('Failed to create section');
  // Top-level notebooks/{notebookId}/sections
      await set(ref(rtdb, `notebooks/${selectedNotebook}/sections/${sectionId}`), {
        owner: user.uid,
        name,
        createdAt: now,
        updatedAt: now,
    order: nextOrder,
        topics: {},
      });
      // Auto-select the newly created section
      try { selectSection(sectionId); } catch (error) {
        console.error('Error selecting section:', error);
      }
    } catch (error) {
      // console.error('Error creating section:', error);
      throw error;
    }
  };

  const createTopic = async (name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection) throw new Error('No section selected');
    try {
  const now = Date.now();
  // Prevent duplicate topic names within the selected section (case-insensitive)
  const topicsSnap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics`));
  const topicsData = (topicsSnap.val() || {}) as Record<string, { name?: string; order?: number }>;
  const dup = Object.values(topicsData).some((t) => (t.name || '').trim().toLowerCase() === name.trim().toLowerCase());
  if (dup) throw new Error('A topic with this name already exists in this section');
  // compute next order index for topics
  const maxOrder = Object.values(topicsData).reduce((acc, t) => Math.max(acc, t.order ?? -1), -1);
  const nextOrder = maxOrder + 1;
  const newTopicRef = push(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics`));
  const topicId = newTopicRef.key;
  if (!topicId) throw new Error('Failed to create topic');
  // Top-level notebooks/{notebookId}/sections/{sectionId}/topics
      await set(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${topicId}`), {
        owner: user.uid,
        name,
        createdAt: now,
        updatedAt: now,
    order: nextOrder,
        pages: {},
      });
      // Auto-select the newly created topic
      try { selectTopic(topicId); } catch (error) {
        console.error('Error selecting topic:', error);
      }
    } catch (error) {
      // console.error('Error creating topic:', error);
      throw error;
    }
  };

  const createPage = async (name: string, parentPageId?: string): Promise<string> => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection || !selectedTopic) {
      throw new Error('Please select notebook, section, and topic first');
    }
    
    const now = Date.now();
    const pagesSnap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`));
    const pagesData = (pagesSnap.val() || {}) as Record<string, { name?: string; order?: number }>;
    
    // Prevent duplicate page names within the selected topic (case-insensitive)
    const dup = Object.values(pagesData).some((p) => (p.name || '').trim().toLowerCase() === name.trim().toLowerCase());
    if (dup) throw new Error('A page with this name already exists in this topic');
    
    const maxOrder = Object.values(pagesData).reduce((acc, p) => Math.max(acc, p.order ?? -1), -1);
    const nextOrder = maxOrder + 1;
    const pageId = crypto.randomUUID();

    try {
      const pageDocRef = doc(db, 'pages', pageId);
      const pagePath = `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${pageId}`;
      
      // Create optimistic RTDB update first for immediate UI update
      const rtdbUpdates: Record<string, any> = {
        [`${pagePath}/name`]: name,
        [`${pagePath}/lastUpdated`]: now,
        [`${pagePath}/createdAt`]: now,
        [`${pagePath}/order`]: nextOrder,
        [`${pagePath}/owner`]: user.uid,
        [`${pagePath}/creating`]: true,
     
        [`users/${user.uid}/pageIndex/${pageId}`]: {
          notebookId: selectedNotebook,
          sectionId: selectedSection,
          topicId: selectedTopic,
          parentPageId: parentPageId ?? null,
          owner: user.uid,
          name,
        },
      };
      
      if (parentPageId) {
        rtdbUpdates[`${pagePath}/parentPageId`] = parentPageId;
      }
      
      // Perform RTDB update first to show the page immediately
      await update(ref(rtdb), rtdbUpdates);

      // Then create Firestore doc as source of truth (only store content, name, and owner)
      await setDoc(pageDocRef, {
        content: '',
        name,
        owner: user.uid,
      });

      // Clear creating flag after successful creation
      // But delay slightly to ensure the page appears in the UI first
      setTimeout(() => {
        update(ref(rtdb), {
          [`${pagePath}/creating`]: null
        }).catch(console.error); // Non-blocking cleanup
      }, 500);

      return pageId;
    } catch (error) {
      // Clean up RTDB entry on error
      try {
        const pagePath = `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${pageId}`;
        await remove(ref(rtdb, pagePath));
      } catch (cleanupError) {
        console.error('Error during page creation cleanup:', cleanupError);
      } 
      console.error('Error creating page:', error);
      throw error;
    }
  };

  // Reorder helpers: set order sequentially based on provided IDs
  const reorderSections = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook) throw new Error('No notebook selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`notebooks/${selectedNotebook}/sections/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  const reorderTopics = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection) throw new Error('No section selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  const reorderPages = async (orderedIds: string[]) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');
    const updates: Record<string, number> = {};
    orderedIds.forEach((id, idx) => {
      updates[`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/order`] = idx;
    });
    await update(ref(rtdb), updates);
  };

  // Rename operations
  const renameNotebook = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    const now = Date.now();
    await update(ref(rtdb), {
      [`notebooks/${id}/name`]: name,
      [`notebooks/${id}/updatedAt`]: now,
      [`users/${user.uid}/notebooks/${id}/name`]: name,
      [`users/${user.uid}/notebooks/${id}/updatedAt`]: now,
    });
  };

  const renameSection = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook) throw new Error('No notebook selected');
    const now = Date.now();
    await update(ref(rtdb), {
      [`notebooks/${selectedNotebook}/sections/${id}/name`]: name,
      [`notebooks/${selectedNotebook}/sections/${id}/updatedAt`]: now,
    });
  };

  const renameTopic = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection) throw new Error('No section selected');
    const now = Date.now();
    await update(ref(rtdb), {
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/name`]: name,
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}/updatedAt`]: now,
    });
  };

  const renamePage = async (id: string, name: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');
    const pageMeta = pages.find((p) => p.id === id);
    const owner = (pageMeta as any)?.createdBy || (pageMeta as any)?.owner;
    if (owner && owner !== user.uid) throw new Error('Forbidden');
    const now = Date.now();
    // RTDB metadata
    await update(ref(rtdb), {
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/name`]: name,
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/updatedAt`]: now,
      [`users/${user.uid}/pageIndex/${id}/name`]: name,
    });
    // Firestore doc name
    await updateDoc(doc(db, 'pages', id), { name, owner: owner ?? user.uid });
  };

  // Cover/Unsplash removed

  // Helpers to collect page IDs for cascading deletes
  const collectPageIdsFromNotebook = (nb: unknown): string[] => {
    const pages: string[] = [];
    const notebook = (nb as { sections?: Record<string, { topics?: Record<string, { pages?: Record<string, unknown> }> }> }) || {};
    const sections = notebook.sections || {};
    Object.values(sections).forEach((section) => {
      const topics = section?.topics || {};
      Object.values(topics).forEach((topic) => {
        const topicPages = topic?.pages || {};
        Object.keys(topicPages).forEach((pid) => pages.push(pid));
      });
    });
    return pages;
  };

  const collectPageIdsFromSection = (sec: unknown): string[] => {
    const pages: string[] = [];
    const section = (sec as { topics?: Record<string, { pages?: Record<string, unknown> }> }) || {};
    const topics = section.topics || {};
    Object.values(topics).forEach((topic) => {
      const topicPages = topic?.pages || {};
      Object.keys(topicPages).forEach((pid) => pages.push(pid));
    });
    return pages;
  };

  const collectPageIdsFromTopic = (tp: unknown): string[] => {
    const pages: string[] = [];
    const topic = (tp as { pages?: Record<string, unknown> }) || {};
    const topicPages = topic.pages || {};
    Object.keys(topicPages).forEach((pid) => pages.push(pid));
    return pages;
  };

  const deleteNotebook = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    // Fetch notebook tree to collect page IDs
    const snap = await get(ref(rtdb, `notebooks/${id}`));
    const nb = snap.val();
    const pageIds = collectPageIdsFromNotebook(nb);
    // Delete pages via API (server handles share/file/RTDB cleanup)
    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during notebook deletion:', error);
    }
    // Remove RTDB nodes
    await remove(ref(rtdb, `notebooks/${id}`));
    await remove(ref(rtdb, `users/${user.uid}/notebooks/${id}`));
    // Clear selections if they belonged to this notebook
    if (selectedNotebook === id) selectNotebook(null);
  };

  const deleteSection = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook) throw new Error('No notebook selected');
    const snap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections/${id}`));
    const sec = snap.val();
    const pageIds = collectPageIdsFromSection(sec);
    // Delete pages via API (server handles share/file/RTDB cleanup)
    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during section deletion:', error);
    }
    await remove(ref(rtdb, `notebooks/${selectedNotebook}/sections/${id}`));
    if (selectedSection === id) selectSection(null);
  };

  const deleteTopic = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection) throw new Error('No section selected');
    const snap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    const tp = snap.val();
    const pageIds = collectPageIdsFromTopic(tp);
    // Delete pages via API (server handles share/file/RTDB cleanup)
    try {
      await Promise.all(
        pageIds.map((pid) => fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' }).catch(() => undefined))
      );
    } catch (error) {
      console.error('Error during topic deletion:', error);
    }
    await remove(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    if (selectedTopic === id) selectTopic(null);
  };

  const deletePage = async (id: string) => {
    if (!user) throw new Error('User not authenticated');

    // Collect the entire descendant tree (bottom-up deletion avoids orphaned refs)
    type Meta = { notebookId?: string; sectionId?: string; topicId?: string; createdBy?: string };
    const metaById = new Map<string, Meta>();
    const allIds: string[] = [];
    const queue: string[] = [id];
    const seen = new Set<string>([id]);

    // Helper: load metadata for a page id
    const loadMeta = async (pid: string): Promise<Meta> => {
      const snap = await getDoc(doc(db, 'pages', pid));
      const data: any = snap.exists() ? (snap.data() || {}) : {};
      const meta: Meta = {
        notebookId: data.notebookId,
        sectionId: data.sectionId,
        topicId: data.topicId,
        createdBy: data.createdBy,
      };
      metaById.set(pid, meta);
      return meta;
    };

    // BFS to gather descendants
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
      // Also check RTDB mapping for legacy pages missing parentPageId in Firestore
      try {
        const nb = curMeta.notebookId ?? selectedNotebook;
        const sec = curMeta.sectionId ?? selectedSection;
        const tp = curMeta.topicId ?? selectedTopic;
        if (nb && sec && tp) {
          const base = `notebooks/${nb}/sections/${sec}/topics/${tp}/pages`;
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

    // Delete from leaves to root
    for (let i = allIds.length - 1; i >= 0; i--) {
      const pid = allIds[i];
      const meta = metaById.get(pid) || {};
      if (meta.createdBy && meta.createdBy !== user.uid) continue; // skip unauthorized

      // Call our API to delete the page server-side (handles shares/files/RTDB cleanup)
      try {
        await fetch(`/api/pages/${encodeURIComponent(pid)}/delete`, { method: 'DELETE' });
      } catch (error) {
        console.error(`Error deleting page ${pid} via API:`, error);
      }

      // Fallback client-side cleanup if API is unavailable
      try { 
        await deleteDoc(doc(db, 'pages', pid)); 
      } catch (error) {
        console.error(`Error deleting Firestore document for page ${pid}:`, error);
      }
      
      const nb = meta.notebookId ?? selectedNotebook;
      const sec = meta.sectionId ?? selectedSection;
      const tp = meta.topicId ?? selectedTopic;
      if (nb && sec && tp) {
        try { 
          await remove(ref(rtdb, `notebooks/${nb}/sections/${sec}/topics/${tp}/pages/${pid}`)); 
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
    }
  };

  // Set or clear parentPageId for an existing page
  const setPageParent = useCallback(async (pageId: string, parentPageId: string | null) => {
    if (!user) throw new Error('User not authenticated');
    if (pageId === parentPageId) return; // Prevent self-referential links

    try {
      const pageMeta = pages.find(p => p.id === pageId);
      const owner = (pageMeta as any)?.createdBy || (pageMeta as any)?.owner;
      if (owner && owner !== user.uid) {
        throw new Error('Forbidden');
      }

      const updates: Record<string, any> = {
        [`users/${user.uid}/pageIndex/${pageId}/parentPageId`]: parentPageId ?? null,
      };

      if (selectedNotebook && selectedSection && selectedTopic) {
        const pagePath = `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${pageId}`;
        updates[`${pagePath}/parentPageId`] = parentPageId ?? null;
        updates[`${pagePath}/lastUpdated`] = Date.now();
      }

      await update(ref(rtdb), updates);
    } catch (error) {
      console.error('Error updating page parent:', error);
      throw error;
    }
  }, [user, pages, selectedNotebook, selectedSection, selectedTopic]);


  const getPageContent = useCallback(async (pageId: string): Promise<string> => {
    try {
      if (!user) return '';

      const page = pages.find(p => p.id === pageId);
      if (!page) return '';

      const owner = (page as any).createdBy || (page as any).owner;
      if (owner && owner !== user.uid) {
        throw new Error('Forbidden');
      }

      const pageDoc = await getDoc(doc(db, 'pages', pageId));
      if (!pageDoc.exists()) return '';

      const pageData: any = pageDoc.data() || {};
      const ownerFromDoc = pageData.owner as string | undefined;
      if (ownerFromDoc && ownerFromDoc !== user.uid) {
        throw new Error('Forbidden');
      }

      return (pageData.content as string) || '';
    } catch (error) {
      console.error('Error getting page content:', error);
      return '';
    }
  }, [user, pages]);



  // Navigate to a page by id by looking up its location in RTDB
  const gotoPage = useCallback(async (pageId: string) => {
    if (!user || !pageId) return;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (predicate: () => boolean, timeoutMs = 4000) => {
      const startTime = Date.now();
      while (Date.now() - startTime < timeoutMs) {
        if (predicate()) return true;
        await sleep(50);
      }
      return predicate();
    };
    try {
      // First, verify page ownership
      const pageRef = ref(rtdb, `users/${user.uid}/pageIndex/${pageId}`);
      const pageSnap = await get(pageRef);
      
      if (!pageSnap.exists()) {
        console.error('Page not found or access denied');
        return;
      }
      
      const pageData = pageSnap.val();
      if (pageData.owner && pageData.owner !== user.uid) {
        console.error('You do not have permission to view this page');
        return;
      }

      // Check current pages first for quick navigation
      const existing = pagesRef.current.find((p) => p.id === pageId);
      if (existing) {
        setSelectedPage((prev) => (prev === pageId ? prev : pageId));
        return;
      }

      // Use the page data we already have
      let notebookId = pageData.notebookId;
      let sectionId = pageData.sectionId;
      let topicId = pageData.topicId;
      let locatedName = pageData.name ?? null;

      // If not in index, search through notebooks
      if (!notebookId || !sectionId || !topicId) {
        const userNotebooksSnap = await get(ref(rtdb, `users/${user.uid}/notebooks`));
        const userNotebooks = (userNotebooksSnap.val() || {}) as Record<string, any>;
        let found = false;

        for (const nbId of Object.keys(userNotebooks)) {
          const sectionsSnap = await get(ref(rtdb, `notebooks/${nbId}/sections`));
          const sectionsMap = (sectionsSnap.val() || {}) as Record<string, any>;
          for (const [sectionKey, sectionVal] of Object.entries(sectionsMap)) {
            const topicsMap = (sectionVal?.topics || {}) as Record<string, any>;
            for (const [topicKey, topicVal] of Object.entries(topicsMap)) {
              const topicPages = (topicVal?.pages || {}) as Record<string, any>;
              const pageMeta = topicPages[pageId];
              if (!pageMeta) continue;

              notebookId = nbId;
              sectionId = sectionKey;
              topicId = topicKey;
              locatedName = pageMeta.name ?? locatedName;
              found = true;
              break;
            }
            if (found) break;
          }
          if (found) break;
        }

        if (!found) {
          throw new Error('Page metadata not found');
        }

        // Update page index for faster future lookups
        if (!pageData || !pageData.notebookId || !pageData.sectionId || !pageData.topicId) {
          await update(ref(rtdb), {
            [`users/${user.uid}/pageIndex/${pageId}`]: {
              notebookId,
              sectionId,
              topicId,
              name: locatedName ?? '',
            },
          });
        }
      }

      // Return early if location wasn't found
      if (!notebookId || !sectionId || !topicId) {
        return;
      }

      // Update selections and wait for them to take effect
      if (selectedNotebookRef.current !== notebookId) {
        setSelectedNotebook(notebookId);
      }
      const notebookReady = await waitFor(() => selectedNotebookRef.current === notebookId);
      if (!notebookReady) return;

      if (selectedSectionRef.current !== sectionId) {
        setSelectedSection(sectionId);
      }
      const sectionReady = await waitFor(() => selectedSectionRef.current === sectionId);
      if (!sectionReady) return;

      if (selectedTopicRef.current !== topicId) {
        setSelectedTopic(topicId);
      }
      const topicReady = await waitFor(() => selectedTopicRef.current === topicId);
      if (!topicReady) return;

      // Wait for page to be loaded into pages state
      const loaded = await waitFor(() => pagesRef.current.some((p) => p.id === pageId));
      if (!loaded) return;

      setSelectedPage((prev) => (prev === pageId ? prev : pageId));
    } catch (error) {
      console.error('Error navigating to page:', error);
      throw error;
    }
  }, [user]);

  // Define the context value
  const contextValue: NotebookContextType = {
    notebooks,
    sections,
    topics,
    pages,
    selectedNotebook,
    selectedSection,
    selectedTopic,
    selectedPage,
    loading,
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
    updatePageContent: async (pageId: string, content: string) => {
      if (!user) throw new Error('User not authenticated');
      const pageMeta = pagesRef.current.find((p) => p.id === pageId);
      const owner = (pageMeta as any)?.createdBy || (pageMeta as any)?.owner;
      if (owner && owner !== user.uid) throw new Error('Forbidden');
      const pageRef = doc(db, 'pages', pageId);
      await updateDoc(pageRef, { content, owner: owner ?? user.uid });
    },
    setPageParent,
    reorderSections,
    reorderTopics,
    reorderPages,
  };
  return (
    <NotebookContext.Provider value={contextValue}>
      {React.Children.map(children, (child, index) => (
        <React.Fragment key={(child as any)?.key ?? `nbp-${index}`}>{child}</React.Fragment>
      ))}
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

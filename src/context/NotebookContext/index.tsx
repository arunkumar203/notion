'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { db, rtdb } from '@/lib/firebase';
import { ref, onValue, set, push, update, get, remove } from 'firebase/database';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

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

interface Page {
  id: string;
  name: string;
  lastUpdated: number;
  createdAt: number;
  order?: number;
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
  createPage: (name: string) => Promise<string>;
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
  getPageContent: (pageId: string) => Promise<string>;
  updatePageContent: (pageId: string, content: string) => Promise<void>;
  // Persist custom order
  reorderSections: (orderedIds: string[]) => Promise<void>;
  reorderTopics: (orderedIds: string[]) => Promise<void>;
  reorderPages: (orderedIds: string[]) => Promise<void>;
}

const NotebookContext = createContext<NotebookContextType | undefined>(undefined);

export const NotebookProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedNotebook, setSelectedNotebook] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [pagesLoading, setPagesLoading] = useState(false);

  // Load notebooks when user changes (from users/{uid}/notebooks)
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
        const data = (snapshot.val() || {}) as Record<string, { name?: string }>;
        const notebooksList = Object.entries(data).map(([id, nb]) => ({
          id,
          name: nb.name ?? 'Untitled Notebook',
        }));
        setNotebooks(notebooksList);
        setLoading(false);
      }, (error) => {
        // console.error('Error loading notebooks:', error);
        setLoading(false);
      });

      return () => {
        try {
          unsubscribe();
        } catch (e) {
          // console.error('Error unsubscribing from notebooks:', e);
        }
      };
    } catch (error) {
      // console.error('Error setting up notebooks listener:', error);
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

    try {
      setPagesLoading(true);
      const pagesRef = ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`);
      const unsubscribe = onValue(pagesRef, (snapshot) => {
  const data = (snapshot.val() || {}) as Record<string, { name?: string; lastUpdated?: number; updatedAt?: number; createdAt?: number; order?: number }>;
        const pagesList = Object.entries(data).map(([id, page]) => ({
          id,
          name: page.name ?? 'Untitled Page',
          // Prefer lastUpdated, fall back to updatedAt for backward compatibility
          lastUpdated: page.lastUpdated || page.updatedAt || 0,
          createdAt: page.createdAt || 0,
          order: page.order,
        }));
        // Do not sort here; UI will sort by created/updated/custom
        setPages(pagesList);
        setPagesLoading(false);
      }, (error) => {
        // console.error('Error loading pages:', error);
        setPagesLoading(false);
      });

      return () => {
        try {
          unsubscribe();
        } catch (e) {
          // console.error('Error unsubscribing from pages:', e);
        }
      };
    } catch (error) {
      // console.error('Error setting up pages listener:', error);
      setPagesLoading(false);
    }
  }, [user, selectedNotebook, selectedSection, selectedTopic]);

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
    } catch (error) {
      // console.error('Error creating topic:', error);
      throw error;
    }
  };

  const createPage = async (name: string): Promise<string> => {
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

    const pageData = {
      name,
      lastUpdated: now,
      updatedAt: now,
      createdAt: now,
      order: nextOrder,
    };
    
    try {
  // Add under top-level notebooks tree (metadata)
  const newPageRef = push(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages`));
  const pageId = newPageRef.key;

      if (!pageId) throw new Error('Failed to create page');
  await set(newPageRef, { ...pageData, owner: user.uid });
      
      // Create in Firestore for rich text content
      const pageDocRef = doc(db, 'pages', pageId);
      await setDoc(pageDocRef, {
        content: '',
        createdBy: user.uid,
        notebookId: selectedNotebook,
        sectionId: selectedSection,
        topicId: selectedTopic,
        name,
        createdAt: now,
        updatedAt: now,
      });
      
      // Return the page ID for any immediate use
      return pageId;
    } catch (error) {
      // console.error('Error creating page:', error);
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
    const now = Date.now();
    // RTDB metadata
    await update(ref(rtdb), {
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/name`]: name,
      [`notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}/updatedAt`]: now,
    });
    // Firestore doc name
    await updateDoc(doc(db, 'pages', id), { name, updatedAt: now });
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
    // Best-effort: revoke any shares for these pages
    try {
      await Promise.all(
        pageIds.map((pid) =>
          fetch('/api/share', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: pid }),
          }).catch(() => undefined)
        )
      );
    } catch {}
    // Delete Firestore pages first
    await Promise.all(pageIds.map((pid) => deleteDoc(doc(db, 'pages', pid)).catch(() => {})));
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
    // Best-effort: revoke any shares for these pages
    try {
      await Promise.all(
        pageIds.map((pid) =>
          fetch('/api/share', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: pid }),
          }).catch(() => undefined)
        )
      );
    } catch {}
    await Promise.all(pageIds.map((pid) => deleteDoc(doc(db, 'pages', pid)).catch(() => {})));
    await remove(ref(rtdb, `notebooks/${selectedNotebook}/sections/${id}`));
    if (selectedSection === id) selectSection(null);
  };

  const deleteTopic = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection) throw new Error('No section selected');
    const snap = await get(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    const tp = snap.val();
    const pageIds = collectPageIdsFromTopic(tp);
    // Best-effort: revoke any shares for these pages
    try {
      await Promise.all(
        pageIds.map((pid) =>
          fetch('/api/share', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pageId: pid }),
          }).catch(() => undefined)
        )
      );
    } catch {}
    await Promise.all(pageIds.map((pid) => deleteDoc(doc(db, 'pages', pid)).catch(() => {})));
    await remove(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${id}`));
    if (selectedTopic === id) selectTopic(null);
  };

  const deletePage = async (id: string) => {
    if (!user) throw new Error('User not authenticated');
    if (!selectedNotebook || !selectedSection || !selectedTopic) throw new Error('No topic selected');
    // Use server route to delete page content and associated Appwrite files securely
    try {
      await fetch(`/api/pages/${encodeURIComponent(id)}/delete`, { method: 'DELETE', credentials: 'include' });
    } catch {}
    // Ensure local RTDB mapping is gone (idempotent)
    await remove(ref(rtdb, `notebooks/${selectedNotebook}/sections/${selectedSection}/topics/${selectedTopic}/pages/${id}`)).catch(() => {});
    if (selectedPage === id) selectPage(null);
  };

  const getPageContent = useCallback(async (pageId: string): Promise<string> => {
    try {
      if (!user) return '';
      const pageDoc = await getDoc(doc(db, 'pages', pageId));
      if (!pageDoc.exists()) {
        // Gracefully handle missing content docs
        return '';
      }
      const pageData: any = pageDoc.data() || {};
      if (pageData.createdBy && pageData.createdBy !== user.uid) {
        // Unauthorized page; do not crash app
        return '';
      }
      return (pageData.content as string) || '';
    } catch (error) {
      // console.error('Error getting page content:', error);
      return '';
    }
  }, [user]);

  const updatePageContent = useCallback(async (pageId: string, content: string) => {
    if (!user) throw new Error('User not authenticated');
    try {
      // First verify the page exists and user has access
      const pageDoc = await getDoc(doc(db, 'pages', pageId));
      if (!pageDoc.exists()) {
        // Page was likely deleted; safely no-op
        return;
      }

      const pageData: any = pageDoc.data() || {};
      if (pageData.createdBy && pageData.createdBy !== user.uid) {
        // Not authorized; safely no-op
        return;
      }

      const now = Date.now();

      // Update Firestore
      const pageRef = doc(db, 'pages', pageId);
      await updateDoc(pageRef, {
        content,
        updatedAt: now,
      });

      // Update lastUpdated in Realtime DB (top-level notebooks tree) using stable doc location
      const notebookId: string | undefined = pageData.notebookId;
      const sectionId: string | undefined = pageData.sectionId;
      const topicId: string | undefined = pageData.topicId;
      if (notebookId && sectionId && topicId) {
        const base = `notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`;
        const updates: Record<string, number> = {};
        updates[`${base}/lastUpdated`] = now;
        updates[`${base}/updatedAt`] = now;
        await update(ref(rtdb), updates);
      }
    } catch (error) {
      // console.error('Error updating page content:', error);
      throw error;
    }
  }, [user]);

  const selectNotebook = useCallback((id: string | null) => {
    setSelectedNotebook(id);
    setSelectedSection(null);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, []);

  const selectSection = useCallback((id: string | null) => {
    setSelectedSection(id);
    setSelectedTopic(null);
    setSelectedPage(null);
  }, []);

  const selectTopic = useCallback((id: string | null) => {
    setSelectedTopic(id);
    setSelectedPage(null);
  }, []);

  const selectPage = useCallback((id: string | null) => {
    setSelectedPage(id);
  }, []);

  return (
    <NotebookContext.Provider
      value={{
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
    getPageContent,
    updatePageContent,
  reorderSections,
  reorderTopics,
  reorderPages,
      }}
    >
      {children}
    </NotebookContext.Provider>
  );
}

export const useNotebook = () => {
  const context = useContext(NotebookContext);
  if (context === undefined) {
    throw new Error('useNotebook must be used within a NotebookProvider');
  }
  return context;
};

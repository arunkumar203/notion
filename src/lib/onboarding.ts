import { rtdb, db } from '@/lib/firebase';
import { ref, set, push, runTransaction, get } from 'firebase/database';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { generateWorkspaceSlug } from './workspace-slug';

/**
 * Seeds a sample workspace for a new user (only once).
 */
export async function ensureSampleWorkspace(uid: string) {
  if (!uid) return;

  // Single atomic guard (only one client can seed)
  const seededRef = ref(rtdb, `users/${uid}/onboarding/seeded`);
  const tx = await runTransaction(seededRef, (cur) => {
    if (cur) return;   // already seeded
    return true;       // claim seeding
  });
  if (!tx.committed) return; // someone else seeded

  const now = Date.now();

  // Mark onboarding in-progress
  try {
    await set(ref(rtdb, `users/${uid}/onboarding`), { inProgress: true, startedAt: now });
  } catch { }

  // 1) Create Workspace FIRST
  const wsRef = push(ref(rtdb, `workspaces`));
  const workspaceId = wsRef.key as string;
  const workspaceName = 'My Workspace';
  const workspaceSlug = generateWorkspaceSlug(workspaceName);

  await set(ref(rtdb, `workspaces/${workspaceId}`), {
    owner: uid,
    name: workspaceName,
    slug: workspaceSlug,
    description: '',
    createdAt: now,
    updatedAt: now,
    notebooks: {},
  });
  await set(ref(rtdb, `users/${uid}/workspaces/${workspaceId}`), {
    name: workspaceName,
    slug: workspaceSlug,
    description: '',
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  });

  // 2) Notebook (inside workspace)
  const nbRef = push(ref(rtdb, `workspaces/${workspaceId}/notebooks`));
  const notebookId = nbRef.key as string;
  await set(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}`), {
    owner: uid,
    name: 'Sample Notebook',
    createdAt: now,
    updatedAt: now,
    order: 0,
    sections: {},
  });

  // 3) Section
  const sectionRef = push(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections`));
  const sectionId = sectionRef.key as string;
  await set(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}`), {
    owner: uid,
    name: 'Sample Section',
    createdAt: now,
    updatedAt: now,
    order: 0,
    topics: {},
  });

  // 4) Topic
  const topicRef = push(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics`));
  const topicId = topicRef.key as string;
  await set(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}`), {
    owner: uid,
    name: 'Sample Topic',
    createdAt: now,
    updatedAt: now,
    order: 0,
    pages: {},
  });

  // Helper: create a page (RTDB + Firestore content)
  const createPage = async (name: string, parentPageId?: string | null, order = 0, html?: string) => {
    const pageRef = push(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages`));
    const pageId = pageRef.key as string;
    await set(ref(rtdb, `workspaces/${workspaceId}/notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`), {
      owner: uid,
      name,
      createdAt: now,
      updatedAt: now,
      order,
      ...(parentPageId ? { parentPageId } : {}),
    });
    await set(ref(rtdb, `users/${uid}/pageIndex/${pageId}`), {
      workspaceId,
      notebookId,
      sectionId,
      topicId,
      parentPageId: parentPageId ?? null,
      owner: uid,
      name,
    });
    const pageDoc = doc(db, 'pages', pageId);
    const exists = await getDoc(pageDoc).then(s => s.exists()).catch(() => false);
    if (!exists) {
      await setDoc(pageDoc, {
        content: html || '',
        name,
        owner: uid,
      });
    }
    return pageId;
  };

  // 5) Sample content
  const sampleImage = 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60';
  const sampleYouTubeId = 'neOasLBWoy0';
  const sampleHtml = `
    <h2>Welcome to your Sample Page</h2>
    <p>You can paste images, embed YouTube links, upload files (up to 25 MB), and create deeply nested pages.</p>
    <p><img src="${sampleImage}" alt="Sample" /></p>
    <iframe data-youtube="true" data-video-id="${sampleYouTubeId}" allowfullscreen
      style="width:100%;aspect-ratio:16/9;border:0;"
      src="https://www.youtube.com/embed/${sampleYouTubeId}">
    </iframe>
  `;

  // Root page
  const rootPageId = await createPage('Features', null, 0, '');

  // Child + deep child
  const child1Id = await createPage('Child Page A', rootPageId, 1, '<p>This is a child page.</p>');
  const deepChildId = await createPage('Deep Child A1', child1Id, 2, '<p>Nested deeper. Breadcrumbs should show the trail.</p>');

  // Update Features page content
  const rootDoc = doc(db, 'pages', rootPageId);
  await setDoc(rootDoc, {
    content: `
      <h2>Features</h2>
      <ul><li><a href="#page:${child1Id}">Child Page A</a></li></ul>
      <h3>App features</h3>
      <ul>
        <li>Workspace hierarchy: workspaces>notebooks>sections>topics>pages>child pages</li>
        <li>secret notes</li>
        <li>Rich editor (TipTap)</li>
        <li>YouTube embeds</li>
        <li>File uploads</li>
        <li>AI assistant integration</li>
        <li>Todoist tasks</li>
        <li>Chat interface</li>
        <li>Tables and Kanban Board</li>
        <li>Realtime sync</li>
      </ul>
      ${sampleHtml}
    `,
    name: 'Features',
    updatedAt: now,
  }, { merge: true });

  // Update Child Page A content
  const childDoc = doc(db, 'pages', child1Id);
  await setDoc(childDoc, {
    content: `
      <h2>Child Page A</h2>
      <ul><li><a href="#page:${deepChildId}">Deep Child A1</a></li></ul>
      <p>This is a child page.</p>
    `,
    updatedAt: now,
  }, { merge: true });

  // Mark onboarding finished
  try {
    await set(ref(rtdb, `users/${uid}/onboarding`), { inProgress: false, finishedAt: Date.now(), seeded: true });
  } catch { }
}

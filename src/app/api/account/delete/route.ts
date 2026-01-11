// src/app/api/account/delete/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

export async function POST() {
  try {
    if (!adminAuth) {
      return NextResponse.json({ error: 'Server not ready' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value || '';
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const uid = decoded?.uid as string;
    if (!uid) {
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }


    const rtdb = admin.database();
    const fs = admin.firestore();

    try {
      // 1. Get all user's notebooks
      const userNotebooksRef = rtdb.ref(`users/${uid}/notebooks`);
      const userNotebooksSnap = await userNotebooksRef.once('value');
      const userNotebooks = userNotebooksSnap.val() || {};
      const notebookIds = Object.keys(userNotebooks);
      
      // 2. Delete each notebook using the same logic as in NotebookContext

      
      // Helper function to recursively collect all page IDs from a notebook
      const collectPageIdsFromNotebook = (notebook: any): string[] => {
        if (!notebook) return [];
        const pages: string[] = [];
        
        // Check if notebook has sections
        if (notebook.sections) {
          Object.values(notebook.sections).forEach((section: any) => {
            if (section.topics) {
              Object.values(section.topics).forEach((topic: any) => {
                if (topic.pages) {
                  Object.keys(topic.pages).forEach(pageId => pages.push(pageId));
                }
              });
            }
          });
        }
        return pages;
      };
      
      for (const notebookId of notebookIds) {
        try {
          // Fetch notebook tree to collect page IDs
          const snap = await rtdb.ref(`notebooks/${notebookId}`).once('value');
          const notebook = snap.val();
          const pageIds = collectPageIdsFromNotebook(notebook);
          
          // Delete all pages via API
          await Promise.all(
            pageIds.map((pageId: string) => 
              fetch(`/api/pages/${encodeURIComponent(pageId)}/delete`, { 
                method: 'DELETE',
                headers: { 'Cookie': `session=${session}` },
                credentials: 'include'
              }).catch(() => undefined)
            )
          );
          
          // Remove RTDB nodes
          await rtdb.ref(`notebooks/${notebookId}`).remove();
          await userNotebooksRef.child(notebookId).remove();
          

          
        } catch (err) {
          console.error(`Error deleting notebook ${notebookId}:`, err);
          // Continue with other notebooks even if one fails
        }
      }

      // 3. Delete secret pages
      try {
        const secretPagesRef = rtdb.ref(`users/${uid}/secret/pages`);
        const secretPagesSnap = await secretPagesRef.once('value');
        const secretPages = secretPagesSnap.val() || {};
        
        const batch = fs.batch();
        Object.keys(secretPages).forEach(secretId => {
          batch.delete(fs.collection('secret').doc(secretId));
        });
        
        await batch.commit().catch(console.error);
        await rtdb.ref(`users/${uid}/secret`).remove();
      } catch (err) {
        console.error('Error deleting secret pages:', err);
      }

      // 4. Delete remaining user data from Firestore
      try {
        const pagesCollection = fs.collection('pages');
        const seen = new Set<string>();
        const deleteDocs = async (query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>) => {
          const snapshot = await query.get();
          if (snapshot.empty) return;

          const docs = snapshot.docs.filter((doc) => {
            if (seen.has(doc.id)) return false;
            seen.add(doc.id);
            return true;
          });
          if (!docs.length) return;

          const chunkSize = 450;
          for (let i = 0; i < docs.length; i += chunkSize) {
            const chunk = docs.slice(i, i + chunkSize);
            const batch = fs.batch();
            chunk.forEach((doc) => batch.delete(doc.ref));
            await batch.commit().catch(console.error);
          }
        };

        await deleteDocs(pagesCollection.where('createdBy', '==', uid));
        await deleteDocs(pagesCollection.where('owner', '==', uid));
      } catch (err) {
        console.error('Error cleaning up Firestore data:', err);
      }

      // 6. Delete user node from RTDB
      await rtdb.ref(`users/${uid}`).remove();


      // 7. Finally, delete the auth user
      try {
        await adminAuth.deleteUser(uid);

      } catch (err) {
        console.error('Error deleting auth user:', err);
        throw new Error('Failed to delete authentication user');
      }

      return NextResponse.json({ ok: true });
      
    } catch (err: any) {
      console.error('Account deletion error:', err);
      return NextResponse.json(
        { error: err?.message || 'Failed to delete account' }, 
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error('Unexpected error in account deletion:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred during account deletion' },
      { status: 500 }
    );
  }
}

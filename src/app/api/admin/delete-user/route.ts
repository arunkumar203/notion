import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
    try {
        if (!adminAuth) {
            return jsonError(500, 'Authentication service not available');
        }

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value;

        if (!session) {
            return jsonError(401, 'Not authenticated');
        }

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const adminUid = decoded?.uid as string;

        if (!adminUid) {
            return jsonError(401, 'Admin not authenticated');
        }

        // Verify admin has root_admin role
        const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
        const adminRole = adminRoleSnapshot.val();

        if (adminRole !== 'root_admin') {
            return jsonError(403, 'Only root admins can delete user accounts');
        }

        // Get the user ID to delete from request body
        const body = await request.json().catch(() => ({}));
        const { uid: targetUid } = body || {};

        if (!targetUid) {
            return jsonError(400, 'User ID is required');
        }

        // Prevent self-deletion
        if (targetUid === adminUid) {
            return jsonError(400, 'Cannot delete your own account');
        }

        // Prevent deleting other root_admins
        const targetRoleSnapshot = await admin.database().ref(`users/${targetUid}/role`).once('value');
        const targetRole = targetRoleSnapshot.val();

        if (targetRole === 'root_admin') {
            return jsonError(403, 'Cannot delete other root admin accounts');
        }


        const rtdb = admin.database();
        const fs = admin.firestore();

        try {
            // 1. Get all user's notebooks
            const userNotebooksRef = rtdb.ref(`users/${targetUid}/notebooks`);
            const userNotebooksSnap = await userNotebooksRef.once('value');
            const userNotebooks = userNotebooksSnap.val() || {};
            const notebookIds = Object.keys(userNotebooks);

            // 2. Delete each notebook


            // Helper function to recursively collect all page IDs from a notebook
            const collectPageIdsFromNotebook = (notebook: any): string[] => {
                if (!notebook) return [];
                const pages: string[] = [];

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

                    // Delete all pages from Firestore and clean up files
                    const batch = fs.batch();
                    pageIds.forEach(pageId => {
                        batch.delete(fs.collection('pages').doc(pageId));
                    });
                    await batch.commit().catch(console.error);

                    // Remove RTDB nodes
                    await rtdb.ref(`notebooks/${notebookId}`).remove();
                    await userNotebooksRef.child(notebookId).remove();



                } catch (err) {
                    console.error(`Error deleting notebook ${notebookId}:`, err);
                }
            }

            // 3. Delete secret pages
            try {
                const secretPagesRef = rtdb.ref(`users/${targetUid}/secret/pages`);
                const secretPagesSnap = await secretPagesRef.once('value');
                const secretPages = secretPagesSnap.val() || {};

                const batch = fs.batch();
                Object.keys(secretPages).forEach(secretId => {
                    batch.delete(fs.collection('secret').doc(secretId));
                });

                await batch.commit().catch(console.error);
                await rtdb.ref(`users/${targetUid}/secret`).remove();
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

                await deleteDocs(pagesCollection.where('createdBy', '==', targetUid));
                await deleteDocs(pagesCollection.where('owner', '==', targetUid));
            } catch (err) {
                console.error('Error cleaning up Firestore data:', err);
            }

            // 5. Delete shares
            try {
                const sharesQuery = fs.collection('shares').where('ownerUid', '==', targetUid);
                const sharesSnapshot = await sharesQuery.get();
                const batch = fs.batch();
                sharesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit().catch(console.error);
            } catch (err) {
                console.error('Error deleting shares:', err);
            }

            // 6. Delete user node from RTDB
            await rtdb.ref(`users/${targetUid}`).remove();


            // 7. Finally, delete the auth user
            try {
                await adminAuth.deleteUser(targetUid);

            } catch (err) {
                console.error('Error deleting auth user:', err);
                throw new Error('Failed to delete authentication user');
            }

            return NextResponse.json({
                success: true,
                message: 'User account deleted successfully',
                deletedUid: targetUid
            });

        } catch (err: any) {
            console.error('User deletion error:', err);
            return jsonError(500, err?.message || 'Failed to delete user account');
        }
    } catch (error) {
        console.error('Admin delete user error:', error);
        return jsonError(500, 'Internal server error');
    }
}

export const dynamic = 'force-dynamic';
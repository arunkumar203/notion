import { NextResponse } from 'next/server';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// List current user's shares
export async function GET(_req: Request) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value || '';
    if (!session) return jsonError(401, 'Not authenticated');
    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }
    const uid = decoded?.uid as string;
    const db = admin.firestore();
    const snap = await db.collection('shares').where('ownerUid', '==', uid).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    return NextResponse.json({ items });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

// Create a new share for a page
export async function POST(req: Request) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value || '';
    if (!session) return jsonError(401, 'Not authenticated');
    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }
    const uid = decoded?.uid as string;
    const body = await req.json().catch(() => ({}));
  const { pageId, canEdit = false } = body || {};
    if (!pageId || typeof pageId !== 'string') return jsonError(400, 'Missing pageId');
    const db = admin.firestore();
  const pageRef = db.collection('pages').doc(pageId);
  const pageSnap = await pageRef.get();
    if (!pageSnap.exists) return jsonError(404, 'Page not found');
    const page = pageSnap.data() as any;
    if (page.createdBy && page.createdBy !== uid) return jsonError(403, 'Forbidden');
    const now = Date.now();
    // Enforce one share per page per owner: check existing first
    const existingQs = await db.collection('shares').where('ownerUid', '==', uid).where('pageId', '==', pageId).limit(1).get();
    if (!existingQs.empty) {
      const docSnap = existingQs.docs[0];
      const existing = docSnap.data() as any;
      const id = docSnap.id;
      // Optionally update canEdit to latest requested value
      const updates: any = {};
      if (typeof canEdit === 'boolean' && canEdit !== !!existing.canEdit) updates.canEdit = !!canEdit;
      if (Object.keys(updates).length > 0) {
        await docSnap.ref.update(updates);
        try {
          // New mirror keyed by pageId with { link, canEdit, createdAt }
          await admin.database().ref(`users/${uid}/sharedLinks/${pageId}`).update({
            link: id,
            ...(updates.canEdit !== undefined ? { canEdit: updates.canEdit } : {}),
          });
          // Best-effort: remove legacy mirror keyed by shareId
          await admin.database().ref(`users/${uid}/sharedLinks/${id}`).remove();
        } catch {}
      }
      return NextResponse.json({ id, existed: true });
    }
    const shareRef = await db.collection('shares').add({
      ownerUid: uid,
      pageId,
      createdAt: now,
      canEdit: !!canEdit,
      active: true,
    });
    // Mirror minimal info in RTDB under user for quick list
    try {
      // New structure keyed by pageId
      await admin.database().ref(`users/${uid}/sharedLinks/${pageId}`).set({
        link: shareRef.id,
        canEdit: !!canEdit,
        createdAt: now,
      });
      // Best-effort: remove legacy mirror keyed by shareId if it exists
      try { await admin.database().ref(`users/${uid}/sharedLinks/${shareRef.id}`).remove(); } catch {}
      // Mark page metadata as shared in RTDB (best-effort)
      try {
        const pd: any = page;
        const notebookId: string | undefined = pd?.notebookId;
        const sectionId: string | undefined = pd?.sectionId;
        const topicId: string | undefined = pd?.topicId;
        if (notebookId && sectionId && topicId) {
          await admin.database().ref(`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`).update({ isShared: true });
        }
      } catch {}
    } catch {}
    return NextResponse.json({ id: shareRef.id });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

// Delete all shares for a given page (owner only)
export async function DELETE(req: Request) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');
  const cookieStore = await cookies();
  const session = cookieStore.get('session')?.value || '';
    if (!session) return jsonError(401, 'Not authenticated');
    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }
    const uid = decoded?.uid as string;
    const body = await req.json().catch(() => ({}));
    const { pageId } = body || {};
    if (!pageId || typeof pageId !== 'string') return jsonError(400, 'Missing pageId');
    const db = admin.firestore();
    const qs = await db.collection('shares').where('ownerUid', '==', uid).where('pageId', '==', pageId).get();
    const batch = db.batch();
    qs.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    // Remove mirrors in RTDB
    try {
      // New path keyed by pageId
      await admin.database().ref(`users/${uid}/sharedLinks/${pageId}`).remove();
      // Legacy cleanup (keyed by shareId) best-effort
      try {
        const legacyRef = admin.database().ref(`users/${uid}/sharedLinks`);
        const snap = await legacyRef.get();
        const val = (snap.val() || {}) as Record<string, { pageId?: string }>;
        const toRemove = Object.entries(val).filter(([, v]) => v?.pageId === pageId).map(([id]) => id);
        await Promise.all(toRemove.map((id) => legacyRef.child(id).remove()));
      } catch {}
    } catch {}
    // Optionally flip isShared=false on page metadata
    try {
      const pageSnap = await db.collection('pages').doc(pageId).get();
      const pd: any = pageSnap.data() || {};
      const notebookId: string | undefined = pd?.notebookId;
      const sectionId: string | undefined = pd?.sectionId;
      const topicId: string | undefined = pd?.topicId;
      if (notebookId && sectionId && topicId) {
        await admin.database().ref(`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`).update({ isShared: false });
      }
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

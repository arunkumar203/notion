import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

// Utility: JSON error helper
const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  if (!adminAuth) return jsonError(500, 'Server not ready');
  const db = admin.firestore();
    const { id: shareId } = await params;
    const shareSnap = await db.collection('shares').doc(shareId).get();
    if (!shareSnap.exists) return jsonError(404, 'Share not found');
    const share = shareSnap.data() as any;
    if (share.active === false) return jsonError(404, 'Share disabled');
    const pageId: string | undefined = share.pageId;
    if (!pageId) return jsonError(400, 'Invalid share');
    const pageSnap = await db.collection('pages').doc(pageId).get();
    if (!pageSnap.exists) return jsonError(404, 'Page not found');
    const page = pageSnap.data() as any;
    return NextResponse.json({
      shareId,
      ownerUid: share.ownerUid,
      canEdit: !!share.canEdit,
      createdAt: share.createdAt || 0,
      page: {
        id: pageId,
        name: page.name || 'Untitled',
        content: page.content || '',
        updatedAt: page.updatedAt || 0,
      },
    });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

// Update page content via public share (only when canEdit is true)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');
    const db = admin.firestore();
    const { id: shareId } = await params;
    const body = await req.json().catch(() => ({}));
    const shareRef = db.collection('shares').doc(shareId);
    const shareSnap = await shareRef.get();
    if (!shareSnap.exists) return jsonError(404, 'Share not found');
    const share = shareSnap.data() as any;
    if (share.active === false) return jsonError(403, 'Share disabled');

    // Owner-authenticated branch for toggling canEdit
    if (Object.prototype.hasOwnProperty.call(body, 'canEdit')) {
      // Require session cookie and ownership
      const cookieStore = await cookies();
      const session = cookieStore.get('session')?.value || '';
      if (!session) return jsonError(401, 'Not authenticated');
      let decoded: any;
      try {
        decoded = await adminAuth.verifySessionCookie(session, true);
      } catch {
        return jsonError(401, 'Invalid session');
      }
      if (decoded?.uid !== share.ownerUid) return jsonError(403, 'Forbidden');
      const nextCanEdit = !!body.canEdit;
      await shareRef.update({ canEdit: nextCanEdit });
      try {
        const pageId: string | undefined = share.pageId;
        if (pageId) {
          await admin.database().ref(`users/${share.ownerUid}/sharedLinks/${pageId}/canEdit`).set(nextCanEdit);
        }
        // Clean legacy path if present
        try { await admin.database().ref(`users/${share.ownerUid}/sharedLinks/${shareId}`).remove(); } catch {}
      } catch {}
      return NextResponse.json({ ok: true, canEdit: nextCanEdit });
    }

    // Public content update branch (allowed when canEdit is true)
    const content: string | undefined = body?.content;
    if (typeof content !== 'string') return jsonError(400, 'Missing content');
    if (!share.canEdit) return jsonError(403, 'Editing not allowed');
    const pageId: string | undefined = share.pageId;
    if (!pageId) return jsonError(400, 'Invalid share');
    const now = Date.now();
    const pageRef = db.collection('pages').doc(pageId);
    await pageRef.update({ content, updatedAt: now });
    // Update RTDB lastUpdated timestamp if we have path refs
    try {
      const pageSnap = await pageRef.get();
      const pd = pageSnap.data() as any;
      const notebookId: string | undefined = pd?.notebookId;
      const sectionId: string | undefined = pd?.sectionId;
      const topicId: string | undefined = pd?.topicId;
      if (notebookId && sectionId && topicId) {
        await admin.database().ref(`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`).update({ lastUpdated: now, updatedAt: now });
      }
    } catch {}
    return NextResponse.json({ ok: true, updatedAt: now });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

// Delete share: only owner can delete (checks session cookie)
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
  if (!adminAuth) return jsonError(500, 'Server not ready');
  const db = admin.firestore();
  const { id: shareId } = await params;
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
    const shareRef = db.collection('shares').doc(shareId);
    const shareSnap = await shareRef.get();
    if (!shareSnap.exists) return jsonError(404, 'Share not found');
    const share = shareSnap.data() as any;
    if (share.ownerUid !== uid) return jsonError(403, 'Forbidden');
    await shareRef.delete();
    // Also remove from RTDB mirrors
    try {
      const pageId: string | undefined = share.pageId;
      // New mirror keyed by pageId
      if (pageId) {
        await admin.database().ref(`users/${uid}/sharedLinks/${pageId}`).remove();
      }
      // Legacy mirror keyed by shareId
      await admin.database().ref(`users/${uid}/sharedLinks/${shareId}`).remove();
    } catch {}
    // Flip isShared=false on page metadata in RTDB (best-effort)
    try {
      const pageId: string | undefined = share.pageId;
      if (pageId) {
        const pageSnap = await db.collection('pages').doc(pageId).get();
        const pd: any = pageSnap.data() || {};
        const notebookId: string | undefined = pd?.notebookId;
        const sectionId: string | undefined = pd?.sectionId;
        const topicId: string | undefined = pd?.topicId;
        if (notebookId && sectionId && topicId) {
          await admin.database().ref(`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`).update({ isShared: false });
        }
      }
    } catch {}
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

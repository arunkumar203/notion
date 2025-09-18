import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  if (!adminAuth) return jsonError(500, 'Server not ready');
  let uid: string | null = null;
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value || '';
    if (!session) return jsonError(401, 'Not authenticated');
    const decoded = await adminAuth.verifySessionCookie(session, true);
    uid = decoded?.uid || null;
    if (!uid) return jsonError(401, 'Not authenticated');
  } catch {
    return jsonError(401, 'Invalid session');
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { pageId, notebookId, sectionId, topicId, content: overrideContent } = body as { pageId: string; notebookId?: string; sectionId?: string; topicId?: string; content?: string };
    if (!pageId) return jsonError(400, 'Missing pageId');

    const fs = admin.firestore();
    const rtdb = admin.database();
    // 1) Try reading source page content/name from Firestore; fall back to RTDB metadata if missing
    const srcRef = fs.collection('pages').doc(pageId);
    const srcSnap = await srcRef.get();
    let srcData: Record<string, any> | null = null;
    if (srcSnap.exists) {
      srcData = srcSnap.data() || {};
      if ((srcData as any).createdBy && (srcData as any).createdBy !== uid) return jsonError(403, 'Forbidden');
    }

    // Fallback to RTDB to get name/ownership when Firestore doc is missing
    let metaName: string | undefined;
    let metaCreatedAt: number | undefined;
    let metaUpdatedAt: number | undefined;
    if (!srcData && notebookId && sectionId && topicId) {
      const metaPath = `notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`;
      const metaSnap = await rtdb.ref(metaPath).get();
      if (metaSnap.exists()) {
        const meta = (metaSnap.val() || {}) as { name?: string; owner?: string; createdAt?: number; updatedAt?: number; lastUpdated?: number };
        // Verify ownership when possible
        if (meta.owner && meta.owner !== uid) return jsonError(403, 'Forbidden');
        metaName = meta.name || 'Untitled';
        metaCreatedAt = meta.createdAt || undefined;
        metaUpdatedAt = (meta as any).lastUpdated || meta.updatedAt || undefined;
      }
    }

    // 2) Clone into secret collection with a NEW ID; keep original Firestore page intact to avoid
    //    any external cleanup that might delete Appwrite files. Prefer override content from client.
    const now = Date.now();
    const newSecretRef = fs.collection('secret').doc();
    const secretId = newSecretRef.id;
    await newSecretRef.set({
      content: typeof overrideContent === 'string' ? overrideContent : (srcData?.content || ''),
      createdBy: uid,
      name: (srcData?.name as string) || metaName || 'Untitled',
      createdAt: (srcData?.createdAt as number) || metaCreatedAt || now,
      updatedAt: now,
      originalPageId: pageId,
      movedAt: now,
    });

    // 3) RTDB updates: add under users/{uid}/secret/pages and remove from notebooks tree
    const orderSnap = await rtdb.ref(`users/${uid}/secret/pages`).get();
    const orderData = (orderSnap.exists() ? orderSnap.val() : {}) as Record<string, { order?: number }>;
    const maxOrder = Object.values(orderData).reduce((acc, v) => Math.max(acc, (v?.order ?? -1)), -1);
    const nextOrder = maxOrder + 1;
    const updates: Record<string, any> = {};
    updates[`users/${uid}/secret/pages/${secretId}`] = {
      name: (srcData?.name as string) || metaName || 'Untitled',
      createdAt: now, // creation time in secret space
      updatedAt: now,
      lastUpdated: now,
      order: nextOrder,
    };
    if (notebookId && sectionId && topicId) {
      updates[`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`] = null;
    }
    await rtdb.ref().update(updates);

    // Revoke any shares for the original page (owner only)
    try {
      const qs = await fs.collection('shares').where('ownerUid', '==', uid).where('pageId', '==', pageId).get();
      const batch = fs.batch();
      qs.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      try { await rtdb.ref(`users/${uid}/sharedLinks/${pageId}`).remove(); } catch {}
    } catch {}

    // Finally, delete the original Firestore page document (do NOT touch Appwrite files here)
    try { await srcRef.delete(); } catch {}

    return NextResponse.json({ ok: true, id: secretId });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

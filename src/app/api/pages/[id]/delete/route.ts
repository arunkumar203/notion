import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';
import { getBucketId, getServerAppwrite } from '@/lib/appwrite-server';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

function extractFileIds(html: string): string[] {
  if (!html || typeof html !== 'string') return [];
  const ids = new Set<string>();
  // Match /api/files/(view|download|preview)/<id>
  const re = /\/api\/files\/(?:view|download|preview)\/([^"'\)\s<>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = m[1];
      const id = decodeURIComponent(raw);
      if (id) ids.add(id);
    } catch { }
  }
  return Array.from(ids);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const { id: pageId } = await params;
    if (!pageId) return jsonError(400, 'Missing id');

    const fs = admin.firestore();
    const rtdb = admin.database();
    const pageRef = fs.collection('pages').doc(pageId);
    const snap = await pageRef.get();
    if (!snap.exists) {
      // Idempotent: remove RTDB node if any, then return ok
      try { await rtdb.ref().update({ [`users/${uid}/sharedLinks/${pageId}`]: null }); } catch { }
      return NextResponse.json({ ok: true, missing: true });
    }
    const data = (snap.data() || {}) as any;
    if (data.createdBy && data.createdBy !== uid) return jsonError(403, 'Forbidden');

    // Collect Appwrite file IDs from content
    const content = (data.content as string) || '';
    const fileIds = extractFileIds(content);

    // Delete files from Appwrite Storage (best-effort)
    try {
      const { storage } = getServerAppwrite();
      const bucketId = getBucketId();
      await Promise.all(
        fileIds.map(async (fid) => {
          try { await storage.deleteFile(bucketId, fid); } catch { }
        })
      );
    } catch { }

    // Revoke shares belonging to this owner for this page
    try {
      const qs = await fs.collection('shares').where('ownerUid', '==', uid).where('pageId', '==', pageId).get();
      const batch = fs.batch();
      qs.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      try { await rtdb.ref(`users/${uid}/sharedLinks/${pageId}`).remove(); } catch { }
    } catch { }

    // Remove Firestore page doc
    await pageRef.delete().catch(() => undefined);

    // Remove RTDB page metadata mapping if present
    try {
      const notebookId: string | undefined = data?.notebookId;
      const sectionId: string | undefined = data?.sectionId;
      const topicId: string | undefined = data?.topicId;
      if (notebookId && sectionId && topicId) {
        await rtdb.ref(`notebooks/${notebookId}/sections/${sectionId}/topics/${topicId}/pages/${pageId}`).remove();
      }
    } catch { }

    // Remove from user's pageIndex
    try {
      await rtdb.ref(`users/${uid}/pageIndex/${pageId}`).remove();
    } catch (error) {
      console.error(`Failed to remove pageIndex for ${pageId}:`, error);
    }

    // Remove from Neo4j RAG (if exists)
    try {
      const neo4j = require('neo4j-driver');
      const driver = neo4j.driver(
        process.env.NEO4J_URI || '',
        neo4j.auth.basic(
          process.env.NEO4J_USERNAME || '',
          process.env.NEO4J_PASSWORD || ''
        )
      );

      const session = driver.session();
      try {
        // Delete page and all its chunks from Neo4j
        await session.run(
          `MATCH (p:Page {pageId: $pageId, userId: $userId})
           OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)
           DETACH DELETE p, c`,
          { pageId, userId: uid }
        );
        console.log(`Deleted page ${pageId} from Neo4j`);
      } finally {
        await session.close();
        await driver.close();
      }
    } catch (error) {
      // Neo4j cleanup is optional - don't fail if Neo4j is not configured
      console.warn(`Neo4j cleanup failed for ${pageId}:`, error);
    }

    return NextResponse.json({ ok: true, deletedFiles: fileIds.length });
  } catch (_e) {
    return jsonError(500, 'Unexpected server error');
  }
}

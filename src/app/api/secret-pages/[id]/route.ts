import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

async function getUidFromSession(): Promise<string | null> {
  if (!adminAuth) return null;
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value || '';
    if (!session) return null;
    const decoded = await adminAuth.verifySessionCookie(session, true);
    return decoded?.uid || null;
  } catch {
    return null;
  }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromSession();
  if (!uid) return jsonError(401, 'Not authenticated');
  try {
    const { id } = await params;
    const docRef = admin.firestore().collection('secret').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return jsonError(404, 'Not found');
    const data = snap.data() || {};
    if ((data as any).createdBy !== uid) return jsonError(403, 'Forbidden');
    return NextResponse.json({ id, ...data });
  } catch {
    return jsonError(500, 'Unexpected server error');
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromSession();
  if (!uid) return jsonError(401, 'Not authenticated');
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { content, name } = body as { content?: string; name?: string };
    const now = Date.now();
    const docRef = admin.firestore().collection('secret').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      // Create new
      await docRef.set({ content: content ?? '', name: name ?? 'Untitled', createdBy: uid, createdAt: now, updatedAt: now });
    } else {
      const data = snap.data() || {};
      if ((data as any).createdBy !== uid) return jsonError(403, 'Forbidden');
      const updates: Record<string, any> = { updatedAt: now };
      if (typeof content === 'string') updates.content = content;
      if (typeof name === 'string') updates.name = name;
      await docRef.set(updates, { merge: true });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError(500, 'Unexpected server error');
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await getUidFromSession();
  if (!uid) return jsonError(401, 'Not authenticated');
  try {
    const { id } = await params;
    const docRef = admin.firestore().collection('secret').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) return NextResponse.json({ ok: true });
    const data = snap.data() || {};
    if ((data as any).createdBy !== uid) return jsonError(403, 'Forbidden');
    await docRef.delete();
    return NextResponse.json({ ok: true });
  } catch {
    return jsonError(500, 'Unexpected server error');
  }
}

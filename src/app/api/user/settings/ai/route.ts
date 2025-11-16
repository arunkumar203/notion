import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

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
  const apiKey = (body?.apiKey ?? '').toString();
  const model = (body?.model ?? 'gemini-2.5-flash').toString();
  const speed = (body?.speed ?? 'normal').toString();

  // Sanitize options but do not validate against Google here. The editor flow validates at usage time.
  const modelOpt = model === 'gemini-2.5-pro' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
  const speedOpt = speed === 'slow' ? 'slow' : 'normal';

  // Persist settings as provided (allow empty apiKey to support clearing)
  await admin.database().ref(`users/${uid}/settings/ai`).set({ apiKey, model: modelOpt, speed: speedOpt });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(500, 'Unexpected server error');
  }
}

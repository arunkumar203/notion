import { NextResponse } from 'next/server';
import { getBucketId, getServerAppwrite } from '@/lib/appwrite-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const bucketId = getBucketId();
    const { storage } = getServerAppwrite();
    const res: any = await storage.listFiles(bucketId);
    return NextResponse.json({ ok: true, bucketId, files: res.files || [] });
  } catch (e: any) {
    console.error('[files/list] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to list' }, { status: 500 });
  }
}

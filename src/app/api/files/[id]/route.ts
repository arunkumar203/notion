import { NextResponse } from 'next/server';
import { getBucketId, getServerAppwrite } from '@/lib/appwrite-server';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bucketId = getBucketId();
    const { storage } = getServerAppwrite();
    await storage.deleteFile(bucketId, id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[files/delete] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 });
  }
}

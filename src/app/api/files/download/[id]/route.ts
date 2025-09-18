import { NextResponse } from 'next/server';
import { getBucketId } from '@/lib/appwrite-server';
import { appwriteFetch } from '@/lib/appwrite-rest';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const bucketId = getBucketId();
    const url = new URL(req.url);
    const q = url.search ? url.search : '';
    const res = await appwriteFetch(`/storage/buckets/${bucketId}/files/${encodeURIComponent(id)}/download${q}`);
    const headers = new Headers();
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    headers.set('content-type', ct);
    // Force attachment; prefer provided filename from client query if any
    const name = url.searchParams.get('name');
    const disp = name ? `attachment; filename*=UTF-8''${encodeURIComponent(name)}` : 'attachment';
    headers.set('content-disposition', disp);
    return new NextResponse(res.body, { status: 200, headers });
  } catch (e: any) {
    console.error('[files/download] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to download' }, { status: 500 });
  }
}

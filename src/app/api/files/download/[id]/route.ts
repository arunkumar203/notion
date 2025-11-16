import { NextResponse } from 'next/server';
import { getBucketId } from '@/lib/appwrite-server';
import { appwriteFetch } from '@/lib/appwrite-rest';
import { verifyAuthentication } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Verify authentication first
  const authResult = await verifyAuthentication();
  if (authResult instanceof NextResponse) {
    return authResult; // Return authentication error
  }

  const { uid } = authResult;
  const { id } = await params;
  
  try {
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

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
    
    // Log the download for security auditing
    // console.log(`File downloaded by user ${uid}: ${id}`);
    
    return new NextResponse(res.body, { status: 200, headers });
  } catch (e: any) {
    console.error('[files/download] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to download' }, { status: 500 });
  }
}

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
    const res = await appwriteFetch(`/storage/buckets/${bucketId}/files/${encodeURIComponent(id)}/view${q}`);
    // Stream through to client, preserving content type
    const headers = new Headers();
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    headers.set('content-type', ct);
    // Allow inline display
    const disp = res.headers.get('content-disposition');
    if (disp) headers.set('content-disposition', disp.replace('attachment', 'inline'));

    // Log the view for security auditing
    // console.log(`File viewed by user ${uid}: ${id}`);

    return new NextResponse(res.body, { status: 200, headers });
  } catch (e: any) {
    console.error('[files/view] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to view' }, { status: 500 });
  }
}

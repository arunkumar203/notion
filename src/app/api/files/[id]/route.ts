import { NextResponse } from 'next/server';
import { getBucketId, getServerAppwrite } from '@/lib/appwrite-server';
import { verifyAuthentication } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Verify authentication first
  const authResult = await verifyAuthentication();
  if (authResult instanceof NextResponse) {
    return authResult; // Return authentication error
  }

  const { uid } = authResult;

  try {
    const { id } = await params;
    
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

    const bucketId = getBucketId();
    const { storage } = getServerAppwrite();
    
    // TODO: Add ownership verification here if you track file ownership
    // For now, any authenticated user can delete any file
    // In production, you should verify the user owns the file
    
    await storage.deleteFile(bucketId, id);
    
    // Log the deletion for security auditing
    // console.log(`File deleted by user ${uid}: ${id}`);
    
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[files/delete] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 });
  }
}

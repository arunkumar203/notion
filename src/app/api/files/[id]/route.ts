import { NextResponse } from 'next/server';
import { getBucketId, getServerAppwrite } from '@/lib/appwrite-server';
import { verifyAuthentication } from '@/lib/auth-helpers';
import { getFileRecord, deleteFileRecord } from '@/lib/storage';
import admin from '@/lib/firebase-admin';
import { hasPermission, type WorkspaceRole } from '@/lib/workspace-permissions';

export const dynamic = 'force-dynamic';

const rtdb = admin.database();

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

    // Get file record to check ownership
    const fileRecord = await getFileRecord(id);

    if (!fileRecord) {
      // File not tracked in RTDB - might be legacy file, allow deletion
      // In production, you might want to be stricter
      const bucketId = getBucketId();
      const { storage } = getServerAppwrite();
      await storage.deleteFile(bucketId, id);
      return NextResponse.json({ ok: true, warning: 'File not tracked in storage system' });
    }

    const { uploadedBy, workspaceId } = fileRecord;

    // Check if user is the owner of the file
    const isFileOwner = uploadedBy === uid;
    // console.log('[files/delete] File owner check:', { uploadedBy, uid, isFileOwner, workspaceId });

    // For shared workspace files, check workspace permissions
    let canDeleteAnyFile = false;
    let canDeleteOwnFile = false;

    if (workspaceId && workspaceId !== 'personal') {
      // console.log('[files/delete] Checking workspace permissions for:', workspaceId);
      // Get workspace data to check user's role
      const wsSnap = await rtdb.ref(`workspaces/${workspaceId}`).once('value');

      if (wsSnap.exists()) {
        const workspace = wsSnap.val();
        const isWorkspaceOwner = workspace.owner === uid;
        const memberData = workspace.members?.[uid];
        const userRole: WorkspaceRole | null = isWorkspaceOwner
          ? 'owner'
          : (memberData?.role || null);

        // console.log('[files/delete] User role:', { userRole, memberData });

        if (userRole) {
          // Check permissions
          canDeleteAnyFile = hasPermission(userRole, 'delete_any_file', memberData?.permissions);
          canDeleteOwnFile = hasPermission(userRole, 'delete_own_file', memberData?.permissions);
          // console.log('[files/delete] Permissions:', { canDeleteAnyFile, canDeleteOwnFile });
        }
      }
    }

    // Authorization check:
    // - Admins/Owners can delete ANY file (DELETE_ANY_FILE)
    // - Editors can delete THEIR OWN files (DELETE_OWN_FILE + isFileOwner)
    // - For personal workspace, only file owner can delete
    const canDelete =
      canDeleteAnyFile ||
      (isFileOwner && (workspaceId === 'personal' || canDeleteOwnFile));

    // console.log('[files/delete] Final check:', { canDelete, canDeleteAnyFile, isFileOwner, workspaceId, canDeleteOwnFile });

    if (!canDelete) {
      return NextResponse.json(
        { error: 'You do not have permission to delete this file. Only the file owner or workspace admin can delete it.' },
        { status: 403 }
      );
    }

    // Delete from Appwrite storage
    const bucketId = getBucketId();
    const { storage } = getServerAppwrite();
    await storage.deleteFile(bucketId, id);

    // Delete record and update uploader's storage (always the original uploader)
    const result = await deleteFileRecord(id);

    return NextResponse.json({
      ok: true,
      freedBytes: result?.size || 0,
      freedFrom: result?.uploaderId || uploadedBy
    });
  } catch (e: any) {
    console.error('[files/delete] error', e);
    return NextResponse.json({ error: e?.message || 'Failed to delete' }, { status: 500 });
  }
}


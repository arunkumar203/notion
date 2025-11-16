import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  try {
    if (!adminAuth) {
      return jsonError(500, 'Authentication service not available');
    }

    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;

    if (!session) {
      return jsonError(401, 'Not authenticated');
    }

    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const adminUid = decoded?.uid as string;

    if (!adminUid) {
      return jsonError(401, 'Admin not authenticated');
    }

    // Verify admin has root_admin role
    const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
    const adminRole = adminRoleSnapshot.val();



    if (adminRole !== 'root_admin') {
      return jsonError(403, 'Only root admins can disable/enable user accounts');
    }

    // Get the user ID and action from request body
    const body = await request.json().catch(() => ({}));
    const { uid: targetUid, disabled } = body || {};

    if (!targetUid) {
      return jsonError(400, 'User ID is required');
    }

    if (typeof disabled !== 'boolean') {
      return jsonError(400, 'Disabled status must be a boolean');
    }

    // Prevent self-action
    if (targetUid === adminUid) {
      return jsonError(400, 'Cannot disable/enable your own account');
    }

    // Prevent disabling other root_admins
    const targetRoleSnapshot = await admin.database().ref(`users/${targetUid}/role`).once('value');
    const targetRole = targetRoleSnapshot.val();

    if (targetRole === 'root_admin') {
      return jsonError(403, 'Cannot disable other root admin accounts');
    }

    try {


      // Update user disabled status in Firebase Auth
      await adminAuth.updateUser(targetUid, {
        disabled: disabled
      });



      // Also update in RTDB for tracking (optional)
      await admin.database().ref(`users/${targetUid}/disabled`).set(disabled);

      const action = disabled ? 'disabled' : 'enabled';


      return NextResponse.json({
        success: true,
        message: `User ${action} successfully`,
        uid: targetUid,
        disabled: disabled
      });

    } catch (err: any) {
      console.error('Error updating user status:', err);
      return jsonError(500, err?.message || 'Failed to update user status');
    }
  } catch (error) {
    console.error('Admin toggle user status error:', error);
    return jsonError(500, 'Internal server error');
  }
}

export const dynamic = 'force-dynamic';
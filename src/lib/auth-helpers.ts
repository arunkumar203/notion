import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';
import { NextResponse } from 'next/server';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function verifyAuthentication(): Promise<{ uid: string } | NextResponse> {
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

    const uid = decoded?.uid as string;
    
    if (!uid) {
      return jsonError(401, 'User not authenticated');
    }

    return { uid };
  } catch (error) {
    console.error('Authentication verification error:', error);
    return jsonError(500, 'Authentication error');
  }
}

export async function verifyAdminRole(requiredRole: 'admin' | 'root_admin' = 'admin'): Promise<{ uid: string; role: string } | NextResponse> {
  const authResult = await verifyAuthentication();
  
  if (authResult instanceof NextResponse) {
    return authResult; // Return error response
  }

  const { uid } = authResult;

  try {
    // Get user role from database
    const roleSnapshot = await admin.database().ref(`users/${uid}/role`).once('value');
    const userRole = roleSnapshot.val() || 'user';

    // Check if user has required permissions
    const hasPermission = requiredRole === 'admin' 
      ? (userRole === 'admin' || userRole === 'root_admin')
      : (userRole === 'root_admin');

    if (!hasPermission) {
      return jsonError(403, `Insufficient permissions. Required: ${requiredRole}`);
    }

    return { uid, role: userRole };
  } catch (error) {
    console.error('Role verification error:', error);
    return jsonError(500, 'Role verification error');
  }
}
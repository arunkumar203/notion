import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  try {
    if (!adminAuth) {
      return jsonError(500, 'Authentication service not available');
    }

    // Verify admin session first
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    
    if (!session) {
      return jsonError(401, 'Not authenticated');
    }

    let adminDecoded: any;
    try {
      adminDecoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const adminUid = adminDecoded?.uid as string;
    
    if (!adminUid) {
      return jsonError(401, 'Admin not authenticated');
    }

    // Verify admin has root_admin role
    const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
    const adminRole = adminRoleSnapshot.val();

    if (adminRole !== 'root_admin') {
      return jsonError(403, 'Only root admins can manually verify emails');
    }

    // Get the target user ID and ID token from the request body
    let targetUid: string;
    let idToken: string;
    try {
      const body = await request.json();
      targetUid = body.targetUid;
      idToken = body.idToken;
      
      if (!targetUid && !idToken) {
        return jsonError(400, 'Either targetUid or idToken must be provided');
      }
    } catch (parseError) {
      return jsonError(400, 'Invalid request body');
    }

    // If idToken is provided, verify it to get the uid
    let uid: string;
    if (idToken) {
      try {
        const decodedToken = await adminAuth.verifyIdToken(idToken, false); // Don't require email verification
        uid = decodedToken.uid;
      } catch (error) {
        return jsonError(401, 'Invalid ID token');
      }
    } else if (targetUid) {
      uid = targetUid;
    } else {
      return jsonError(400, 'No valid user identifier provided');
    }

    if (!uid) {
      return jsonError(401, 'User not authenticated');
    }

    try {
      // Get the user record
      const userRecord = await adminAuth.getUser(uid);
      
      if (userRecord.emailVerified) {
        const response = NextResponse.json({ 
          success: true, 
          message: 'Email already verified',
          alreadyVerified: true 
        });

        // Add security headers
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set('X-XSS-Protection', '1; mode=block');
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.headers.set('Cache-Control', 'no-store');

        return response;
      }

      // Manually set email as verified
      await adminAuth.updateUser(uid, {
        emailVerified: true,
      });

      // Return success response with security headers
      const response = NextResponse.json({ 
        success: true, 
        message: 'Email verification manually completed by admin',
        uid: uid,
        verifiedBy: adminUid
      });

      // Add security headers
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Cache-Control', 'no-store');

      return response;

    } catch (error) {
      console.error('Error manually verifying user:', error);
      return jsonError(500, 'Failed to verify user');
    }

  } catch (error) {
    console.error('Manual verification error:', error);
    return jsonError(500, 'Internal server error');
  }
}

export const dynamic = 'force-dynamic';
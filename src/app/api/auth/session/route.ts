import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
  try {
    if (!adminAuth) return jsonError(500, 'Server not ready');

    const body = await req.json().catch(() => ({}));
    const { idToken } = body;

    if (!idToken || typeof idToken !== 'string') {
      return jsonError(400, 'Missing idToken');
    }

    // Verify the ID token and create a session cookie
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Check for Two-Step Verification
    const twoFactorSnapshot = await admin.database().ref(`users/${uid}/settings/2sv`).once('value');
    const twoFactorSettings = twoFactorSnapshot.val();

    let requires2FA = twoFactorSettings?.enabled;

    // If 2FA is enabled, check if we are performing a trusted refresh
    // (i.e., the user already has a valid session cookie for this UID)
    if (requires2FA) {
      try {
        const cookieStore = await cookies();
        const currentSession = cookieStore.get('session')?.value;

        if (currentSession) {
          const decodedSession = await adminAuth.verifySessionCookie(currentSession, false);
          if (decodedSession.uid === uid) {
            // Valid existing session for same user - treat as trusted refresh
            requires2FA = false;
          }
        }
      } catch (e) {
        // Session invalid or verification failed - enforce 2FA
      }
    }

    if (requires2FA) {
      const { totpCode } = body;

      if (!totpCode) {
        return jsonError(403, '2FA_REQUIRED');
      }

      // Verify the code
      const { authenticator } = require('otplib');
      authenticator.options = { window: 1 };

      const isValid = authenticator.check(totpCode, twoFactorSettings.secret);

      if (!isValid) {
        return jsonError(403, 'INVALID_2FA_CODE');
      }
    }

    // Create session cookie (expires in 7 days)
    const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    // Set the session cookie
    const cookieStore = await cookies();
    cookieStore.set('session', sessionCookie, {
      maxAge: expiresIn / 1000, // maxAge is in seconds
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    return NextResponse.json({
      success: true,
      uid: decodedToken.uid
    });

  } catch (error) {
    console.error('Session creation error:', error);
    return jsonError(401, 'Invalid token');
  }
}

export async function DELETE() {
  try {
    // Clear the session cookie
    const cookieStore = await cookies();
    cookieStore.delete('session');

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Session deletion error:', error);
    return jsonError(500, 'Failed to clear session');
  }
}
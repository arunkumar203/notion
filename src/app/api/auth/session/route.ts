import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';

// Helper to safely extract an error code if present
const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as Record<string, unknown>).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
};

// Helper function to handle errors consistently
const handleError = (message: string, status: number = 500, error?: unknown) => {
  console.error(`[Session API] ${message}`, error || '');
  return NextResponse.json(
    {
      error: message,
      ...(getErrorCode(error) ? { code: getErrorCode(error) } : {}),
    },
    { status }
  );
};

export async function POST(request: Request) {
  try {
    // Check if we have a valid auth instance
    if (!auth) {
      return handleError('Authentication service is not available. Check server env vars for Firebase Admin.', 500);
    }

    // console.log('[Session API] Session creation request received');
    
    // Verify the request has a body
    if (!request.body) {
      return handleError('No request body', 400);
    }
    
    let idToken: string;
    
    try {
      const body = await request.json();
      idToken = body.idToken;
      
      if (!idToken) {
        return handleError('No ID token provided', 400);
      }
    } catch (parseError) {
      return handleError('Invalid request body', 400, parseError);
    }
    
  // console.log('[Session API] ID token received, verifying...');
    
    try {
      // Verify the ID token first
  const decodedToken = await auth.verifyIdToken(idToken, true); // Force token check
  // console.log('[Session API] ID token verified for user:', decodedToken.uid);
      
      // Set session expiration to 5 days
      const expiresIn = 60 * 60 * 24 * 5; // 5 days in seconds
      
      // Create the session cookie
      const sessionCookie = await auth.createSessionCookie(idToken, {
        expiresIn
      });

      // Calculate expiration date
      const expires = new Date();
      expires.setSeconds(expires.getSeconds() + expiresIn);
      
  // console.log('[Session API] Session cookie created, setting cookie...');
      
  const isProduction = process.env.NODE_ENV === 'production';
      
      // Create response with the session cookie
      const response = new NextResponse(
        JSON.stringify({ status: 'success' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );

      // Set the session cookie with proper attributes
  // console.log('[Session API] Setting session cookie...');
      // Do not set an explicit domain so the cookie is scoped to the current host
      response.cookies.set({
        name: 'session',
        value: sessionCookie,
        maxAge: expiresIn,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        expires: expires
      });
      
      // Add cache control headers
      response.headers.set('Cache-Control', 'no-store');

  // console.log('[Session API] Session created successfully');
      return response;
      
    } catch (error: unknown) {
      console.error('[Session API] Error creating session:', error);

      const code = getErrorCode(error);
      if (code === 'auth/id-token-revoked' || code === 'auth/id-token-expired') {
        return handleError('Session expired. Please sign in again.', 401, error);
      }

      return handleError('Failed to create session', 500, error);
    }
  } catch (error) {
    console.error('[Session API] Unexpected error:', error);
    return handleError('Internal server error', 500, error);
  }
}

export const dynamic = 'force-dynamic';

// Support clearing the session on sign out
export async function DELETE() {
  try {
    const response = new NextResponse(null, { status: 204 });
    response.cookies.set({
      name: 'session',
      value: '',
      maxAge: -1,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return response;
  } catch (error: unknown) {
    console.error('[Session API] Error clearing session:', error);
    return handleError('Failed to clear session', 500, error);
  }
}

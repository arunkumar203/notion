import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

/**
 * Validates if the current session cookie is still valid
 * Returns 200 if valid, 401 if invalid/expired
 */
export async function GET() {
    try {
        if (!adminAuth) {
            return NextResponse.json({ valid: false, error: 'Server not ready' }, { status: 500 });
        }

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value;

        if (!session) {
            return NextResponse.json({ valid: false, error: 'No session cookie' }, { status: 401 });
        }

        try {
            // Verify the session cookie is still valid
            // Set checkRevoked to false to avoid aggressive revocation checks that might false-positive
            // on clock skew or token rotation issues.
            const decodedClaims = await adminAuth.verifySessionCookie(session, false);

            return NextResponse.json({
                valid: true,
                uid: decodedClaims.uid
            });
        } catch (error) {
            // Session is invalid or expired
            console.log('Session validation failed:', error);

            // Return response that tells client to clear the cookie
            const response = NextResponse.json(
                { valid: false, error: 'Session expired or invalid' },
                { status: 401 }
            );

            // Clear the invalid session cookie
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
        }
    } catch (error) {
        console.error('Session validation error:', error);
        return NextResponse.json(
            { valid: false, error: 'Internal server error' },
            { status: 500 }
        );
    }
}

import { NextResponse } from 'next/server';
import { adminAuth, rtdb } from '@/lib/firebase-admin';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export async function POST(request: Request) {
    try {
        // Get the session cookie to identify the user (User is logged in but enabling 2FA)
        // Actually, usually we rely on the session cookie from the request headers automatically handled by Next.js/Browser?
        // But we need to verify it.

        // We can also accept an idToken if the user is just setting up and we prefer that. 
        // Assuming cookieauth for authenticated routes.
        const sessionCookie = request.headers.get('cookie')?.split('; ').find(row => row.startsWith('session='))?.split('=')[1];

        let uid;
        if (sessionCookie) {
            const decoded = await adminAuth.verifySessionCookie(sessionCookie, true).catch(() => null);
            if (decoded) uid = decoded.uid;
        }

        // Fallback/Alternative: Check Authorization header? (Standard in this app seems to be cookie for sessions)
        // If no session, reject.
        if (!uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Generate Secret
        const secret = authenticator.generateSecret();
        const user = await adminAuth.getUser(uid); // Get email for OTPAuth URL
        const otpauth = authenticator.keyuri(user.email || 'user', 'MemoWave', secret);

        const qrCodeUrl = await QRCode.toDataURL(otpauth);

        // Store secret temporarily? Or send it back?
        // We usually store it in DB but marked as "pending" or just send it back and verify later.
        // It's stateless to just send it back, but safer to verify against a stored pending one.
        // However, simplest is to return secret, client sends it back with token to verify.
        // See `verify` route.

        return NextResponse.json({ secret, qrCodeUrl });

    } catch (error) {
        console.error('2FA setup error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

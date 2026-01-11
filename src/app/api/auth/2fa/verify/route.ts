import { NextResponse } from 'next/server';
import { adminAuth, rtdb } from '@/lib/firebase-admin';
import { authenticator } from 'otplib';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const sessionCookie = request.headers.get('cookie')?.split('; ').find(row => row.startsWith('session='))?.split('=')[1];
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true).catch(() => null);
        if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const uid = decoded.uid;

        const { secret, token } = await request.json();

        if (!secret || !token) {
            return NextResponse.json({ error: 'Missing secret or token' }, { status: 400 });
        }

        const isValid = authenticator.check(token, secret);

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
        }

        // Generate Initial Backup Codes
        const backupCodes = Array.from({ length: 10 }, () => ({
            code: crypto.randomBytes(4).toString('hex').toUpperCase(), // 8 chars
            used: false
        }));

        // Save to RTDB
        await rtdb.ref(`users/${uid}/settings/2sv`).set({
            enabled: true,
            secret: secret,
            backupCodes: backupCodes,
            verifiedAt: Date.now()
        });

        return NextResponse.json({ success: true, backupCodes });

    } catch (error) {
        console.error('2FA verify error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

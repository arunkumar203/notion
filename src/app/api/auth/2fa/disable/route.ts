import { NextResponse } from 'next/server';
import { adminAuth, rtdb } from '@/lib/firebase-admin';
import { authenticator } from 'otplib';

export async function POST(request: Request) {
    try {
        const { code } = await request.json();
        const sessionCookie = request.headers.get('cookie')?.split('; ').find(row => row.startsWith('session='))?.split('=')[1];
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true).catch(() => null);
        if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const uid = decoded.uid;

        // Fetch 2FA settings for verification
        const settingsRef = rtdb.ref(`users/${uid}/settings/2sv`);
        const snapshot = await settingsRef.get();
        const settings = snapshot.val();

        if (!settings || !settings.enabled || !settings.secret) {
            // Already disabled, just return success
            return NextResponse.json({ success: true });
        }

        if (!code) {
            return NextResponse.json({ error: 'Verification code required' }, { status: 400 });
        }

        let isValid = false;

        // 1. Check TOTP
        try {
            isValid = authenticator.check(code, settings.secret);
        } catch (err) {
            console.error('TOTP check error', err);
        }

        // 2. If TOTP invalid, check Backup Codes
        if (!isValid && settings.backupCodes) {
            const codes = settings.backupCodes || [];
            // We don't mark as used here because we are disabling the whole system anyway
            const codeIndex = codes.findIndex((c: any) => c.code === code && !c.used);
            if (codeIndex !== -1) {
                isValid = true;
            }
        }

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
        }

        // Disable in RTDB
        await settingsRef.remove();

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('2FA disable error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

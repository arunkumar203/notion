import { NextResponse } from 'next/server';
import { adminAuth, rtdb } from '@/lib/firebase-admin';
import { authenticator } from 'otplib';

export async function POST(request: Request) {
    try {
        const { idToken, code } = await request.json();

        if (!idToken || !code) {
            return NextResponse.json({ error: 'Missing token or code' }, { status: 400 });
        }

        // 1. Verify the user's identity
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 2. Fetch 2FA settings (secret and backup codes)
        const settingsRef = rtdb.ref(`users/${uid}/settings/2sv`);
        const snapshot = await settingsRef.get();
        const settings = snapshot.val();

        if (!settings || !settings.enabled || !settings.secret) {
            return NextResponse.json({ error: '2FA not enabled' }, { status: 400 });
        }

        let isValid = false;
        let usedBackupCodeIndex = -1;

        // 3. Check TOTP
        try {
            isValid = authenticator.check(code, settings.secret);
        } catch (err) {
            console.error('TOTP check error', err);
        }

        // 4. If TOTP invalid, check Backup Codes
        if (!isValid && settings.backupCodes) {
            const codes = settings.backupCodes || [];
            const codeIndex = codes.findIndex((c: any) => c.code === code && !c.used);

            if (codeIndex !== -1) {
                isValid = true;
                usedBackupCodeIndex = codeIndex;
            }
        }

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
        }

        // 5. If backup code was used, mark it as used
        if (usedBackupCodeIndex !== -1) {
            await settingsRef.child(`backupCodes/${usedBackupCodeIndex}`).update({ used: true });
        }

        // 6. Create Session Cookie (Login successful)
        const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
        const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

        const response = NextResponse.json({ success: true });
        response.cookies.set('session', sessionCookie, {
            maxAge: expiresIn / 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            sameSite: 'lax',
        });

        return response;

    } catch (error: any) {
        console.error('2FA login verify error:', error);
        return NextResponse.json({ error: error.message || 'Verification failed' }, { status: 500 });
    }
}

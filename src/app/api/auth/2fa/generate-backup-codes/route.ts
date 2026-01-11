import { NextResponse } from 'next/server';
import { adminAuth, rtdb } from '@/lib/firebase-admin';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const sessionCookie = request.headers.get('cookie')?.split('; ').find(row => row.startsWith('session='))?.split('=')[1];
        if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true).catch(() => null);
        if (!decoded) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const uid = decoded.uid;

        // Generate New Backup Codes
        const backupCodes = Array.from({ length: 10 }, () => ({
            code: crypto.randomBytes(4).toString('hex').toUpperCase(),
            used: false
        }));

        // Update RTDB
        await rtdb.ref(`users/${uid}/settings/2sv/backupCodes`).set(backupCodes);

        return NextResponse.json({ success: true, backupCodes });

    } catch (error) {
        console.error('Backup codes gen error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

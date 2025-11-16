import { NextResponse } from 'next/server';
import admin from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// Public endpoint to check if signup is allowed (no auth required)
export async function GET() {
    try {
        // Get admin settings from RTDB
        const settingsRef = admin.database().ref('adminSettings/allowNewUserSignup');
        const settingsSnapshot = await settingsRef.once('value');
        const allowNewUserSignup = settingsSnapshot.exists() ? settingsSnapshot.val() : true;

        return NextResponse.json({ allowNewUserSignup });
    } catch (error) {
        console.error('Error fetching signup settings:', error);
        // Default to allowing signup if there's an error
        return NextResponse.json({ allowNewUserSignup: true });
    }
}

export const dynamic = 'force-dynamic';

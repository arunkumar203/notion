import { NextRequest, NextResponse } from 'next/server';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
    try {
        if (!adminAuth) {
            return jsonError(500, 'Authentication service not available');
        }

        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session')?.value;

        if (!sessionCookie) {
            return jsonError(401, 'No session found');
        }

        // Verify the session cookie
        let decodedClaims: any;
        try {
            decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const currentUserUid = decodedClaims.uid;

        if (!currentUserUid) {
            return jsonError(401, 'Admin not authenticated');
        }

        // Get current user's role from Realtime Database
        const currentUserRef = admin.database().ref(`users/${currentUserUid}`);
        const currentUserSnapshot = await currentUserRef.once('value');
        const currentUserData = currentUserSnapshot.val();

        if (!currentUserData || (currentUserData.role !== 'admin' && currentUserData.role !== 'root_admin')) {
            return jsonError(403, 'Insufficient permissions');
        }

        const { uid, emailVerified } = await request.json();

        if (!uid || typeof emailVerified !== 'boolean') {
            return jsonError(400, 'Invalid request data');
        }

        // Prevent modifying root_admin users (unless current user is also root_admin)
        const targetUserRef = admin.database().ref(`users/${uid}`);
        const targetUserSnapshot = await targetUserRef.once('value');
        const targetUserData = targetUserSnapshot.val();

        if (targetUserData?.role === 'root_admin' && currentUserData.role !== 'root_admin') {
            return jsonError(403, 'Cannot modify root admin users');
        }

        // Prevent users from modifying themselves
        if (uid === currentUserUid) {
            return jsonError(403, 'Cannot modify your own email verification status');
        }

        // Update the emailVerified status in Firebase Auth (not RTDB)
        await adminAuth.updateUser(uid, {
            emailVerified: emailVerified
        });

        return NextResponse.json({
            success: true,
            message: `Email verification status updated to ${emailVerified ? 'verified' : 'not verified'}`
        });

    } catch (error: any) {
        console.error('Error updating email verified status:', error);
        return jsonError(500, error.message || 'Failed to update email verified status');
    }
}

export const dynamic = 'force-dynamic';
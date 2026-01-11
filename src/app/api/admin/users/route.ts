import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function GET() {
    try {
        if (!adminAuth) {
            return jsonError(500, 'Authentication service not available');
        }

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value;

        if (!session) {
            return jsonError(401, 'Not authenticated');
        }

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const adminUid = decoded?.uid as string;

        if (!adminUid) {
            return jsonError(401, 'Admin not authenticated');
        }

        // Verify admin has admin or root_admin role
        const adminRoleSnapshot = await admin.database().ref(`users/${adminUid}/role`).once('value');
        const adminRole = adminRoleSnapshot.val();

        if (adminRole !== 'root_admin' && adminRole !== 'admin') {
            return jsonError(403, 'Only admins can access user data');
        }

        try {
            // Get all users from RTDB
            const usersRef = admin.database().ref('users');
            const usersSnapshot = await usersRef.once('value');
            const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

            const usersList = [];

            for (const [uid, userData] of Object.entries(usersData)) {
                const userInfo = userData as any;

                // Count workspaces for this user
                const workspaceCount = userInfo.workspaces ? Object.keys(userInfo.workspaces).length : 0;

                // Count total notebooks across all workspaces
                let notebookCount = 0;
                if (userInfo.workspaces) {
                    const workspaceIds = Object.keys(userInfo.workspaces);
                    for (const workspaceId of workspaceIds) {
                        try {
                            const workspaceRef = admin.database().ref(`workspaces/${workspaceId}/notebooks`);
                            const workspaceSnapshot = await workspaceRef.once('value');
                            if (workspaceSnapshot.exists()) {
                                const notebooks = workspaceSnapshot.val();
                                notebookCount += Object.keys(notebooks).length;
                            }
                        } catch (err) {
                            console.warn(`Error counting notebooks for workspace ${workspaceId}:`, err);
                        }
                    }
                }

                try {
                    // Get user record from Firebase Auth to check disabled status
                    const userRecord = await adminAuth.getUser(uid);

                    usersList.push({
                        uid,
                        email: userInfo.email || userRecord.email || 'No email',
                        role: userInfo.role || 'user',
                        createdAt: userInfo.createdAt || 0,
                        lastLoginAt: userInfo.lastLoginAt,
                        workspaceCount,
                        notebookCount,
                        disabled: userRecord.disabled || false, // Get disabled status from Firebase Auth
                        emailVerified: userRecord.emailVerified || false, // Get email verification status from Firebase Auth
                    });
                } catch (authError) {
                    // If user doesn't exist in Firebase Auth, skip them or mark as disabled
                    console.warn(`User ${uid} not found in Firebase Auth:`, authError);
                    usersList.push({
                        uid,
                        email: userInfo.email || 'No email',
                        role: userInfo.role || 'user',
                        createdAt: userInfo.createdAt || 0,
                        lastLoginAt: userInfo.lastLoginAt,
                        workspaceCount,
                        notebookCount,
                        disabled: true, // Mark as disabled if not found in Auth
                        emailVerified: false, // Mark as not verified if not found in Auth
                    });
                }
            }

            // Sort by creation date (newest first)
            usersList.sort((a, b) => b.createdAt - a.createdAt);

            return NextResponse.json({ users: usersList });

        } catch (error) {
            console.error('Error fetching users:', error);
            return jsonError(500, 'Failed to fetch users');
        }
    } catch (error) {
        console.error('Admin users API error:', error);
        return jsonError(500, 'Internal server error');
    }
}

export const dynamic = 'force-dynamic';
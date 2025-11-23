import admin from './firebase-admin';
import { cookies } from 'next/headers';

/**
 * Checks if the system is in maintenance mode and if the current user is allowed to bypass it.
 * Returns true if the request should be BLOCKED.
 */
export async function isMaintenanceModeActive(): Promise<boolean> {
    try {
        // 1. Fetch maintenance settings from RTDB
        const db = admin.database();
        const settingsRef = db.ref('adminSettings');
        const snapshot = await settingsRef.once('value');
        const settings = snapshot.val() || {};

        const maintenanceMode = settings.maintenanceMode === true;

        // If maintenance is not active, no need to block
        if (!maintenanceMode) {
            return false;
        }

        // 2. If active, check if user is an admin (root_admin or admin)
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get('session')?.value;

        if (!sessionCookie) {
            // No session, so block (unless it's a public route, which middleware handles)
            return true;
        }

        try {
            // Verify session cookie
            const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
            const uid = decodedClaims.uid;

            // Check user role in RTDB
            const userRoleRef = db.ref(`users/${uid}/role`);
            const roleSnapshot = await userRoleRef.once('value');
            const role = roleSnapshot.val();

            // Allow if role is 'root_admin' or 'admin'
            if (role === 'root_admin' || role === 'admin') {
                return false; // Do NOT block
            }

            // Block all other roles
            return true;

        } catch (authError) {
            // Invalid session, block
            return true;
        }

    } catch (error) {
        console.error('Error checking maintenance mode:', error);
        // Fail safe: if we can't check, assume not blocked to avoid locking everyone out on error?
        // Or block to be safe? Let's assume not blocked to prevent accidental DOS.
        return false;
    }
}

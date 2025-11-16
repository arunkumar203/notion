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
            return jsonError(403, 'Only admins can access analytics');
        }

        // Get database references
        const rtdb = admin.database();
        const firestore = admin.firestore();

        // Fetch all data from Realtime Database
        const [usersSnapshot, notebooksSnapshot] = await Promise.all([
            rtdb.ref('users').once('value'),
            rtdb.ref('notebooks').once('value'),
        ]);

        const usersData = usersSnapshot.val() || {};
        const notebooksData = notebooksSnapshot.val() || {};

        // Fetch shared pages from Firestore
        const sharedPagesSnapshot = await firestore.collection('shares').get();
        const totalSharedPages = sharedPagesSnapshot.size;

        // Calculate user metrics
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

        let totalUsers = 0;
        let activeUsersLast7Days = 0;
        let activeUsersLast30Days = 0;
        let newUsersLast7Days = 0;
        let newUsersLast30Days = 0;

        Object.values(usersData).forEach((userData: any) => {
            totalUsers++;

            const createdAt = userData.createdAt || 0;
            if (createdAt > sevenDaysAgo) newUsersLast7Days++;
            if (createdAt > thirtyDaysAgo) newUsersLast30Days++;

            const lastActive = userData.lastActive || userData.createdAt || 0;
            if (lastActive > sevenDaysAgo) activeUsersLast7Days++;
            if (lastActive > thirtyDaysAgo) activeUsersLast30Days++;
        });

        // Calculate content metrics
        let totalNotebooks = 0;
        let totalSections = 0;
        let totalTopics = 0;
        let totalPages = 0;

        Object.values(notebooksData).forEach((notebook: any) => {
            if (notebook && typeof notebook === 'object') {
                totalNotebooks++;

                if (notebook.sections && typeof notebook.sections === 'object') {
                    Object.values(notebook.sections).forEach((section: any) => {
                        if (section && typeof section === 'object') {
                            totalSections++;

                            if (section.topics && typeof section.topics === 'object') {
                                Object.values(section.topics).forEach((topic: any) => {
                                    if (topic && typeof topic === 'object') {
                                        totalTopics++;

                                        if (topic.pages && typeof topic.pages === 'object') {
                                            totalPages += Object.keys(topic.pages).length;
                                        }
                                    }
                                });
                            }
                        }
                    });
                }
            }
        });

        // Calculate Realtime Database size (approximate)
        // Note: This is raw JSON size. Firebase actual storage includes metadata, indexing, and overhead
        // Multiply by ~2.5 to approximate actual Firebase storage (based on typical overhead)
        const usersSize = JSON.stringify(usersData).length;
        const notebooksSize = JSON.stringify(notebooksData).length;
        const rawSize = usersSize + notebooksSize;
        const realtimeDbSize = Math.round(rawSize * 2.5); // Account for Firebase overhead

        // Calculate Firestore size (approximate - based on document count and average size)
        // Firestore charges per document read/write, so we estimate based on document count
        const firestoreSize = totalSharedPages * 1024; // Rough estimate: 1KB per shared page document

        const totalRecords = totalUsers + totalNotebooks + totalSections + totalTopics + totalPages;
        const averageRecordSize = totalRecords > 0 ? realtimeDbSize / totalRecords : 0;

        // Calculate averages
        const averagePagesPerNotebook = totalNotebooks > 0 ? totalPages / totalNotebooks : 0;
        const averageNotebooksPerUser = totalUsers > 0 ? totalNotebooks / totalUsers : 0;

        // Calculate growth rates
        const userGrowthRate = totalUsers > 0 ? (newUsersLast30Days / totalUsers) * 100 : 0;
        const contentGrowthRate =
            totalNotebooks > 0 ? ((newUsersLast30Days * averageNotebooksPerUser) / totalNotebooks) * 100 : 0;

        const analytics = {
            realtimeDbSize,
            firestoreSize,
            totalRecords,
            averageRecordSize,
            totalUsers,
            activeUsersLast7Days,
            activeUsersLast30Days,
            newUsersLast7Days,
            newUsersLast30Days,
            totalNotebooks,
            totalSections,
            totalTopics,
            totalPages,
            averagePagesPerNotebook,
            averageNotebooksPerUser,
            totalSharedPages,
            recentActivityCount: activeUsersLast7Days,
            userGrowthRate,
            contentGrowthRate,
        };

        return NextResponse.json(analytics);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return jsonError(500, 'Failed to fetch analytics');
    }
}

export const dynamic = 'force-dynamic';

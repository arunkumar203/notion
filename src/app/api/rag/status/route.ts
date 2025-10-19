import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export async function GET(req: Request) {
    try {
        if (!adminAuth) return jsonError(500, 'Server not ready');

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value || '';
        if (!session) return jsonError(401, 'Not authenticated');

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const uid = decoded?.uid as string;

        // Get RAG status from RTDB
        const rtdb = admin.database();
        const ragRef = rtdb.ref(`users/${uid}/rag`);
        const snapshot = await ragRef.once('value');
        const ragData = snapshot.val() || {};

        // Get additional info from Firestore if available
        let firestoreInfo = null;
        try {
            const firestore = admin.firestore();
            const ragDoc = await firestore.collection('rag').doc(uid).get();

            if (ragDoc.exists) {
                const data = ragDoc.data();
                firestoreInfo = {
                    totalChunks: data?.chunks?.length || 0,
                    metadata: data?.metadata || {}
                };
            }
        } catch (error) {
            console.error('Error fetching Firestore RAG data:', error);
        }

        return NextResponse.json({
            status: ragData.status || 'not_built',
            enabled: ragData.enabled || false,
            lastUpdated: ragData.last_updated,
            totalChunks: ragData.total_chunks || 0,
            totalPages: ragData.total_pages || 0,
            currentStep: ragData.currentStep,
            startedAt: ragData.startedAt,
            completedAt: ragData.completedAt,
            errorAt: ragData.errorAt,
            lastError: ragData.lastError,
            firestoreInfo
        });

    } catch (error) {
        console.error('RAG status error:', error);
        return jsonError(500, 'Failed to get RAG status');
    }
}
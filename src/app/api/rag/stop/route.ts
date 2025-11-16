import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export async function POST(req: Request) {
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

        // Update RTDB to mark build as stopped
        const rtdb = admin.database();
        await rtdb.ref(`users/${uid}/rag`).update({
            status: 'error',
            errorAt: Date.now(),
            lastError: 'Build stopped by user',
            currentStep: {
                step: 'Stopped',
                details: {
                    status: 'stopped',
                    message: 'Build process was stopped by user request'
                },
                timestamp: new Date().toISOString()
            }
        });

        console.log(`🛑 RAG build stopped for user: ${uid}`);

        return NextResponse.json({
            message: 'RAG build stopped',
            status: 'stopped',
            uid
        });

    } catch (error) {
        console.error('RAG stop error:', error);
        return jsonError(500, 'Failed to stop RAG build');
    }
}
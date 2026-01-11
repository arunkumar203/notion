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

        // Update RTDB to show RAG build is starting and clear old errors
        const rtdb = admin.database();
        await rtdb.ref(`users/${uid}/rag`).update({
            status: 'building',
            startedAt: Date.now(),
            lastError: null,
            errorAt: null,
            lastBuildOutput: null,
            currentStep: {
                step: 'Initializing',
                details: { status: 'starting' },
                timestamp: new Date().toISOString()
            }
        });

        // Get user's Google AI API key
        const userSettingsSnap = await rtdb.ref(`users/${uid}/settings/ai`).get();
        const userSettings = userSettingsSnap.exists() ? userSettingsSnap.val() : {};
        const apiKey = userSettings.apiKey?.trim();

        if (!apiKey) {
            return jsonError(400, 'Missing Google AI Studio API key in Account Settings → AI Configuration');
        }

        // Run the RAG pipeline using Node.js implementation
        console.log(`🚀 Starting Node.js RAG build for user: ${uid}`);

        // Import and run RAG pipeline asynchronously
        setImmediate(async () => {
            let rag: any = null;
            try {
                const { RAGPipeline } = await import('@/lib/rag-pipeline');
                rag = new RAGPipeline(uid, apiKey);

                console.log(`📊 RAG Build: Starting pipeline for user ${uid}`);
                const result = await rag.buildRAGIndex();
                console.log(`✅ RAG Build: Completed successfully for user ${uid}`, result);

            } catch (error) {
                console.error(`❌ RAG Build: Failed for user ${uid}:`, error);

                // Update RTDB with error status
                await rtdb.ref(`users/${uid}/rag`).update({
                    status: 'error',
                    errorAt: Date.now(),
                    lastError: error instanceof Error ? error.message : 'Unknown error',
                    currentStep: {
                        step: 'Error',
                        details: { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' },
                        timestamp: new Date().toISOString()
                    }
                });
            } finally {
                // Always close Neo4j connection
                if (rag) {
                    try {
                        await rag.closeNeo4j();
                    } catch (e) {
                        console.error('Error closing Neo4j connection:', e);
                    }
                }
            }
        });

        // Don't wait for completion, return immediately
        return NextResponse.json({
            message: 'RAG build started',
            status: 'building',
            uid
        });

    } catch (error) {
        console.error('RAG build error:', error);
        return jsonError(500, 'Failed to start RAG build');
    }
}
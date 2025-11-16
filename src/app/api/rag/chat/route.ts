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
        } catch (error) {
            console.error('RAG Chat - Session verification failed:', error);
            return jsonError(401, 'Session expired. Please refresh the page to sign in again.');
        }

        const uid = decoded?.uid as string;
        const body = await req.json().catch(() => ({}));
        const { question } = body;

        if (!question || typeof question !== 'string') {
            return jsonError(400, 'Missing question');
        }

        // Check if user has RAG enabled
        const rtdb = admin.database();
        const ragStatus = await rtdb.ref(`users/${uid}/rag/status`).once('value');

        if (ragStatus.val() !== 'ready') {
            return jsonError(400, 'RAG not ready. Please build your knowledge base first.');
        }

        let rag: any = null;
        try {
            // Get user's Google AI API key
            const userSettingsSnap = await rtdb.ref(`users/${uid}/settings/ai`).get();
            const userSettings = userSettingsSnap.exists() ? userSettingsSnap.val() : {};
            const apiKey = userSettings.apiKey?.trim();

            if (!apiKey) {
                return jsonError(400, 'Missing Google AI Studio API key in Account Settings → AI Configuration');
            }

            // Use Node.js RAG pipeline for proper vector search and LLM integration
            const { RAGPipeline } = await import('@/lib/rag-pipeline');
            rag = new RAGPipeline(uid, apiKey);
            const result = await rag.ragChat(question);

            return NextResponse.json(result);

        } catch (error) {
            console.error('RAG chat error:', error);

            // Fallback to regular AI response
            return NextResponse.json({
                answer: "I couldn't find relevant information in your knowledge base for that question. This response is generated from my training data:\n\n" +
                    "I don't have access to your specific notes on this topic. Please try rephrasing your question or check if your knowledge base contains relevant information.",
                matches: [],
                context_used: 0,
                fallback: true,
                error: error instanceof Error ? error.message : 'Unknown error'
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

    } catch (error) {
        console.error('RAG chat error:', error);
        return jsonError(500, 'Failed to process request');
    }
}


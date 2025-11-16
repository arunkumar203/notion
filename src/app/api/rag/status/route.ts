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
            // Get Neo4j chunk count
            const neo4j = require('neo4j-driver');
            const driver = neo4j.driver(
                process.env.NEO4J_URI || '',
                neo4j.auth.basic(
                    process.env.NEO4J_USERNAME || '',
                    process.env.NEO4J_PASSWORD || ''
                )
            );

            const session = driver.session();
            try {
                const result = await session.run(
                    `MATCH (u:User {userId: $userId})-[:HAS_CHUNK]->(c:Chunk)
                     RETURN count(c) as chunkCount`,
                    { userId: uid }
                );

                const chunkCount = result.records[0]?.get('chunkCount').toNumber() || 0;
                firestoreInfo = {
                    totalChunks: chunkCount,
                    metadata: { storage: 'neo4j' }
                };
            } finally {
                await session.close();
                await driver.close();
            }
        } catch (error) {
            console.error('Error fetching Neo4j RAG data:', error);
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
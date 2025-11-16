import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from '@/lib/firebase-admin';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as cheerio from 'cheerio';
import neo4j, { Driver, Session } from 'neo4j-driver';

// Configuration
const EMBED_MODEL = 'text-embedding-004';
const GEN_MODEL = 'gemini-2.5-flash';
const TOP_K = 5;
const SIMILARITY_THRESHOLD = 0.5; // Minimum similarity score to consider content relevant
const MAX_PAGES_FOR_TESTING = 999999;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

interface Chunk {
    text: string;
    metadata: {
        page_id: string;
        page_name: string;
        chunk_index: number;
        notebook_id?: string;
        section_id?: string;
        topic_id?: string;
    };
}

interface ChunkWithEmbedding extends Chunk {
    embedding: number[];
    embedding_dimension: number;
}

export class RAGPipeline {
    private userId: string;
    private genaiClient: GoogleGenerativeAI;
    private firestore: FirebaseFirestore.Firestore;
    private rtdb: admin.database.Database;
    private neo4jDriver: Driver;
    private chunksCache: any[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor(userId: string, apiKey: string) {
        this.userId = userId;
        this.genaiClient = new GoogleGenerativeAI(apiKey);
        this.firestore = admin.firestore();
        this.rtdb = admin.database();

        // Initialize Neo4j driver for cloud instance
        const neo4jUri = process.env.NEO4J_URI || '';
        const neo4jUser = process.env.NEO4J_USERNAME || '';
        const neo4jPassword = process.env.NEO4J_PASSWORD || '';

        if (!neo4jUri || !neo4jUser || !neo4jPassword) {
            throw new Error('Neo4j credentials not configured. Please set NEO4J_URI, NEO4J_USERNAME, and NEO4J_PASSWORD in environment variables.');
        }

        this.neo4jDriver = neo4j.driver(
            neo4jUri,
            neo4j.auth.basic(neo4jUser, neo4jPassword)
        );
    }

    async closeNeo4j() {
        await this.neo4jDriver.close();
    }

    private async logStep(step: string, details: any) {
        console.log(`Step: ${step} - ${JSON.stringify(details)}`);

        // Update RTDB with current step
        await this.rtdb.ref(`users/${this.userId}/rag`).update({
            currentStep: {
                step,
                details,
                timestamp: new Date().toISOString()
            }
        });
    }

    private async loadUserPages(): Promise<any[]> {
        console.log(`Loading pages for user: ${this.userId}`);

        // Get page index from RTDB
        const pageIndexSnapshot = await this.rtdb.ref(`users/${this.userId}/pageIndex`).once('value');
        const pageIndex = pageIndexSnapshot.val() || {};
        const allPageIds = Object.keys(pageIndex);

        console.log(`Found ${allPageIds.length} page IDs in user's index (may include deleted pages)`);

        // Limit pages for processing
        const pageIdsToProcess = allPageIds.slice(0, MAX_PAGES_FOR_TESTING);
        console.log(`Checking ${pageIdsToProcess.length} pages for content...`);

        // Track orphaned page IDs for cleanup
        const orphanedPageIds: string[] = [];

        // Get content from Firestore in batches
        const pagesData = [];
        const batchSize = 50;

        for (let i = 0; i < pageIdsToProcess.length; i += batchSize) {
            const batchIds = pageIdsToProcess.slice(i, i + batchSize);
            console.log(`Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(pageIdsToProcess.length / batchSize)} (${batchIds.length} pages)...`);

            const batchPromises = batchIds.map(async (pageId) => {
                try {
                    const pageDoc = await this.firestore.collection('pages').doc(pageId).get();
                    if (pageDoc.exists) {
                        const data = pageDoc.data();
                        const pageMeta = pageIndex[pageId] || {};
                        const content = data?.content?.trim() || '';

                        if (content) {
                            return {
                                id: pageId,
                                name: data?.name || pageMeta.name || 'Untitled',
                                content,
                                owner: data?.owner || '',
                                notebook: pageMeta.notebookId || '',
                                section: pageMeta.sectionId || '',
                                topic: pageMeta.topicId || '',
                            };
                        }
                    } else {
                        // Page doesn't exist in Firestore - mark as orphaned
                        orphanedPageIds.push(pageId);
                    }
                    return null;
                } catch (error) {
                    console.warn(`Error loading page ${pageId}:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            pagesData.push(...batchResults.filter(Boolean));
        }

        const missingPages = pageIdsToProcess.length - pagesData.length;
        console.log(`Loaded ${pagesData.length} pages with content (${missingPages} pages missing or empty)`);

        // Clean up orphaned pageIndex entries
        if (orphanedPageIds.length > 0) {
            console.log(`🧹 Cleaning up ${orphanedPageIds.length} orphaned pageIndex entries...`);
            try {
                const updates: Record<string, null> = {};
                orphanedPageIds.forEach(pageId => {
                    updates[`users/${this.userId}/pageIndex/${pageId}`] = null;
                });
                await this.rtdb.ref().update(updates);
                console.log(`✅ Cleaned up ${orphanedPageIds.length} orphaned entries from pageIndex`);
            } catch (error) {
                console.warn('Failed to clean up orphaned pageIndex entries:', error);
            }
        }

        return pagesData;
    }

    private async createChunksWithMetadata(pages: any[]): Promise<Chunk[]> {
        console.log(`\nCreating chunks from ${pages.length} pages...`);

        await this.logStep('Creating Chunks', {
            status: 'starting',
            pages_count: pages.length
        });

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: CHUNK_SIZE,
            chunkOverlap: CHUNK_OVERLAP,
        });

        const allChunks: Chunk[] = [];
        let totalChars = 0;

        for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            console.log(`Processing page ${pageIdx + 1}/${pages.length}: ${page.name.slice(0, 50)}...`);

            // Convert HTML to text using cheerio
            const $ = cheerio.load(page.content);
            const textContent = $.text().trim();

            if (!textContent) continue;

            // Split into chunks
            const chunks = await splitter.splitText(textContent);
            console.log(`Created ${chunks.length} chunks (${textContent.length} chars)`);

            totalChars += textContent.length;

            for (let i = 0; i < chunks.length; i++) {
                allChunks.push({
                    text: chunks[i],
                    metadata: {
                        page_id: page.id,
                        page_name: page.name,
                        chunk_index: i,
                        notebook_id: page.notebook,
                        section_id: page.section,
                        topic_id: page.topic,
                    }
                });
            }
        }

        console.log(`\nChunk creation complete: ${allChunks.length} chunks, ${totalChars} total characters`);

        await this.logStep('Chunks Created', {
            total_chunks: allChunks.length,
            total_characters: totalChars,
            status: 'completed'
        });

        return allChunks;
    }

    private async generateEmbeddings(chunks: Chunk[]): Promise<number[][]> {
        console.log(`\nCreating embeddings for ${chunks.length} chunks...`);

        await this.logStep('Generating Embeddings', {
            status: 'starting',
            chunks_count: chunks.length
        });

        const embeddings: number[][] = [];
        const batchSize = 20; // Process in batches for better performance

        for (let i = 0; i < chunks.length; i += batchSize) {
            const batchEnd = Math.min(i + batchSize, chunks.length);
            const batchChunks = chunks.slice(i, batchEnd);

            try {
                // Use batch embedding if available
                const model = this.genaiClient.getGenerativeModel({ model: EMBED_MODEL });

                const batchPromises = batchChunks.map(async (chunk) => {
                    const result = await model.embedContent(chunk.text);
                    return result.embedding.values;
                });

                const batchEmbeddings = await Promise.all(batchPromises);
                embeddings.push(...batchEmbeddings);

                const completed = embeddings.length;
                console.log(`Generated embeddings: ${completed}/${chunks.length} (${(completed / chunks.length * 100).toFixed(1)}%)`);

                // Log progress every batch
                if (completed % (batchSize * 2) === 0 || completed === chunks.length) {
                    await this.logStep('Embedding Progress', {
                        completed,
                        total: chunks.length,
                        status: 'in_progress'
                    });
                }

            } catch (error) {
                console.error(`Error processing embedding batch ${i}-${batchEnd}:`, error);
                // Add zero vectors for failed batch
                for (let j = 0; j < batchChunks.length; j++) {
                    embeddings.push(new Array(768).fill(0)); // Standard embedding dimension
                }
            }
        }

        console.log(`Embeddings complete: ${embeddings.length} vectors created (dimension: ${embeddings[0]?.length || 0})`);

        await this.logStep('Embeddings Generated', {
            total_embeddings: embeddings.length,
            embedding_dimension: embeddings[0]?.length || 0,
            status: 'completed'
        });

        return embeddings;
    }

    private async clearOldVectors() {
        console.log('Clearing old knowledge base from Neo4j...');

        await this.logStep('Clearing Old Vectors', { status: 'starting' });

        const session = this.neo4jDriver.session();
        try {
            // Delete all pages, chunks and relationships for this user
            const result = await session.run(
                `MATCH (u:User {userId: $userId})
                 OPTIONAL MATCH (u)-[:HAS_PAGE]->(p:Page)
                 OPTIONAL MATCH (p)-[:HAS_CHUNK]->(c:Chunk)
                 WITH u, collect(DISTINCT p) as pages, collect(DISTINCT c) as chunks
                 UNWIND pages as page
                 DETACH DELETE page
                 WITH u, chunks
                 UNWIND chunks as chunk
                 DETACH DELETE chunk
                 RETURN count(chunks) as deletedCount`,
                { userId: this.userId }
            );

            const deletedCount = result.records[0]?.get('deletedCount').toNumber() || 0;
            console.log(`Deleted ${deletedCount} old chunks and pages from Neo4j`);
            await this.logStep('Old Vectors Cleared', { status: 'completed', deletedCount });
        } catch (error) {
            console.warn('Could not clear old vectors:', error);
            await this.logStep('Clear Vectors', { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
        } finally {
            await session.close();
        }
    }

    private async storeVectorsInNeo4j(chunks: Chunk[], embeddings: number[][]) {
        console.log(`\nStoring ${chunks.length} chunks with vectors to Neo4j...`);

        await this.logStep('Storing Vectors', {
            status: 'starting',
            chunks_count: chunks.length
        });

        const session = this.neo4jDriver.session();
        try {
            // Clear old vectors first
            await this.clearOldVectors();

            // Prepare chunks with embeddings
            const chunksWithVectors: ChunkWithEmbedding[] = [];
            console.log('Combining chunks with embeddings...');

            for (let i = 0; i < chunks.length; i++) {
                chunksWithVectors.push({
                    ...chunks[i],
                    embedding: embeddings[i],
                    embedding_dimension: embeddings[i].length
                });

                if ((i + 1) % 20 === 0 || (i + 1) === chunks.length) {
                    console.log(`Prepared: ${i + 1}/${chunks.length} chunks`);
                }
            }

            const uniquePages = new Set(chunks.map(chunk => chunk.metadata.page_id)).size;

            console.log('Saving to Neo4j with graph structure...');

            // First, ensure User node exists
            await session.run(
                `MERGE (u:User {userId: $userId})
                 SET u.lastUpdated = datetime()
                 RETURN u`,
                { userId: this.userId }
            );

            // Group chunks by page
            const pageMap = new Map<string, ChunkWithEmbedding[]>();
            for (const chunk of chunksWithVectors) {
                const pageId = chunk.metadata.page_id;
                if (!pageMap.has(pageId)) {
                    pageMap.set(pageId, []);
                }
                pageMap.get(pageId)!.push(chunk);
            }

            console.log(`Creating ${pageMap.size} pages with ${chunksWithVectors.length} chunks...`);

            let processedChunks = 0;

            // Process each page
            for (const [pageId, pageChunks] of pageMap) {
                const pageName = pageChunks[0].metadata.page_name;
                const notebookId = pageChunks[0].metadata.notebook_id;
                const sectionId = pageChunks[0].metadata.section_id;
                const topicId = pageChunks[0].metadata.topic_id;

                // Sort chunks by index to maintain order
                pageChunks.sort((a, b) => a.metadata.chunk_index - b.metadata.chunk_index);

                // Create Page node and link to User
                await session.run(
                    `MATCH (u:User {userId: $userId})
                     MERGE (p:Page {pageId: $pageId, userId: $userId})
                     SET p.pageName = $pageName,
                         p.notebookId = $notebookId,
                         p.sectionId = $sectionId,
                         p.topicId = $topicId,
                         p.chunkCount = $chunkCount,
                         p.updatedAt = datetime()
                     MERGE (u)-[:HAS_PAGE]->(p)
                     RETURN p`,
                    {
                        userId: this.userId,
                        pageId,
                        pageName,
                        notebookId,
                        sectionId,
                        topicId,
                        chunkCount: pageChunks.length
                    }
                );

                // Create chunks for this page in batches
                const batchSize = 50;
                for (let i = 0; i < pageChunks.length; i += batchSize) {
                    const batchChunks = pageChunks.slice(i, i + batchSize);

                    // Create chunks and link to page
                    await session.run(
                        `MATCH (p:Page {pageId: $pageId, userId: $userId})
                         UNWIND $chunks as chunkData
                         CREATE (c:Chunk {
                             chunkId: chunkData.chunkId,
                             text: chunkData.text,
                             embedding: chunkData.embedding,
                             embeddingDimension: chunkData.embeddingDimension,
                             chunkIndex: chunkData.chunkIndex,
                             createdAt: datetime()
                         })
                         CREATE (p)-[:HAS_CHUNK]->(c)
                         RETURN c.chunkId`,
                        {
                            userId: this.userId,
                            pageId,
                            chunks: batchChunks.map(chunk => ({
                                chunkId: `${pageId}_chunk_${chunk.metadata.chunk_index}`,
                                text: chunk.text,
                                embedding: chunk.embedding,
                                embeddingDimension: chunk.embedding_dimension,
                                chunkIndex: chunk.metadata.chunk_index
                            }))
                        }
                    );

                    processedChunks += batchChunks.length;
                }

                // Create sequential NEXT_CHUNK relationships
                if (pageChunks.length > 1) {
                    await session.run(
                        `MATCH (p:Page {pageId: $pageId, userId: $userId})-[:HAS_CHUNK]->(c:Chunk)
                         WITH c ORDER BY c.chunkIndex
                         WITH collect(c) as chunks
                         UNWIND range(0, size(chunks)-2) as i
                         WITH chunks[i] as current, chunks[i+1] as next
                         MERGE (current)-[:NEXT_CHUNK]->(next)`,
                        { userId: this.userId, pageId }
                    );
                }

                const progress = (processedChunks / chunksWithVectors.length * 100).toFixed(1);
                console.log(`Processed: ${processedChunks}/${chunksWithVectors.length} chunks (${progress}%)`);

                // Update progress
                if (processedChunks % 100 === 0 || processedChunks === chunksWithVectors.length) {
                    await this.logStep('Storing Vectors', {
                        status: 'in_progress',
                        stored: processedChunks,
                        total: chunksWithVectors.length,
                        progress: `${progress}%`
                    });
                }
            }

            console.log('Updating RTDB status...');

            // Update RTDB with RAG status
            await this.rtdb.ref(`users/${this.userId}/rag`).set({
                enabled: true,
                last_updated: new Date().toISOString(),
                status: 'ready',
                completedAt: Date.now(),
                total_chunks: chunksWithVectors.length,
                total_pages: uniquePages,
                embedding_model: EMBED_MODEL,
                storage_backend: 'neo4j',
                currentStep: {
                    step: 'Completed',
                    details: { status: 'success' },
                    timestamp: new Date().toISOString()
                }
            });

            await this.logStep('Storing Vectors', {
                status: 'completed',
                chunks_stored: chunksWithVectors.length,
                pages_processed: uniquePages
            });

            console.log('✅ RAG pipeline completed successfully with Neo4j!');

        } catch (error) {
            console.error('Neo4j storage failed:', error);
            await this.logStep('Storing Vectors', {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        } finally {
            await session.close();
        }
    }

    async buildRAGIndex() {
        console.log(`🚀 Starting RAG build for user: ${this.userId}`);

        // Clear any previous error state when starting new build
        await this.rtdb.ref(`users/${this.userId}/rag`).update({
            status: 'building',
            startedAt: Date.now(),
            lastError: null,
            errorAt: null,
            currentStep: {
                step: 'Initializing',
                details: { status: 'starting' },
                timestamp: new Date().toISOString()
            }
        });

        await this.logStep('RAG Pipeline', {
            status: 'starting',
            message: 'Loading user pages and preparing for processing'
        });

        try {
            // Step 1: Load user pages
            const pages = await this.loadUserPages();
            if (pages.length === 0) {
                throw new Error('No pages found with content');
            }

            // Step 2: Create chunks
            const chunks = await this.createChunksWithMetadata(pages);
            if (chunks.length === 0) {
                throw new Error('No chunks created from pages');
            }

            // Step 3: Generate embeddings
            const embeddings = await this.generateEmbeddings(chunks);

            // Step 4: Store in Neo4j
            await this.storeVectorsInNeo4j(chunks, embeddings);

            return {
                success: true,
                summary: {
                    pages_processed: pages.length,
                    chunks_created: chunks.length,
                    embeddings_generated: embeddings.length,
                    stored_successfully: true
                }
            };

        } catch (error) {
            console.error('RAG build failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            await this.rtdb.ref(`users/${this.userId}/rag`).update({
                status: 'error',
                errorAt: Date.now(),
                lastError: errorMessage,
                currentStep: {
                    step: 'Error',
                    details: { status: 'error', error: errorMessage },
                    timestamp: new Date().toISOString()
                }
            });

            throw error;
        }
    }

    async searchSimilarChunks(query: string, topK: number = TOP_K) {
        const session = this.neo4jDriver.session();
        try {
            // Generate query embedding
            const model = this.genaiClient.getGenerativeModel({ model: EMBED_MODEL });
            const queryResult = await model.embedContent(query);
            const queryEmbedding = queryResult.embedding.values;

            // Get all chunks for this user with page context
            const result = await session.run(
                `MATCH (u:User {userId: $userId})-[:HAS_PAGE]->(p:Page)-[:HAS_CHUNK]->(c:Chunk)
                 RETURN c.chunkId as chunkId,
                        c.text as text,
                        c.embedding as embedding,
                        c.chunkIndex as chunkIndex,
                        p.pageId as pageId,
                        p.pageName as pageName,
                        p.topicId as topicId,
                        p.sectionId as sectionId,
                        p.notebookId as notebookId`,
                { userId: this.userId }
            );

            if (result.records.length === 0) {
                console.log('❌ RAG: No chunks found for user in Neo4j');
                return [];
            }

            console.log(`📊 RAG: Retrieved ${result.records.length} chunks from Neo4j for similarity search`);

            // Calculate cosine similarity for each chunk
            const similarities: Array<{ score: number; chunk: any; metadata: any; context: any }> = [];

            for (const record of result.records) {
                const chunkEmbedding = record.get('embedding');
                if (!chunkEmbedding || !Array.isArray(chunkEmbedding)) continue;

                // Cosine similarity
                const dotProduct = queryEmbedding.reduce((sum: number, a: number, i: number) => sum + a * chunkEmbedding[i], 0);
                const normA = Math.sqrt(queryEmbedding.reduce((sum: number, a: number) => sum + a * a, 0));
                const normB = Math.sqrt(chunkEmbedding.reduce((sum: number, b: number) => sum + b * b, 0));

                if (normA > 0 && normB > 0) {
                    const similarity = dotProduct / (normA * normB);
                    similarities.push({
                        score: similarity,
                        chunk: {
                            text: record.get('text'),
                            embedding: chunkEmbedding
                        },
                        metadata: {
                            page_id: record.get('pageId'),
                            page_name: record.get('pageName'),
                            chunk_index: record.get('chunkIndex'),
                            notebook_id: record.get('notebookId'),
                            section_id: record.get('sectionId'),
                            topic_id: record.get('topicId')
                        },
                        context: {
                            chunkId: record.get('chunkId')
                        }
                    });
                }
            }

            // Sort by similarity
            similarities.sort((a, b) => b.score - a.score);
            const topResults = similarities.slice(0, topK);

            // Enhance results with graph context (neighboring chunks, related pages)
            const enhancedResults = await this.enhanceWithGraphContext(session, topResults);

            return enhancedResults;

        } catch (error) {
            console.error('Error searching chunks in Neo4j:', error);
            return [];
        } finally {
            await session.close();
        }
    }

    private async enhanceWithGraphContext(session: any, results: any[]) {
        // For each top result, get neighboring chunks using NEXT_CHUNK relationships
        for (const result of results) {
            const chunkId = result.context.chunkId;

            // Get previous and next chunks using graph relationships
            const contextResult = await session.run(
                `MATCH (c:Chunk {chunkId: $chunkId})
                 OPTIONAL MATCH (prev:Chunk)-[:NEXT_CHUNK]->(c)
                 OPTIONAL MATCH (c)-[:NEXT_CHUNK]->(next:Chunk)
                 RETURN prev.text as prevText,
                        next.text as nextText`,
                { chunkId }
            );

            if (contextResult.records.length > 0) {
                const record = contextResult.records[0];
                const prevText = record.get('prevText');
                const nextText = record.get('nextText');

                if (prevText) result.context.prevChunk = prevText;
                if (nextText) result.context.nextChunk = nextText;
            }

            // Get related pages from same topic (if topic exists)
            if (result.metadata.topic_id) {
                const relatedResult = await session.run(
                    `MATCH (p:Page {topicId: $topicId})
                     WHERE p.pageId <> $currentPageId
                     RETURN DISTINCT p.pageName as relatedPage
                     LIMIT 3`,
                    {
                        topicId: result.metadata.topic_id,
                        currentPageId: result.metadata.page_id
                    }
                );

                result.context.relatedPages = relatedResult.records.map((r: any) => r.get('relatedPage'));
            }
        }

        return results;
    }

    async ragChat(question: string) {
        try {
            // Search for relevant chunks
            const matches = await this.searchSimilarChunks(question, TOP_K);

            if (matches.length === 0) {
                console.log('❌ RAG: No chunks found');
                return {
                    answer: 'NOT_FOUND',
                    matches: [],
                    message: 'No relevant content found in your knowledge base.'
                };
            }

            // Log similarity scores for testing
            console.log('🔍 RAG Similarity Scores:', matches.map(m => ({
                score: (m.score * 100).toFixed(1) + '%',
                page: m.metadata.page_name,
                preview: m.chunk.text.slice(0, 100) + '...'
            })));

            // Format context from matches
            const contextBlocks = matches.map((match, i) => {
                const metadata = match.metadata;
                const score = match.score;

                return `[${i + 1}] PAGE: ${metadata.page_name || 'Unknown'} | chunk: ${metadata.chunk_index || '?'} | score: ${score.toFixed(4)}\n${match.chunk.text}`;
            });

            const context = contextBlocks.join('\n\n');

            // Create RAG prompt with strict instructions
            const prompt = `You are a personal knowledge assistant. You must ONLY use information from the provided context below. DO NOT use any external knowledge or general information.

STRICT RULES:
- If the answer is not explicitly in the context, respond with: "I couldn't find that information in your notes."
- Never provide general knowledge or information not in the context
- Only cite information that appears in the numbered sections below
- Use [1], [2], etc. to reference the sections

QUESTION: ${question}

CONTEXT FROM YOUR NOTES:
${context}

ANSWER (using ONLY the context above):`;

            // Log context being sent to model for testing
            console.log('📝 RAG Context sent to model:');
            console.log('Question:', question);
            console.log('Context length:', context.length, 'characters');
            console.log('Context preview:', context.slice(0, 500) + (context.length > 500 ? '...' : ''));

            // Generate response
            const model = this.genaiClient.getGenerativeModel({ model: GEN_MODEL });
            const response = await model.generateContent(prompt);
            const answer = response.response.text()?.trim() || "Sorry, I couldn't generate a response.";

            // Console log for testing
            console.log('🤖 RAG Model Output:', answer);



            // Check if model says it couldn't find the information
            const notFoundPhrases = [
                "I couldn't find that information in your notes",
                "couldn't find that information",
                "not found in your notes",
                "no information about",
                "don't have information about",
                "not mentioned in your notes"
            ];

            const modelSaysNotFound = notFoundPhrases.some(phrase =>
                answer.toLowerCase().includes(phrase.toLowerCase())
            );

            if (modelSaysNotFound) {
                return {
                    answer: 'NOT_FOUND',
                    matches: [],
                    message: 'Model determined information not found in knowledge base'
                };
            }

            const ragResponse = {
                answer,
                matches: matches.map(match => ({
                    page_name: match.metadata.page_name || 'Unknown',
                    chunk_index: match.metadata.chunk_index || 0,
                    score: match.score,
                    text_preview: match.chunk.text.length > 200
                        ? match.chunk.text.slice(0, 200) + '...'
                        : match.chunk.text
                })),
                context_used: matches.length
            };



            return ragResponse;

        } catch (error) {
            console.error('Error in RAG chat:', error);
            return {
                answer: 'Sorry, there was an error processing your question.',
                matches: [],
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
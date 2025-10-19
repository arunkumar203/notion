import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from '@/lib/firebase-admin';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import * as cheerio from 'cheerio';

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
    private chunksCache: any[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    constructor(userId: string, apiKey: string) {
        this.userId = userId;
        this.genaiClient = new GoogleGenerativeAI(apiKey);
        this.firestore = admin.firestore();
        this.rtdb = admin.database();
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

        console.log(`Found ${allPageIds.length} total pages in user's index`);

        // Limit pages for processing
        const pageIdsToProcess = allPageIds.slice(0, MAX_PAGES_FOR_TESTING);
        console.log(`Processing ${pageIdsToProcess.length} pages`);

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

        console.log(`Loaded ${pagesData.length} pages with content`);
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
        console.log('Clearing old knowledge base...');

        await this.logStep('Clearing Old Vectors', { status: 'starting' });

        try {
            const userRagDoc = this.firestore.collection('rag').doc(this.userId);

            // Check if document exists
            const docSnapshot = await userRagDoc.get();
            if (docSnapshot.exists) {
                // Delete chunks subcollection in batches
                const chunksCollection = userRagDoc.collection('chunks');
                const chunksSnapshot = await chunksCollection.get();

                // Delete in batches of 200 to improve performance
                const deleteBatchSize = 200;
                const chunks = chunksSnapshot.docs;

                for (let i = 0; i < chunks.length; i += deleteBatchSize) {
                    const batch = this.firestore.batch();
                    const batchChunks = chunks.slice(i, i + deleteBatchSize);

                    batchChunks.forEach(doc => {
                        batch.delete(doc.ref);
                    });

                    await batch.commit();
                    console.log(`Deleted batch: ${Math.min(i + deleteBatchSize, chunks.length)}/${chunks.length} chunks`);
                }

                // Delete main document
                await userRagDoc.delete();
                console.log('Old vectors cleared');
                await this.logStep('Old Vectors Cleared', { status: 'completed' });
            } else {
                console.log('No old vectors found');
                await this.logStep('No Old Vectors', { status: 'none_found' });
            }
        } catch (error) {
            console.warn('Could not clear old vectors:', error);
            await this.logStep('Clear Vectors', { status: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }

    private async storeVectorsInFirestore(chunks: Chunk[], embeddings: number[][]) {
        console.log(`\nStoring ${chunks.length} chunks with vectors to database...`);

        await this.logStep('Storing Vectors', {
            status: 'starting',
            chunks_count: chunks.length
        });

        try {
            // Clear old vectors first
            await this.clearOldVectors();

            // Prepare user's RAG document
            const userRagDoc = this.firestore.collection('rag').doc(this.userId);

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

            console.log('Saving to Firestore in batches...');

            // Store metadata in main document
            await userRagDoc.set({
                user_id: this.userId,
                metadata: {
                    total_chunks: chunksWithVectors.length,
                    total_pages: uniquePages,
                    embedding_model: EMBED_MODEL,
                    chunk_size: CHUNK_SIZE,
                    chunk_overlap: CHUNK_OVERLAP,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }
            });

            // Store chunks in subcollection using very small batches to avoid timeouts
            const chunksCollection = userRagDoc.collection('chunks');
            const batchSize = 80; // Very small batch size to avoid timeouts

            for (let batchStart = 0; batchStart < chunksWithVectors.length; batchStart += batchSize) {
                const batchEnd = Math.min(batchStart + batchSize, chunksWithVectors.length);
                const batchChunks = chunksWithVectors.slice(batchStart, batchEnd);

                // Retry logic for batch commits
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount <= maxRetries) {
                    try {
                        // Create Firestore batch
                        const batch = this.firestore.batch();

                        for (let i = 0; i < batchChunks.length; i++) {
                            const chunkId = `chunk_${batchStart + i}`;
                            const chunkRef = chunksCollection.doc(chunkId);
                            batch.set(chunkRef, batchChunks[i]);
                        }

                        // Commit batch with timeout handling
                        await batch.commit();
                        break; // Success, exit retry loop

                    } catch (error: any) {
                        retryCount++;
                        console.log(`Batch commit failed (attempt ${retryCount}/${maxRetries + 1}):`, error.message);

                        if (retryCount > maxRetries) {
                            // If batch continues to fail, try individual writes as fallback
                            console.log('Batch failed after retries, falling back to individual writes...');
                            await this.logStep('Storing Vectors', {
                                status: 'warning',
                                message: 'Using individual writes due to batch timeout'
                            });

                            for (let i = 0; i < batchChunks.length; i++) {
                                const chunkId = `chunk_${batchStart + i}`;
                                const chunkRef = chunksCollection.doc(chunkId);
                                await chunkRef.set(batchChunks[i]);
                            }
                            break; // Exit retry loop after successful individual writes
                        }

                        // Wait before retry (exponential backoff)
                        const waitTime = Math.pow(2, retryCount) * 1000;
                        console.log(`Retrying in ${waitTime}ms...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                    }
                }

                const progress = (batchEnd / chunksWithVectors.length * 100).toFixed(1);
                console.log(`Stored batch: ${batchEnd}/${chunksWithVectors.length} chunks (${progress}%)`);

                // Update progress more frequently
                if (batchEnd % (batchSize * 2) === 0 || batchEnd === chunksWithVectors.length) {
                    await this.logStep('Storing Vectors', {
                        status: 'in_progress',
                        stored: batchEnd,
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

            console.log('✅ RAG pipeline completed successfully!');

        } catch (error) {
            console.error('Storage failed:', error);
            await this.logStep('Storing Vectors', {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
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

            // Step 4: Store in Firestore
            await this.storeVectorsInFirestore(chunks, embeddings);

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
        try {
            // Generate query embedding
            const model = this.genaiClient.getGenerativeModel({ model: EMBED_MODEL });
            const queryResult = await model.embedContent(query);
            const queryEmbedding = queryResult.embedding.values;

            // Get user's RAG document
            const userRagDoc = await this.firestore.collection('rag').doc(this.userId).get();
            if (!userRagDoc.exists) {
                console.log('❌ RAG: User RAG document not found');
                return [];
            }

            // Get chunks from subcollection with limit to reduce reads
            const chunksCollection = this.firestore.collection('rag').doc(this.userId).collection('chunks');
            const chunksSnapshot = await chunksCollection.limit(500).get(); // Limit to first 500 chunks
            const chunks = chunksSnapshot.docs.map(doc => doc.data());

            console.log(`📊 RAG: Retrieved ${chunks.length} chunks for similarity search`);

            // Calculate cosine similarity for each chunk
            const similarities: Array<{ score: number; chunk: any; metadata: any }> = [];

            for (const chunk of chunks) {
                const chunkEmbedding = chunk.embedding;
                if (!chunkEmbedding) continue;

                // Cosine similarity
                const dotProduct = queryEmbedding.reduce((sum: number, a: number, i: number) => sum + a * chunkEmbedding[i], 0);
                const normA = Math.sqrt(queryEmbedding.reduce((sum: number, a: number) => sum + a * a, 0));
                const normB = Math.sqrt(chunkEmbedding.reduce((sum: number, b: number) => sum + b * b, 0));

                if (normA > 0 && normB > 0) {
                    const similarity = dotProduct / (normA * normB);
                    similarities.push({
                        score: similarity,
                        chunk,
                        metadata: chunk.metadata
                    });
                }
            }

            // Sort by similarity and return top K (no threshold filtering for now)
            similarities.sort((a, b) => b.score - a.score);
            return similarities.slice(0, topK);

        } catch (error) {
            console.error('Error searching chunks:', error);
            return [];
        }
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
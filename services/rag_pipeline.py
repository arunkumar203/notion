"""
End-to-end RAG with Firebase Firestore integration using:
- google-genai (embeddings + generation)
- Firebase Firestore (vector DB + user data)
- BeautifulSoup (HTML text processing)

Integrates with existing Firebase structure:
- Reads user pages from Firestore 'pages' collection
- Stores vectors in Firestore 'rag' collection per user
- Updates RTDB with RAG status and metadata
"""

import os
import json
import uuid
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore, db as rtdb
from google import genai
from langchain.text_splitter import RecursiveCharacterTextSplitter
import logging
from datetime import datetime

# Setup logging - only show warnings and errors to reduce noise
logging.basicConfig(level=logging.WARNING)
logger = logging.getLogger(__name__)

# Set specific loggers to WARNING to reduce API request noise
logging.getLogger('httpx').setLevel(logging.WARNING)
logging.getLogger('google').setLevel(logging.WARNING)

# ---------------------------
# ENV + CLIENTS
# ---------------------------
# Load environment variables from parent directory
env_path = Path(__file__).parent.parent / ".env.local"
load_dotenv(env_path)

# Google AI client will be initialized per user with their API key from Firebase
print("Using per-user Google AI API keys from Firebase settings")

# Firebase Admin setup - using existing credentials from .env.local
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID")
FIREBASE_CLIENT_EMAIL = os.getenv("FIREBASE_CLIENT_EMAIL") 
FIREBASE_PRIVATE_KEY = os.getenv("FIREBASE_PRIVATE_KEY")
FIREBASE_DATABASE_URL = os.getenv("NEXT_PUBLIC_FIREBASE_DATABASE_URL")

print(f"Firebase Config Check:")
print(f"   Project ID: {FIREBASE_PROJECT_ID}")
print(f"   Client Email: {FIREBASE_CLIENT_EMAIL}")
print(f"   Database URL: {FIREBASE_DATABASE_URL}")
print(f"   Private Key: {'Present' if FIREBASE_PRIVATE_KEY else 'Missing'}")

if not all([FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, FIREBASE_DATABASE_URL]):
    missing = []
    if not FIREBASE_PROJECT_ID: missing.append("FIREBASE_PROJECT_ID")
    if not FIREBASE_CLIENT_EMAIL: missing.append("FIREBASE_CLIENT_EMAIL")
    if not FIREBASE_PRIVATE_KEY: missing.append("FIREBASE_PRIVATE_KEY")
    if not FIREBASE_DATABASE_URL: missing.append("NEXT_PUBLIC_FIREBASE_DATABASE_URL")
    raise RuntimeError(f"Missing Firebase environment variables: {', '.join(missing)}")

# Initialize Firebase Admin
if not firebase_admin._apps:
    try:
        # Clean up the private key properly - handle the quoted format from .env
        private_key = FIREBASE_PRIVATE_KEY
        if private_key:
            # Remove outer quotes if present
            if private_key.startswith('"') and private_key.endswith('"'):
                private_key = private_key[1:-1]
            # Replace escaped newlines with actual newlines
            private_key = private_key.replace('\\n', '\n')
        
        print(f"Private key format check:")
        print(f"   Starts with BEGIN: {'OK' if private_key.startswith('-----BEGIN') else 'FAIL'}")
        print(f"   Ends with END: {'OK' if private_key.endswith('-----') else 'FAIL'}")
        print(f"   Length: {len(private_key)} chars")
        
        cred = credentials.Certificate({
            "type": "service_account",
            "project_id": FIREBASE_PROJECT_ID,
            "private_key_id": "1",  # Can be any string for Firebase Admin
            "private_key": private_key,
            "client_email": FIREBASE_CLIENT_EMAIL,
            "client_id": "",  # Not required for Firebase Admin
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": f"https://www.googleapis.com/robot/v1/metadata/x509/{FIREBASE_CLIENT_EMAIL.replace('@', '%40')}"
        })
        
        firebase_admin.initialize_app(cred, {
            'databaseURL': FIREBASE_DATABASE_URL
        })
        
        print("Firebase Admin initialized successfully")
        
    except Exception as e:
        error_msg = f"Firebase Admin initialization failed: {str(e)}"
        print(f"ERROR: {error_msg}")
        logger.error(f"ERROR: {error_msg}")
        raise RuntimeError(error_msg)

# Initialize Firebase clients (Google AI client will be per-user)
firestore_client = firestore.client()
rtdb_client = rtdb.reference()

# Constants
EMBED_MODEL = "text-embedding-004"
GEN_MODEL = "gemini-2.5-flash"
TOP_K = 5
MAX_PAGES_FOR_TESTING = 999999  # Process all pages
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

class RAGPipeline:
    def __init__(self, user_id: str):
        self.user_id = user_id
        self.rag_collection = firestore_client.collection('rag')
        self.pages_collection = firestore_client.collection('pages')
        self.user_rtdb_ref = rtdb_client.child('users').child(user_id)
        self.genai_client = None
        
        # Get user's API key from Firebase settings
        self._initialize_genai_client()
    
    def _initialize_genai_client(self):
        """Initialize Google AI client with user's API key from Firebase"""
        try:
            # Get user's AI settings from RTDB
            settings_ref = self.user_rtdb_ref.child('settings').child('ai')
            settings_snapshot = settings_ref.get()
            
            if not settings_snapshot:
                raise RuntimeError(f"No AI settings found for user {self.user_id}")
            
            settings = settings_snapshot or {}
            api_key = settings.get('apiKey', '').strip()
            
            if not api_key:
                raise RuntimeError(f"No Google AI API key found for user {self.user_id}. Please add your API key in Account Settings.")
            
            self.genai_client = genai.Client(api_key=api_key)
            print(f"Initialized Google AI client for user {self.user_id}")
            
        except Exception as e:
            error_msg = f"Failed to initialize Google AI client for user {self.user_id}: {str(e)}"
            print(f"ERROR: {error_msg}")
            raise RuntimeError(error_msg)
        
    def log_step(self, step: str, details: Dict[str, Any]):
        """Log step details to both console and RTDB"""
        print(f"Step: {step} - {details}")  # Use print instead of logger for progress
        
        # Update RTDB with current step
        self.user_rtdb_ref.child('rag').child('currentStep').set({
            'step': step,
            'details': details,
            'timestamp': datetime.now().isoformat()
        })
    
    def html_to_text(self, html_content: str) -> str:
        """Convert HTML content to clean text"""
        if not html_content:
            return ""
            
        soup = BeautifulSoup(html_content, "html.parser")
        
        # Remove script/style/noscript tags
        for tag in soup(["script", "style", "noscript"]):
            tag.extract()
        
        text = soup.get_text("\n")
        
        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines()]
        text = "\n".join([line for line in lines if line])
        
        return text.strip()
    
    def load_user_pages(self) -> List[Dict[str, Any]]:
        """Load user's pages from their notebook structure"""
        self.log_step("Loading Pages", {"status": "starting"})
        
        try:
            # Get all page IDs from user's pageIndex in RTDB
            print("Getting page index from RTDB...")
            page_index_ref = self.user_rtdb_ref.child('pageIndex')
            print("Calling page_index_ref.get()...")
            page_index_snapshot = page_index_ref.get()
            print("Got page index snapshot")
            
            if not page_index_snapshot:
                print("No page index found")
                self.log_step("Pages Loaded", {"total_pages": 0, "status": "completed"})
                return []
            
            page_index = page_index_snapshot or {}
            all_page_ids = list(page_index.keys())
            print(f"Got page index with {len(all_page_ids)} page IDs")
            
            print(f"Found {len(all_page_ids)} total pages in user's index")
            
            # Limit to MAX_PAGES_FOR_TESTING
            page_ids_to_process = all_page_ids[:MAX_PAGES_FOR_TESTING]
            
            print(f"Processing first {len(page_ids_to_process)} pages (limit: {MAX_PAGES_FOR_TESTING})")
            
            # Get content from Firestore using batch processing for better performance
            pages_data = []
            pages_with_content = 0
            pages_empty = 0
            pages_missing = 0
            
            print(f"Fetching {len(page_ids_to_process)} pages in batches...")
            
            # Process in batches of 50 to avoid Firestore limits
            batch_size = 50
            for batch_start in range(0, len(page_ids_to_process), batch_size):
                batch_end = min(batch_start + batch_size, len(page_ids_to_process))
                batch_ids = page_ids_to_process[batch_start:batch_end]
                
                print(f"   Fetching batch {batch_start//batch_size + 1}/{(len(page_ids_to_process) + batch_size - 1)//batch_size} ({len(batch_ids)} pages)...")
                
                # Fetch batch of documents
                batch_docs = []
                for page_id in batch_ids:
                    try:
                        page_doc = self.pages_collection.document(page_id).get()
                        batch_docs.append((page_id, page_doc))
                    except Exception as e:
                        print(f"WARNING: Error loading page {page_id}: {e}")
                        pages_missing += 1
                        continue
                
                # Process batch results
                for page_id, page_doc in batch_docs:
                    try:
                        if page_doc.exists:
                            data = page_doc.to_dict()
                            page_meta = page_index.get(page_id, {})
                            content = data.get('content', '').strip()
                            
                            # Include all pages (you said they all have content)
                            pages_data.append({
                                'id': page_id,
                                'name': data.get('name', page_meta.get('name', 'Untitled')),
                                'content': content,
                                'owner': data.get('owner', ''),
                                'notebook': page_meta.get('notebookId', ''),
                                'section': page_meta.get('sectionId', ''),
                                'topic': page_meta.get('topicId', ''),
                            })
                            
                            if content:
                                pages_with_content += 1
                            else:
                                pages_empty += 1
                        else:
                            pages_missing += 1
                            
                    except Exception as e:
                        print(f"WARNING: Error processing page {page_id}: {e}")
                        pages_missing += 1
                        continue
            
            print(f"Page Analysis:")
            print(f"   Total found: {len(all_page_ids)}")
            print(f"   Processed: {len(page_ids_to_process)}")
            print(f"   With content: {pages_with_content}")
            print(f"   Empty: {pages_empty}")
            print(f"   Missing: {pages_missing}")
            
            self.log_step("Pages Loaded", {
                "total_found": len(all_page_ids),
                "processed": len(page_ids_to_process),
                "with_content": pages_with_content,
                "empty": pages_empty,
                "missing": pages_missing,
                "status": "completed"
            })
            
            return pages_data
            
        except Exception as e:
            self.log_step("Loading Pages", {"status": "error", "error": str(e)})
            raise
    
    def create_chunks_with_metadata(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create text chunks from pages with metadata"""
        print(f"\nCreating chunks from {len(pages)} pages...")
        
        self.log_step("Creating Chunks", {"status": "starting", "pages_count": len(pages)})
        
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
        )
        
        all_chunks = []
        total_chars = 0
        
        for page_idx, page in enumerate(pages):
            print(f"   Processing page {page_idx + 1}/{len(pages)}: {page['name'][:50]}...")
            
            # Convert HTML to text
            text_content = self.html_to_text(page['content'])
            if not text_content.strip():
                print(f"      Skipping empty page")
                continue
                
            total_chars += len(text_content)
            
            # Split into chunks
            chunks = splitter.split_text(text_content)
            print(f"      Created {len(chunks)} chunks ({len(text_content)} chars)")
            
            for i, chunk_text in enumerate(chunks):
                chunk_doc = {
                    "id": str(uuid.uuid4()),
                    "text": chunk_text,
                    "metadata": {
                        "page_id": page['id'],
                        "page_name": page['name'],
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "char_count": len(chunk_text),
                        "user_id": self.user_id,
                        "created_at": datetime.now().isoformat()
                    }
                }
                all_chunks.append(chunk_doc)
        
        print(f"Chunking complete: {len(all_chunks)} total chunks from {total_chars:,} characters")
        
        self.log_step("Chunks Created", {
            "total_chunks": len(all_chunks),
            "total_characters": total_chars,
            "status": "completed"
        })
        
        return all_chunks
    
    def generate_embeddings(self, chunks: List[Dict[str, Any]]) -> List[List[float]]:
        """Generate embeddings for text chunks using batch processing"""
        print(f"\nCreating embeddings for {len(chunks)} chunks...")
        
        self.log_step("Generating Embeddings", {
            "status": "starting", 
            "chunks_count": len(chunks)
        })
        
        embeddings = []
        
        # Process in batches to improve performance and handle API limits
        batch_size = 20  # Google AI API supports batch requests
        
        for batch_start in range(0, len(chunks), batch_size):
            batch_end = min(batch_start + batch_size, len(chunks))
            batch_chunks = chunks[batch_start:batch_end]
            
            try:
                # Prepare batch content
                batch_texts = [chunk['text'] for chunk in batch_chunks]
                
                # Use batch embedding if available, otherwise fall back to individual
                try:
                    result = self.genai_client.models.batch_embed_contents(
                        model=EMBED_MODEL,
                        requests=[{"content": {"parts": [{"text": text}]}} for text in batch_texts]
                    )
                    
                    # Extract embeddings from batch result
                    for embedding_result in result.embeddings:
                        embeddings.append(embedding_result.values)
                        
                except AttributeError:
                    # Fallback to individual requests if batch not available
                    for chunk in batch_chunks:
                        try:
                            result = self.genai_client.models.embed_content(
                                model=EMBED_MODEL,
                                contents=chunk['text']
                            )
                            embeddings.append(result.embeddings[0].values)
                        except Exception as e:
                            print(f"   ERROR on chunk: {e}")
                            embeddings.append([0.0] * 768)  # Standard embedding dimension
                
                # Progress reporting
                completed = len(embeddings)
                print(f"   Generated embeddings: {completed}/{len(chunks)} ({completed/len(chunks)*100:.1f}%)")
                
                # Log progress every batch
                if completed % (batch_size * 2) == 0 or completed == len(chunks):
                    self.log_step("Embedding Progress", {
                        "completed": completed,
                        "total": len(chunks),
                        "status": "in_progress"
                    })
                    
            except Exception as e:
                print(f"   ERROR processing batch {batch_start}-{batch_end}: {e}")
                # Add zero vectors for failed batch
                for _ in batch_chunks:
                    embeddings.append([0.0] * 768)
        
        print(f"Embeddings complete: {len(embeddings)} vectors created (dimension: {len(embeddings[0]) if embeddings else 0})")
        
        self.log_step("Embeddings Generated", {
            "total_embeddings": len(embeddings),
            "embedding_dimension": len(embeddings[0]) if embeddings else 0,
            "status": "completed"
        })
        
        return embeddings
    
    def clear_old_vectors(self):
        """Clear old vectors to avoid conflicts"""
        print(f"Clearing old knowledge base...")
        
        self.log_step("Clearing Old Vectors", {"status": "starting"})
        
        try:
            user_rag_doc = self.rag_collection.document(self.user_id)
            
            # Check if document exists
            if user_rag_doc.get().exists:
                user_rag_doc.delete()
                print(f"   Old vectors cleared")
                self.log_step("Old Vectors Cleared", {"status": "completed"})
            else:
                print(f"   No old vectors found")
                self.log_step("No Old Vectors", {"status": "none_found"})
                
        except Exception as e:
            print(f"   WARNING: Could not clear old vectors: {e}")
            self.log_step("Clear Vectors", {"status": "error", "error": str(e)})
            # Don't fail the whole process if clearing fails

    def store_vectors_in_firestore(self, chunks: List[Dict[str, Any]], embeddings: List[List[float]]):
        """Store chunks and embeddings in Firestore rag collection"""
        print(f"\nStoring {len(chunks)} chunks with vectors to database...")
        
        self.log_step("Storing Vectors", {
            "status": "starting",
            "chunks_count": len(chunks)
        })
        
        try:
            # Clear old vectors first to avoid conflicts
            self.clear_old_vectors()
            
            # Prepare user's RAG document
            user_rag_doc = self.rag_collection.document(self.user_id)
            
            # Prepare chunks with embeddings
            chunks_with_vectors = []
            print(f"   Combining chunks with embeddings...")
            
            for i, chunk in enumerate(chunks):
                chunk_data = {
                    **chunk,
                    "embedding": embeddings[i],
                    "embedding_dimension": len(embeddings[i])
                }
                chunks_with_vectors.append(chunk_data)
                
                if (i + 1) % 20 == 0 or (i + 1) == len(chunks):
                    print(f"      Prepared: {i + 1}/{len(chunks)} chunks")
            
            unique_pages = len(set(chunk['metadata']['page_id'] for chunk in chunks))
            
            print(f"   Saving to Firestore in batches...")
            
            # Store metadata in main document
            user_rag_doc.set({
                "user_id": self.user_id,
                "metadata": {
                    "total_chunks": len(chunks_with_vectors),
                    "total_pages": unique_pages,
                    "embedding_model": EMBED_MODEL,
                    "chunk_size": CHUNK_SIZE,
                    "chunk_overlap": CHUNK_OVERLAP,
                    "created_at": datetime.now().isoformat(),
                    "updated_at": datetime.now().isoformat()
                }
            })
            
            # Store chunks in subcollection using batches to avoid timeouts
            chunks_collection = user_rag_doc.collection('chunks')
            
            # Process in smaller batches to avoid Firestore limits and timeouts
            batch_size = 50  # Reduced from 100 to 50 for better reliability with large embeddings
            
            for batch_start in range(0, len(chunks_with_vectors), batch_size):
                batch_end = min(batch_start + batch_size, len(chunks_with_vectors))
                batch_chunks = chunks_with_vectors[batch_start:batch_end]
                
                # Create Firestore batch
                batch = firestore_client.batch()
                
                for i, chunk_data in enumerate(batch_chunks):
                    chunk_id = f"chunk_{batch_start + i}"
                    chunk_ref = chunks_collection.document(chunk_id)
                    batch.set(chunk_ref, chunk_data)
                
                # Commit batch
                batch.commit()
                
                print(f"      Stored batch: {batch_end}/{len(chunks_with_vectors)} chunks ({batch_end/len(chunks_with_vectors)*100:.1f}%)")
            
            print(f"   Updating RTDB status...")
            
            # Update RTDB with RAG status
            self.user_rtdb_ref.child('rag').set({
                "enabled": True,
                "last_updated": datetime.now().isoformat(),
                "total_chunks": len(chunks_with_vectors),
                "total_pages": unique_pages,
                "firestore_doc_id": self.user_id,
                "status": "ready"
            })
            
            print(f"Storage complete: {len(chunks_with_vectors)} chunks from {unique_pages} pages saved")
            
            self.log_step("Vectors Stored", {
                "firestore_doc_id": self.user_id,
                "total_chunks_stored": len(chunks_with_vectors),
                "total_pages": unique_pages,
                "status": "completed"
            })
            
        except Exception as e:
            print(f"ERROR: Storage failed: {e}")
            self.log_step("Storing Vectors", {"status": "error", "error": str(e)})
            raise
    
    def build_rag_index(self):
        """Complete RAG pipeline: load pages -> chunk -> embed -> store"""
        try:
            self.log_step("RAG Pipeline", {
                "status": "starting", 
                "max_pages": MAX_PAGES_FOR_TESTING,
                "message": f"Processing up to {MAX_PAGES_FOR_TESTING} pages"
            })
            
            # Step 1: Load user pages
            pages = self.load_user_pages()
            if not pages:
                self.log_step("RAG Pipeline", {"status": "completed", "message": "No pages found"})
                return
            
            # Step 2: Create chunks
            chunks = self.create_chunks_with_metadata(pages)
            if not chunks:
                self.log_step("RAG Pipeline", {"status": "completed", "message": "No chunks created"})
                return
            
            # Step 3: Generate embeddings
            embeddings = self.generate_embeddings(chunks)
            
            # Step 4: Store in Firestore
            self.store_vectors_in_firestore(chunks, embeddings)
            
            self.log_step("RAG Pipeline", {
                "status": "completed",
                "summary": {
                    "pages_processed": len(pages),
                    "chunks_created": len(chunks),
                    "embeddings_generated": len(embeddings),
                    "stored_successfully": True
                }
            })
            
        except Exception as e:
            self.log_step("RAG Pipeline", {"status": "error", "error": str(e)})
            raise
    
    def search_similar_chunks(self, query: str, top_k: int = TOP_K) -> List[Dict[str, Any]]:
        """Search for similar chunks using cosine similarity"""
        try:
            # Generate query embedding
            query_result = self.genai_client.models.embed_content(
                model=EMBED_MODEL,
                contents=query
            )
            query_embedding = query_result.embeddings[0].values
            
            # Get user's RAG document
            user_rag_doc = self.rag_collection.document(self.user_id).get()
            if not user_rag_doc.exists:
                return []
            
            # Get chunks from subcollection
            chunks_collection = self.rag_collection.document(self.user_id).collection('chunks')
            chunks_docs = chunks_collection.stream()
            chunks = [doc.to_dict() for doc in chunks_docs]
            
            # Calculate cosine similarity for each chunk
            similarities = []
            for chunk in chunks:
                chunk_embedding = chunk.get('embedding', [])
                if not chunk_embedding:
                    continue
                
                # Cosine similarity
                dot_product = sum(a * b for a, b in zip(query_embedding, chunk_embedding))
                norm_a = sum(a * a for a in query_embedding) ** 0.5
                norm_b = sum(b * b for b in chunk_embedding) ** 0.5
                
                if norm_a > 0 and norm_b > 0:
                    similarity = dot_product / (norm_a * norm_b)
                    similarities.append((similarity, chunk))
            
            # Sort by similarity and return top_k
            similarities.sort(key=lambda x: x[0], reverse=True)
            
            return [
                {
                    "score": sim,
                    "chunk": chunk,
                    "metadata": chunk.get('metadata', {})
                }
                for sim, chunk in similarities[:top_k]
            ]
            
        except Exception as e:
            logger.error(f"Error searching chunks: {e}")
            return []
    
    def rag_chat(self, question: str) -> Dict[str, Any]:
        """RAG-based chat using user's knowledge base"""
        try:
            # Search for relevant chunks
            matches = self.search_similar_chunks(question, TOP_K)
            
            if not matches:
                return {
                    "answer": "NOT_FOUND",
                    "matches": [],
                    "message": "No relevant content found in your knowledge base."
                }
            
            # Format context from matches
            context_blocks = []
            for i, match in enumerate(matches, 1):
                chunk = match['chunk']
                metadata = match['metadata']
                score = match['score']
                
                context_blocks.append(
                    f"[{i}] PAGE: {metadata.get('page_name', 'Unknown')} | "
                    f"chunk: {metadata.get('chunk_index', '?')} | score: {score:.4f}\n"
                    f"{chunk.get('text', '')}"
                )
            
            context = "\n\n".join(context_blocks)
            
            # Create RAG prompt
            prompt = (
                "You are a helpful assistant that answers questions based on the user's personal knowledge base. "
                "Use ONLY the provided context from their notes to answer the question. "
                "If the answer is not in the context, say 'I couldn't find that information in your notes.' "
                "Cite the relevant sections using [1], [2], etc.\n\n"
                f"QUESTION: {question}\n\n"
                f"CONTEXT FROM YOUR NOTES:\n{context}\n\n"
                "ANSWER:"
            )
            
            # Generate response
            response = self.genai_client.models.generate_content(
                model=GEN_MODEL,
                contents=prompt
            )
            
            answer = getattr(response, "text", "").strip() or "Sorry, I couldn't generate a response."
            
            return {
                "answer": answer,
                "matches": [
                    {
                        "page_name": match['metadata'].get('page_name', 'Unknown'),
                        "chunk_index": match['metadata'].get('chunk_index', 0),
                        "score": match['score'],
                        "text_preview": match['chunk'].get('text', '')[:200] + "..." if len(match['chunk'].get('text', '')) > 200 else match['chunk'].get('text', '')
                    }
                    for match in matches
                ],
                "context_used": len(matches)
            }
            
        except Exception as e:
            logger.error(f"Error in RAG chat: {e}")
            return {
                "answer": "Sorry, there was an error processing your question.",
                "matches": [],
                "error": str(e)
            }

def main():
    """Test the RAG pipeline"""
    import sys
    
    if len(sys.argv) != 2:
        print("Usage: python rag_pipeline.py <user_id>")
        sys.exit(1)
    
    user_id = sys.argv[1]
    rag = RAGPipeline(user_id)
    
    print(f"Building RAG index for user: {user_id}")
    rag.build_rag_index()
    print("RAG index built successfully!")
    
    # Interactive chat
    print("\n" + "="*50)
    print("RAG Chat Interface")
    print("Type 'exit' to quit")
    print("="*50)
    
    while True:
        try:
            question = input("\n❓ Ask a question: ").strip()
            if question.lower() in ['exit', 'quit']:
                break
                
            result = rag.rag_chat(question)
            print(f"\nAnswer: {result['answer']}")
            
            if result.get('matches'):
                print(f"\n📚 Sources ({len(result['matches'])} matches):")
                for match in result['matches']:
                    print(f"  • {match['page_name']} (score: {match['score']:.3f})")
                    
        except KeyboardInterrupt:
            break
    
    print("\nGoodbye!")

if __name__ == "__main__":
    main()
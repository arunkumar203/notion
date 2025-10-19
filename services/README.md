# RAG (Retrieval Augmented Generation) Service

This service integrates RAG functionality with your Firebase-based note-taking application, allowing users to query their personal knowledge base using AI.

## Architecture

### Data Flow
1. **Pages** → Stored in Firestore `pages` collection (HTML content)
2. **Processing** → HTML converted to text, chunked, and embedded
3. **Storage** → Vectors stored in Firestore `rag` collection per user
4. **Metadata** → Status and progress tracked in Realtime Database
5. **Query** → User questions matched against personal knowledge base

### Components

#### Python Service (`rag_pipeline.py`)
- Processes user pages from Firestore
- Converts HTML to clean text using BeautifulSoup
- Creates text chunks using LangChain
- Generates embeddings using Google AI
- Stores vectors in Firestore
- Provides search and chat functionality

#### API Routes
- `POST /api/rag/build` - Build user's knowledge base
- `POST /api/rag/chat` - Query knowledge base
- `GET /api/rag/status` - Get build status and metadata

#### UI Components
- `RAGInterface.tsx` - Knowledge base management UI
- Chat integration with RAG toggle
- Real-time status updates

## Setup

### 1. Install Dependencies
```bash
cd services
python setup_rag.py
```

### 2. Environment Variables
Add to your `.env.local`:
```env
GOOGLE_API_KEY=your_google_ai_api_key_here
```

### 3. Test the Service
```bash
python services/test_rag.py <user_id>
```

## Usage

### Building Knowledge Base
1. User clicks "Build Index" in chat interface
2. System processes up to 40 pages (configurable)
3. Progress shown in real-time
4. Status stored in RTDB: `/users/{uid}/rag`

### Querying Knowledge Base
1. User enables RAG toggle in chat
2. Questions first search personal knowledge base
3. If relevant content found, RAG provides answer
4. Otherwise, falls back to regular AI chat

## Data Structure

### Realtime Database
```
/users/{uid}/rag/
├── enabled: boolean
├── status: "not_built" | "building" | "ready" | "error"
├── total_chunks: number
├── total_pages: number
├── last_updated: timestamp
├── currentStep: {
│   ├── step: string
│   ├── details: object
│   └── timestamp: string
└── firestore_doc_id: string
```

### Firestore Collections
```
/rag/{user_id}
├── user_id: string
├── chunks: [
│   ├── id: string
│   ├── text: string
│   ├── embedding: number[]
│   └── metadata: {
│       ├── page_id: string
│       ├── page_name: string
│       ├── chunk_index: number
│       └── ...
│   }
└── metadata: {
    ├── total_chunks: number
    ├── total_pages: number
    ├── embedding_model: string
    └── created_at: timestamp
}
```

## Configuration

### Limits
- `MAX_PAGES_FOR_TESTING`: 40 pages (increase for production)
- `CHUNK_SIZE`: 1000 characters
- `CHUNK_OVERLAP`: 200 characters
- `TOP_K`: 5 search results

### Models
- **Embeddings**: `text-embedding-004`
- **Generation**: `gemini-2.0-flash-exp`

## Security

### Access Control
- Users can only access their own knowledge base
- RTDB rules enforce user isolation
- Firestore rules validate authentication
- API routes verify session cookies

### Data Privacy
- All processing happens server-side
- Vectors stored per-user in isolated documents
- No cross-user data leakage

## Monitoring

### Status Tracking
- Real-time progress updates during build
- Error logging and reporting
- Performance metrics (pages/chunks processed)
- Build completion notifications

### Debugging
- Detailed step logging
- Error messages in RTDB
- Console output for development
- Test scripts for validation

## Scaling Considerations

### Performance
- Batch embedding generation
- Efficient vector similarity search
- Chunked processing for large documents
- Progress tracking for long operations

### Storage
- Firestore document size limits
- Vector compression options
- Cleanup of old embeddings
- Incremental updates

## Future Enhancements

1. **Incremental Updates**: Only process changed pages
2. **Advanced Search**: Hybrid keyword + semantic search
3. **Vector Database**: Migrate to dedicated vector DB (Qdrant/Pinecone)
4. **Multi-modal**: Support images and files
5. **Collaborative**: Shared knowledge bases
6. **Analytics**: Usage metrics and insights
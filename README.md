# OneNot

A fast, minimal Notion-like editor with notebooks/sections/topics, rich text editing, file uploads, sharing, and optional "secret" notes. Built with Next.js App Router, TipTap, Firebase (Auth/RTDB/Firestore), and Appwrite storage.

Live demo: https://notion-ten-rose.vercel.app/

## Features

- Notebook hierarchy
	- Notebooks → Sections → Topics → Pages
	- Sort pages by Updated/Created/Custom (drag to reorder)
	- Overlay selector to quickly choose notebook/section/topic
- Pages list and editor
	- Pages panel with organization and custom sorting
	- Rich editor (TipTap) with headings, lists, images, code, etc.
	- Auto-save with debounce and error handling
	- Inline title editing with duplicate checks
	- Copy-as-markup (HTML/plain) button
	- Spellcheck and View-only toggles
	- Right-side H1 outline rail (read-only, no editor interference)
- Files
	- Upload with progress (Appwrite storage)
- Share
	- Share pages with a link; optional edit permission
- Secret notes
	- Optional password-protected space
	- Move page to secret (server-side API)
- AI assist (Google AI Studio / Gemini)
	- Streaming "Write with AI" inside the editor
	- User-provided API key stored per-account in RTDB
	- Switch models (Gemini 2.5 Flash/Pro) and streaming speed
	- RAG (Retrieval Augmented Generation) with Neo4j graph database
	- Context-aware search with neighboring chunks via graph relationships

## Tech stack

- Next.js (App Router, edge-friendly APIs)
- TipTap editor
- Firebase: Auth, Realtime Database (user/meta), Firestore (pages content)
- Neo4j Aura: Graph database for RAG vectors (cloud instance)
- Appwrite: file storage (client and server routes)
- Tailwind CSS

## Getting started

1) Install

```bash
npm install
```

2) Configure environment variables (create `.env.local`)

Firebase (client):

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

Firebase Admin (server):

```
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Appwrite:

```
NEXT_PUBLIC_APPWRITE_ENDPOINT=
NEXT_PUBLIC_APPWRITE_PROJECT_ID=
APPWRITE_API_KEY=
# Optional if different from default bucket usage
APPWRITE_BUCKET_ID=
# Client-only bucket id used by the editor image upload toolbar
NEXT_PUBLIC_APPWRITE_BUCKET_ID=
```

Neo4j (Cloud - for RAG storage):

```
NEO4J_URI=neo4j+s://your-instance.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

3) Run

```bash
npm run dev
```

Open http://localhost:3000

## Neo4j Setup

1. Create a free Neo4j Aura instance at https://neo4j.com/cloud/aura/
2. Copy your connection URI, username, and password
3. Add them to your `.env.local` file
4. The RAG pipeline will automatically create the graph structure:
   - `User` nodes (one per user)
   - `Page` nodes (one per page with metadata)
   - `Chunk` nodes (text chunks with 768-dim embeddings)
   - `HAS_PAGE` relationships (User → Page)
   - `HAS_CHUNK` relationships (Page → Chunk)
   - `NEXT_CHUNK` relationships (Chunk → Chunk for sequential context)

## Deploy

- Vercel (recommended). Set all the environment variables above in your project settings.
- Live demo is deployed at: https://notion-ten-rose.vercel.app/





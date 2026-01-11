# OneNot

A fast, minimal Notion-like editor with workspaces, notebooks/sections/topics, rich text editing, file uploads, sharing, and optional "secret" notes. Built with Next.js App Router, TipTap, Firebase (Auth/RTDB/Firestore), and Appwrite storage.

Live demo: https://notion-ten-rose.vercel.app/

## Features

- **Workspaces**
	- Create multiple workspaces to organize your content
	- Invite members via email with role-based access (Admin, Editor, Viewer)
	- Switch between workspaces easily
	- Workspace-level settings and permissions
- **Notebook hierarchy**
	- Notebooks → Sections → Topics → Pages
	- Sort pages by Updated/Created/Custom (drag to reorder)
	- Overlay selector to quickly choose notebook/section/topic
- **Pages list and editor**
	- Pages panel with organization and custom sorting
	- Rich editor (TipTap) with headings, lists, images, code, etc.
	- Auto-save with debounce and error handling
	- Inline title editing with duplicate checks
	- Copy-as-markup (HTML/plain) button
	- Spellcheck and View-only toggles
	- Right-side H1 outline rail (read-only, no editor interference)
	- View patterns: Rule lines (Narrow, College, Standard, Wide) and grids
- **Files**
	- Upload with progress (Appwrite storage)
	- Per-user storage limits (configurable by admin)
- **Share**
	- Share pages with a link; optional edit permission
	- Workspace sharing with member invitations
- **Secret notes**
	- Optional password-protected space
	- Move page to secret (server-side API)
- **AI assist (Google AI Studio / Gemini)**
	- Streaming "Write with AI" inside the editor
	- User-provided API key stored per-account in RTDB
	- Admin-configurable AI models (Flash/Pro)
	- RAG (Retrieval Augmented Generation) with Neo4j graph database
	- Context-aware search with neighboring chunks via graph relationships
- **Admin Dashboard**
	- User management
	- System settings (email, signup, maintenance mode)
	- AI model configuration
	- Storage limits

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

## Deploy

- Vercel (recommended). Set all the environment variables above in your project settings.
- Live demo is deployed at: https://notion-ten-rose.vercel.app/

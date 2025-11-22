export const dynamic = 'force-static';

import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';

export default function ChangelogPage() {
  return (
    <main className="min-h-screen bg-white relative">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/notebooks" className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900">
            <FiArrowLeft className="mr-2" /> Back
          </Link>
          <div className="text-sm text-gray-500">Changelog</div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
        {/* Upcoming */}
        {/* <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-900">Upcoming features</h2>
          <ul className="mt-4 space-y-2 list-disc list-inside text-sm text-indigo-800">
            <li>AI-powered document summarization and Q&A on page content</li>
            <li>Voice notes with transcription and automatic page creation</li>
            <li>Calendar integration for meeting notes and scheduled tasks</li>
            <li>Real-time collaboration (live cursors, presence, and comments)</li>
            <li>Import from Markdown/Notion; richer export (Markdown/HTML/PDF)</li>
            <li>Mobile app with offline-first sync and conflict resolution</li>
          </ul>
        </div> */}

        {/* Versions: newest first */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-8">
            {/* v1.7 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">v1.7</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>OneNote-Style Drawing:</strong> Hybrid drawing layer that overlays the text editor, allowing you to draw anywhere on your notes without disrupting text content.</li>
                <li><strong>Drawing Tools:</strong> Pen, highlighter, and eraser tools with customizable colors and sizes for natural handwriting and annotations.</li>
                <li><strong>Perfect Freehand:</strong> Smooth, pressure-sensitive strokes using the Perfect Freehand library for a natural drawing experience.</li>
                <li><strong>Auto-Expansion:</strong> Canvas automatically expands when drawing near the bottom edge, with throttled expansion to prevent performance issues.</li>
                <li><strong>Height Synchronization:</strong> Drawing canvas and text editor heights stay perfectly synchronized, with dynamic updates after AI content generation.</li>
                {/* <li><strong>Mode Switching:</strong> Seamlessly switch between Type and Draw modes using the ribbon toolbar.</li> */}
                {/* <li><strong>Modern Ribbon UI:</strong> Clean, OneNote-inspired ribbon interface with all drawing controls organized and easily accessible.</li> */}
                <li><strong>Color Presets:</strong> 10 preset colors plus custom color picker for unlimited color options.</li>
                {/* <li><strong>Per-Page Persistence:</strong> Drawings are saved per page with proper JSON serialization to Firestore.</li> */}
                {/* <li><strong>PDF Export with Drawings:</strong> Drawings are automatically included when exporting pages, topics, sections, or notebooks to PDF as high-quality SVG graphics.</li> */}
              </ul>
            </div>
            {/* v1.6 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1.6</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>Neo4j Graph Database:</strong> Migrated RAG vector storage from Firestore to Neo4j Aura (cloud) for better performance and scalability.</li>
                <li><strong>Graph-Based RAG:</strong> Implemented proper graph structure with User → Page → Chunk relationships and sequential NEXT_CHUNK links for enhanced context.</li>
                <li><strong>Better Context:</strong> RAG responses now include neighboring chunks automatically, providing richer context to AI for more accurate answers.</li>

              </ul>
            </div>
            {/* v1.5 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1.5</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>RAG (Retrieval Augmented Generation):</strong> Complete AI-powered knowledge base that searches your personal notes to provide contextual answers with source citations.</li>
                <li><strong>Intelligent Chat:</strong> RAG-enabled chat interface that searches your notebooks first, then falls back to general AI knowledge with clear indicators of information source.</li>
                <li><strong>Knowledge Base Management:</strong> Build and rebuild your searchable knowledge base from all your pages with real-time progress tracking and status updates.</li>
                <li><strong>Vector Search:</strong> Advanced semantic search using Google AI embeddings to find relevant content even when exact keywords don't match.</li>
                <li><strong>Source Attribution:</strong> Every RAG response shows which pages were used, with similarity scores and text previews for transparency.</li>
                {/* <li><strong>Per-User Security:</strong> Each user's knowledge base is completely isolated using their own Google AI API keys and Firebase security rules.</li> */}
                {/* <li><strong>Smart Fallback:</strong> When RAG doesn't find relevant content in your notes, the system gracefully falls back to general AI knowledge with clear messaging.</li> */}
                <li><strong>Optimized Performance:</strong> Efficient batched processing for large knowledge bases with proper error handling and recovery mechanisms.</li>
              </ul>
            </div>
            {/* v1.4 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1.4</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>AI Chat Interface:</strong>chat with conversation history, thinking mode, model switcher (Flash/Pro), and markdown rendering with syntax highlighting.</li>
                <li><strong>Chat Features:</strong> Add responses to existing pages, create new pages from responses, copy as markdown, and smart auto-scroll with scroll-to-bottom button.</li>
                <li><strong>Todoist Integration:</strong> Complete task management with OAuth authentication, task creation/completion, project filtering, and natural language date parsing.</li>
                <li><strong>Enhanced Tables:</strong> Improved table editing with better cell navigation, proper column/row management, and Notion-style appearance.</li>
                <li><strong>AI Improvements:</strong> Better error messages showing actual API responses, inline code styling fixes, and smooth thinking dropdown behavior.</li>
                <li><strong>UI Polish:</strong> Fixed hover menu closing on topic changes, eliminated page list flickering and title update delays, smooth scroll animations.</li>
              </ul>
            </div>
            {/* v1.3 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1.3</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>Admin Home Messages:</strong> New admin setting to display toast messages on the home page with countdown timer and automatic 5-second dismissal.</li>
                <li><strong>Kanban Table:</strong> View-only mode support that properly disables editing based on editor state, plus individual card deletion with confirmation.</li>
                <li><strong>Table:</strong> Complete redesign with Notion-style appearance, draggable progress bars, column resizing, and hover-only add buttons positioned outside the table.</li>
                <li><strong>UI Polish:</strong> Fixed dropdown menu positioning and cutoff issues, color system overhaul for select options and progress bars, removed background artifacts.</li>
              </ul>
            </div>
            {/* v1.2 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1.2</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li><strong>Global Search:</strong> Comprehensive search functionality in the navbar center that searches across notebooks, sections, topics, and pages with intelligent navigation and hierarchy selection.</li>
                <li><strong>Email Verification System:</strong> Complete Firebase Auth email verification with auto-checking, resend functionality, and admin control over email sending.</li>
                <li><strong>Admin Dashboard:</strong> Comprehensive 3-tier role system (user/admin/root_admin) with user management, statistics, and role-based permissions.</li>
                <li><strong>User Management:</strong> Admin interface for user status control (enable/disable), account deletion, role editing, and email verification management.</li>
                <li><strong>System Settings:</strong> Admin control panel for system-wide settings including email sending toggle that affects user verification flow.</li>
                <li><strong>Enhanced Security:</strong> Proper permission checks, Firebase Admin SDK integration, and secure API endpoints for all admin operations.</li>
                {/* <li><strong>UI Improvements:</strong> Compact user management table without horizontal scrolling, improved responsive design, and cleaner verification flow.</li> */}
                <li><strong>Database Rules:</strong> Updated Firebase security rules to support admin operations while maintaining user data protection.</li>
              </ul>
            </div>
            {/* v1.1 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v1.1</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>File and page icons now show up next to names and stay saved with your notes.</li>
                <li>Icons appear instantly when you upload a file or link a page; older links are upgraded automatically.</li>
                <li>Smoother editor — removed background scans that could cause flicker.</li>
                <li>Smarter page linking: suggestions hide the current page and its parents. Linking an existing page makes it a child of the page you’re in.</li>
                <li>Reordering items in the sidebar no longer opens the file upload by mistake.</li>
                <li>Deleting a page also deletes its sub‑pages (handled safely on the server).</li>
                <li>New items auto‑select: notebooks, sections, topics, and pages.</li>
                <li>File uploads everywhere now create a proper file link with an icon.</li>
              </ul>
            </div>
            {/* v1 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">v1</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Production hardening: fewer full reloads and smoother navigation on sign out</li>
                <li>Auth redirects simplified: home (/) is always public; logged-in users on /login or /signup go to /notebooks</li>
                <li>Editor H1 navigation: sweeping blue highlight across intermediate headers with smooth tick rail</li>
                <li>Reduced‑motion support across scroll and highlight animations</li>
                <li>Deleting a page now removes referenced Appwrite files; share links revoked</li>
                <li>Move to Secret: clones to Secret, revokes shares, deletes original page doc, preserves files</li>
                <li>Uploads: chunked with retries plus single‑shot fallback; clearer error surfacing</li>
                <li>API correctness: awaited dynamic route params to satisfy Next.js requirements</li>
                <li>UX polish: optimistic deselect after delete; no “loading notes” after logout</li>
              </ul>
            </div>

            {/* v0.6 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.6</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Foundation for H1 rail: IntersectionObserver live active state and smooth tick transitions</li>
                <li>Server delete route ensures Appwrite files are cleaned up alongside page removal</li>
                <li>Move-to-Secret semantics refined: clone under Secret and clear shares (files preserved)</li>
                <li>Upload robustness: added fallback to single upload with improved error messages</li>
                <li>General stability: hook-order fixes and safer scroll/observer lifecycles</li>
              </ul>
            </div>

            {/* v0.5 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.5</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Lightweight H1 navigator with centered tick viewport</li>
                <li>View-only mode that disables editing and formatting UI</li>
                <li>Stability improvements to scroll/resize listeners</li>
              </ul>
            </div>

            {/* v0.4 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.4</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Compact H1 list popover with better spacing and clickability</li>
                <li>Fixed hover bounds to avoid top controls interference</li>
                <li>Tick viewport windowing for long documents</li>
              </ul>
            </div>

            {/* v0.3 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.3</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Slash menu and formatting bubble refinements</li>
                <li>Paste handling for Markdown and code blocks with language detection</li>
                <li>Improved list backspace behavior</li>
              </ul>
            </div>

            {/* v0.2 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.2</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Persistent page sorting across sessions</li>
                <li>About page and general UI polish</li>
              </ul>
            </div>

            {/* v0.1 */}
            <div>
              <div className="inline-flex items-center rounded-md bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-200">v0.1</div>
              <ul className="mt-3 list-disc list-inside text-sm text-gray-800 space-y-1">
                <li>Initial release: notebooks/sections/topics/pages, editor basics</li>
                <li>Tables, images, code highlighting</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-white/80 border-t border-gray-100">
        <div className="max-w-4xl mx-auto py-6 px-4">
          <p className="text-center text-xs text-gray-400">&copy; {new Date().getFullYear()} OneNot</p>
        </div>
      </footer>
    </main>
  );
}

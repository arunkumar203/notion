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
        {/* <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming features</h2>
          <ul className="mt-4 space-y-2 list-disc list-inside text-sm text-gray-800">
            <li>Nested pages (subpages) with tree view and breadcrumbs</li>
            <li>Drag-and-drop reparenting and bulk move across notebooks</li>
            <li>Real-time collaboration (live cursors, presence, and comments)</li>
            <li>Import from Markdown/Notion; richer export (Markdown/HTML/PDF)</li>
            <li>Offline-first mobile sync and conflict resolution improvements</li>
          </ul>
        </div> */}

        {/* Versions: newest first */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-8">
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

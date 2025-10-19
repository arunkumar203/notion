import Link from 'next/link';
import { FiArrowLeft } from 'react-icons/fi';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white relative">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900">
            <FiArrowLeft className="mr-2" /> Back
          </Link>
          <div className="text-sm text-gray-500">About</div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-gray-700">
        <div className="rounded-xl border border-dashed border-gray-300 p-8 bg-white text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">This page has moved</h1>
          <p className="text-sm text-gray-600">
            Please visit the <Link className="text-indigo-600 hover:underline" href="/changelog">Changelog</Link> for release notes and roadmap.
          </p>
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

'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FiZap, FiCompass, FiBookOpen, FiShare2, FiCloudLightning, FiType, FiMoon, FiUploadCloud } from 'react-icons/fi';

// New brand name
const BRAND = 'MemoWave';

export default function Home() {

  return (
    <div className="min-h-screen bg-white relative">
      {/* Subtle aurora background */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_10%_-10%,rgba(79,70,229,0.12),transparent),radial-gradient(800px_400px_at_90%_0%,rgba(16,185,129,0.10),transparent)]" />

      {/* Navigation */}
      <nav className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/80 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-emerald-500">{BRAND}</span>
              </h1>
              <span className="ml-2 text-[10px] sm:text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">BETA</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/login" className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium">Log in</Link>
              <Link href="/signup" className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 shadow-sm">Get Started</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 lg:pt-24 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium ring-1 ring-indigo-100">
                <FiZap /> Fast, minimal workspace for your ideas
              </div>
              <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tight text-gray-900">
                Notes that stay out of your way
                <span className="block bg-clip-text text-transparent bg-gradient-to-br from-indigo-600 to-emerald-500">Build your own rhythm</span>
              </h1>
              <p className="mt-4 text-gray-600 text-lg leading-7">
                {BRAND} is a lightweight canvas for thinking and writing. Clean typography, smooth editing, and instant sync.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link href="/signup" className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700">Create a free account</Link>
                <Link href="#features" className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50">See what’s inside</Link>
              </div>
              <div className="mt-8 flex items-center gap-6 opacity-80">
                <Image src="/vercel.svg" alt="Vercel" width={84} height={24} />
                <Image src="/next.svg" alt="Next.js" width={84} height={24} />
                <Image src="/globe.svg" alt="Worldwide" width={84} height={24} />
              </div>
            </div>

            <div className="relative">
              <div className="relative aspect-[4/3] w-full rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                <div aria-hidden className="absolute -inset-16 z-0 pointer-events-none bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-emerald-500/10 blur-2xl" />
                {/* Use Next/Image for optimized hero image */}
                <Image
                  src="https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1600&q=60"
                  alt={`${BRAND} minimalist workspace`}
                  priority
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="absolute inset-0 object-cover z-10"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 sm:py-20 bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">Simple where it counts</h2>
            <p className="mt-2 text-gray-600">A focused tool for capturing and organizing thoughts.</p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: FiBookOpen, title: 'Focus mode', desc: 'Distraction‑free canvas with beautiful typography.' },
              { icon: FiShare2, title: 'Share in one click', desc: 'Create view/edit links for any page instantly.' },
              { icon: FiCloudLightning, title: 'Real‑time sync', desc: 'Edits save instantly and follow you across devices.' },
              { icon: FiType, title: 'Keyboard‑first', desc: 'Slash commands, shortcuts, and smooth caret movement.' },
              { icon: FiUploadCloud, title: 'Import & export', desc: 'Bring notes in and back out with clean HTML.' },
              { icon: FiMoon, title: 'Themes', desc: 'Looks great in light or dark with tasteful contrasts.' },
            ].map((f) => (
              <div key={f.title} className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <f.icon />
                  </span>
                  <h3 className="font-semibold text-gray-900">{f.title}</h3>
                </div>
                <p className="mt-3 text-gray-600">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-white/10 text-white/80 ring-1 ring-white/15">
            <FiCompass /> Get started
          </p>
          <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white">Write, organize, and move on</h2>
          <p className="mt-2 text-white/70 max-w-2xl mx-auto">No tutorials needed. Open a page and start typing.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-white text-gray-900 font-semibold shadow hover:bg-gray-100">Create account</Link>
            <Link href="/login" className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-white/30 text-white hover:bg-white/10">I already have an account</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white">
        <div className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-400">&copy; {new Date().getFullYear()} {BRAND}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

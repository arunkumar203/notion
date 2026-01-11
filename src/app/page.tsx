'use client';

import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import {
  FiZap,
  FiCompass,
  FiBookOpen,
  FiShare2,
  FiCloudLightning,
  FiType,
  FiMoon,
  FiUploadCloud,
  FiLock,
} from 'react-icons/fi';
import { getAdminSettings } from '../lib/admin-settings';

/**
 * MemoWave — Merged landing page (Light theme)
 * Drop into Next.js `app/page.tsx` or any React app.
 */

const BRAND = 'MemoWave';

const FEATURE_CARDS = [
  { icon: FiZap, title: 'Hierarchical organization', description: 'Nest notebooks, sections, topics, and pages with intuitive drag-and-drop ordering.' },
  { icon: FiBookOpen, title: 'Modern editor', description: 'Write with TipTap-powered rich text, slash commands, and live word counts.' },
  { icon: FiShare2, title: 'Shareable pages', description: 'Generate view or edit links instantly and revoke access at any time.' },
  { icon: FiCloudLightning, title: 'Always in sync', description: 'Every keystroke saves automatically through Firebase Realtime Database.' },
  { icon: FiType, title: 'Keyboard-first workflows', description: 'Navigate and edit entirely from the keyboard with thoughtful shortcuts.' },
  { icon: FiLock, title: 'Secret Vault', description: 'Move private pages into an encrypted vault that only you can unlock.' },
  { icon: FiMoon, title: 'Focused UI', description: 'Stay in the zone with a clean interface and distraction-free reading mode.' },
];

const JOURNEY = [
  { step: 'Phase 01', title: 'Map your notebooks', info: 'Spin up notebooks, sections, topics, and starter pages to outline your workspace.' },
  { step: 'Phase 02', title: 'Capture and connect', info: 'Write in the editor, link related pages, and navigate with live breadcrumbs.' },
  { step: 'Phase 03', title: 'Share or secure', info: 'Send a share link to collaborators or move the page into the Secret Vault when it is ready.' },
];

export default function MemoWaveHome() {
  // Scroll progress + pointer tilt for hero card
  const [scrollProgress, setScrollProgress] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [showCreatorAttribution, setShowCreatorAttribution] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchSettings = async () => {
      try {
        const data = await getAdminSettings();
        if (isMounted) {
          if (typeof data.showCreatorAttribution === 'boolean') {
            setShowCreatorAttribution(data.showCreatorAttribution);
          }
          if (data.homePageMessage && data.homePageMessage.trim()) {
            setToastMessage(data.homePageMessage.trim());
            setShowToast(true);
            setTimeout(() => {
              setShowToast(false);
            }, 5000);
          }
        }
      } catch (error) {
        console.error('Error loading public admin settings:', error);
      }
    };

    fetchSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const maxScroll = document.body.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      setScrollProgress(Math.max(0, Math.min(1, progress)));
    };
    const handle = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', handle, { passive: true });
    window.addEventListener('resize', handle);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handle);
      window.removeEventListener('resize', handle);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const handle = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTilt({ x, y }));
    };
    window.addEventListener('pointermove', handle);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', handle);
    };
  }, []);

  const heroTiltStyle = useMemo<CSSProperties>(() => {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const x = clamp(tilt.x);
    const y = clamp(tilt.y);
    return {
      transform: `rotateX(${y * 10}deg) rotateY(${x * -12}deg) translateZ(0)`,
      transformStyle: 'preserve-3d',
      transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)'
    };
  }, [tilt]);

  // Constantly-moving orb that stays visible (fixed) and orbits with scroll
  const floatingOrbStyle = useMemo<CSSProperties>(() => {
    const angle = scrollProgress * Math.PI * 2;
    const radius = 160;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = Math.sin(angle * 1.2) * 40;
    return {
      transform: `translate3d(${x}px, ${y - 20}px, ${z}px) scale(${1 + scrollProgress * 0.25})`,
      opacity: 0.55 + scrollProgress * 0.35,
      transition: 'transform 0.45s ease-out, opacity 0.6s ease-out'
    };
  }, [scrollProgress]);

  const ribbonStyle = useMemo<CSSProperties>(() => {
    const translate = scrollProgress * 240 - 120;
    return {
      transform: `translate3d(${translate}px, ${-scrollProgress * 160}px, 0)`,
      transition: 'transform 0.6s ease'
    };
  }, [scrollProgress]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-white text-slate-900 selection:bg-indigo-200 selection:text-slate-900">
      {/* Toast Notification */}
      {showToast && toastMessage && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-6 py-4 max-w-md mx-auto animate-[slideDown_0.3s_ease-out]">
            <div className="flex items-center">
              <div className="flex-shrink-0 relative">
                <svg className="w-5 h-5 transform -rotate-90" viewBox="0 0 20 20">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    stroke="#e5e7eb"
                    strokeWidth="2"
                    fill="none"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="50.27"
                    strokeDashoffset="0"
                    className="animate-[countdown_5s_linear_forwards]"
                  />
                </svg>
              </div>
              <p className="ml-3 text-sm text-slate-700">{toastMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Local keyframes and helper classes */}
      <style>{`
        @keyframes floaty { 0%{ transform: translateY(0) } 50%{ transform: translateY(-10px) } 100%{ transform: translateY(0) } }
        @keyframes drift { 0%{ transform: translateX(0) } 50%{ transform: translateX(20px) } 100%{ transform: translateX(0) } }
        @keyframes slideDown { 0%{ transform: translateY(-20px); opacity: 0; } 100%{ transform: translateY(0); opacity: 1; } }
        @keyframes countdown { 0%{ stroke-dashoffset: 0; } 100%{ stroke-dashoffset: 50.27; } }
        .coinShadow { box-shadow: 0 8px 30px rgba(67,56,202,.15), 0 2px 10px rgba(99,102,241,.15); }
        .glass { backdrop-filter: blur(10px); background: rgba(255,255,255,.6); }
      `}</style>

      {/* Global background blobs (subtle for light) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-64 -left-32 h-[520px] w-[520px] rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute bottom-[-220px] right-[-120px] h-[420px] w-[420px] rounded-full bg-emerald-300/15 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(2,6,23,0.04),transparent_65%)]" />
      </div>

      {/* Moving orb that follows scroll — fixed */}
      <div
        aria-hidden
        className="pointer-events-none fixed left-1/2 top-[32%] z-50 h-24 w-24 -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-200 via-sky-300 to-purple-300 opacity-80 shadow-[0_0_60px_rgba(56,189,248,0.25)] mix-blend-multiply"
        style={floatingOrbStyle}
      />

      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 select-none">
            <span
              className="inline-flex h-6 w-6 rounded-lg"
              style={{ background: 'conic-gradient(from 220deg, #6366f1, #14b8a6, #a78bfa, #6366f1)' }}
            />
            <span className="text-xl font-semibold tracking-tight lg:text-2xl">
              <span className="bg-gradient-to-r from-indigo-600 via-sky-600 to-emerald-600 bg-clip-text text-transparent">{BRAND}</span>
            </span>
            <span className="rounded-full bg-slate-900/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Beta</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm">
            <a href="#features" className="hover:text-indigo-700">Features</a>
            <a href="#about" className="hover:text-indigo-700">About</a>
            <a href="#cta" className="hover:text-indigo-700">Get Started</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="/login"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              Log in
            </a>
            <a
              href="/signup"
              className="rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:shadow-xl"
            >
              Get started
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative pt-12 pb-24 sm:pt-16 lg:pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(920px_500px_at_50%_-20%,rgba(56,189,248,0.10),transparent)]" />
        {showCreatorAttribution && (
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mb-6 -mt-6 flex justify-end text-xs font-medium text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">
              App created by <span className="text-slate-700">R. Arun Kumar</span>
            </span>
          </div>
        )}
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 sm:px-6 lg:px-8 lg:grid-cols-[1.05fr_minmax(0,1fr)]">
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 backdrop-blur">
              <FiZap className="h-3.5 w-3.5 text-amber-500" />
              Structured workspace for serious notes
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Keep every notebook, section, and page in one reliable place.
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">
              {BRAND} gives you a focused editor, rich hierarchy, and realtime sync powered by Firebase so nothing falls out of date.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/signup"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(2,6,23,0.2)] transition hover:-translate-y-0.5"
              >
                Launch my workspace
              </a>
              <a
                href="#journey"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                Watch the scroll story
              </a>
            </div>
          </div>

          {/* Visual: glass card + coins/ribbons/cell sphere */}





          <div className="relative mx-auto w-full max-w-[540px] overflow-visible md:translate-x-6 lg:translate-x-10">








            <Ribbon className="-rotate-6" delay={0} />
            <Ribbon className="rotate-3" delay={2} />
            <div className="relative mt-10 h-[420px] w-full" style={{ perspective: '1600px' }}>
              <div
                className="absolute inset-0 rounded-[34px] border border-slate-200 bg-white shadow-[0_40px_120px_rgba(2,6,23,0.08)] backdrop-blur-xl"
                style={heroTiltStyle}
              >
                <div className="absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_60%)]" />
                <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[34px] p-8">
                  <div>
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.45em] text-slate-500">
                      <span>Notebook</span><span>Synced</span>
                    </div>
                    <h2 className="mt-6 text-2xl font-semibold text-slate-900">MemoWave Notebook</h2>
                    <p className="mt-2 text-sm text-slate-600">Organize notebooks, reorder sections, and edit pages with the same layout you use inside the app.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-inner backdrop-blur">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-slate-500">Notebook</p>
                      <p className="mt-2 font-medium text-slate-900">Roadmap Notes</p>
                      <p className="mt-1 text-xs text-slate-500">Last updated seconds ago.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-100 via-purple-100 to-sky-100 p-4 shadow-[0_24px_48px_rgba(56,189,248,0.18)] backdrop-blur">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-slate-600">Shared link</p>
                      <p className="mt-2 font-medium text-slate-900">share.mw/weekly-sync</p>
                      <p className="mt-1 text-xs text-slate-600">View or edit access in one click.</p>
                    </div>
                    <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-inner backdrop-blur">
                      <p className="text-[10px] uppercase tracking-[0.38em] text-slate-500">Secret Vault</p>
                      <p className="mt-2 font-medium text-slate-900">Protected research stored securely.</p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700/90">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Only you can open this vault
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floaty decorative elements in front */}
              <div className="absolute left-[8%] top-[18%] animate-[floaty_6s_ease-in-out_infinite]"><Coin size={96} gloss /></div>
              <div className="absolute left-[46%] top-[6%] animate-[floaty_7.5s_ease-in-out_infinite]"><Coin size={120} /></div>
              <div className="absolute right-[6%] bottom-[14%] animate-[floaty_5.5s_ease-in-out_infinite]"><Coin size={100} tilt /></div>
              <div className="absolute right-8 top-16 grid place-items-center"><CellSphere size={200} /></div>

              {/* Side cards with perspective */}
              <div
                className="pointer-events-none absolute -left-14 top-10 hidden h-40 w-44 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_24px_48px_rgba(14,116,144,0.12)] backdrop-blur-md lg:block"
                style={{ transform: 'rotate(-8deg) translate3d(-34px, 10px, 50px)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500">Topic</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">Sprint Notes</p>
                <p className="mt-1 text-xs text-slate-600">Pinned for quick access</p>
              </div>
              <div
                className="pointer-events-none absolute -right-16 bottom-10 hidden h-36 w-40 rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-100 via-sky-100 to-indigo-100 p-4 shadow-[0_24px_60px_rgba(34,211,238,0.18)] backdrop-blur-md lg:block"
                style={{ transform: 'rotate(10deg) translate3d(36px, -6px, 70px)' }}
              >
                <p className="text-[10px] uppercase tracking-[0.4em] text-slate-600">Task list</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">Review agenda</p>
                <p className="mt-1 text-xs text-slate-600">Checked items synced</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative border-t border-slate-200 bg-slate-50/70 py-20">
        <div className="absolute inset-0 bg-[radial-gradient(760px_360px_at_12%_0%,rgba(14,165,233,0.10),transparent)]" />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Key capabilities</p>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">Everything you need to capture and organize knowledge.</h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">MemoWave pairs a polished editor with realtime sync, sharing, and a private vault so your notes stay structured and secure.</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_CARDS.map((f) => (
              <FeatureTile key={f.title} title={f.title} desc={f.description} Icon={f.icon} />
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT (white stage with cube + coin) */}
      <section id="about" className="py-14 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h3 className="text-3xl font-bold tracking-tight">Designed to feel effortless</h3>
            <p className="mt-3 text-slate-600">{`From the first keystroke, MemoWave is tuned to be invisible. No heavy UI, just the right affordances—clean headings, graceful lists, and beautiful exports.`}</p>
            <ul className="mt-6 space-y-2 text-slate-700">
              <li>• Glassy surfaces with gentle depth and light.</li>
              <li>• Real-time multi-device sync with conflict-free editing.</li>
              <li>• Share read/edit links instantly.</li>
            </ul>
          </div>
          <div className="relative h-[420px]"><Stage /></div>
        </div>
      </section>

      {/* JOURNEY */}
      <section id="journey" className="relative border-t border-slate-200 bg-white py-20">
        <div className="absolute inset-0">
          <div
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-slate-200 via-slate-400 to-slate-200"
            style={ribbonStyle}
          />
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.4em] text-slate-500">Workflow overview</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">See how teams use MemoWave day to day.</h2>
            <p className="mt-3 text-base text-slate-600 sm:text-lg">From outlining notebooks to sharing pages or locking them down, MemoWave keeps everyone aligned.</p>
          </div>
          <div className="mt-12 space-y-10">
            {JOURNEY.map((item, idx) => (
              <div
                key={item.title}
                className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(30,64,175,0.10)] backdrop-blur"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-500">{item.step}</p>
                    <h3 className="mt-2 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{item.info}</p>
                  </div>
                  <div className="hidden h-28 w-28 flex-shrink-0 rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-100/70 via-sky-100/70 to-emerald-100/70 shadow-[0_16px_30px_rgba(56,189,248,0.18)] sm:flex sm:flex-col sm:items-center sm:justify-center">
                    <span className="text-xs uppercase tracking-[0.4em] text-slate-600">0{idx + 1}</span>
                    <span className="mt-2 text-sm font-semibold text-slate-800">Orbit</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="relative border-t border-slate-200 bg-gradient-to-br from-white via-slate-50 to-white py-20 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.20),transparent_65%)]" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700">
            <FiCompass className="h-4 w-4" />
            Ready to explore?
          </div>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">Bring cinematic clarity to your knowledge.</h2>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">Start in seconds, sync everywhere, and build a workspace that moves with you.</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(2,6,23,0.2)] transition hover:-translate-y-0.5"
            >
              Create free account
            </a>
            <a
              href="/login"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              I already have an account
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500 sm:text-sm">
          &copy; {new Date().getFullYear()} {BRAND}. Crafted with depth and light.
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------ Subcomponents ------------------------------ */

function Ribbon({ className = '', delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-x-[-10%] top-6 h-28 sm:h-32 rounded-[32px] blur-lg opacity-80 ${className}`}
      style={{
        animation: `drift 10s ease-in-out ${delay}s infinite`,
        background: 'linear-gradient(90deg, rgba(99,102,241,.25), rgba(168,85,247,.18), rgba(16,185,129,.25))',
        filter: 'saturate(110%)'
      }}
    />
  );
}

function Coin({ size = 100, gloss = false, tilt = false }: { size?: number; gloss?: boolean; tilt?: boolean }) {
  const base = {
    width: size,
    height: size,
    borderRadius: '9999px',
    background:
      'radial-gradient(circle at 35% 30%, rgba(255,255,255,.9), rgba(255,255,255,.5) 20%, rgba(255,255,255,0) 40%), conic-gradient(from 200deg, #c7d2fe, #a78bfa, #8b5cf6, #14b8a6, #c7d2fe)'
  } as React.CSSProperties;
  return (
    <div className="relative coinShadow" style={{ ...base, transform: tilt ? 'rotateX(16deg) rotateY(-18deg)' : undefined }}>
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 6px rgba(255,255,255,.8), inset 0 0 40px rgba(79,70,229,.2)' }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1/2 w-1/2 rounded-full" style={{ background: 'radial-gradient(circle at 30% 35%, rgba(255,255,255,.55), rgba(255,255,255,.2) 45%, rgba(0,0,0,0) 60%)' }} />
      {gloss && (<div className="absolute -left-4 -top-6 w-1/2 h-1/2 rounded-full" style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,.95), rgba(255,255,255,.35) 70%, transparent)', filter: 'blur(1px)' }} />)}
    </div>
  );
}

function CellSphere({ size = 220 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,.95), rgba(219,234,254,.6) 60%, rgba(255,255,255,0) 70%)',
          boxShadow: '0 20px 60px rgba(79,70,229,.12)'
        }}
      />
      <div
        className="absolute inset-[6%] rounded-full"
        style={{ background: 'radial-gradient(circle at 70% 30%, rgba(147,197,253,.6), rgba(99,102,241,.25) 50%, rgba(255,255,255,0))' }}
      />
      <svg className="absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <pattern id="dots" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="rgba(99,102,241,.7)" />
          </pattern>
        </defs>
        <circle cx="50" cy="50" r="42" fill="url(#dots)" opacity=".35" />
      </svg>
    </div>
  );
}

function FeatureTile({ title, desc, Icon }: { title: string; desc: string; Icon: React.ElementType }) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_rgba(2,6,23,0.06)] transition-transform duration-500 hover:-translate-y-2 hover:border-slate-300 hover:bg-white/95">
      <div className="absolute inset-0 translate-y-12 scale-125 rounded-3xl bg-gradient-to-br from-white/0 via-white/0 to-slate-100 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100" />
      <div className="relative">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-indigo-600 shadow-inner"><Icon className="h-5 w-5" /></span>
        <h3 className="mt-5 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{desc}</p>
      </div>
    </div>
  );
}

function Stage() {
  return (
    <div className="relative h-full rounded-3xl p-8 bg-white ring-1 ring-slate-200 overflow-hidden">
      <div className="absolute -left-20 top-16 w-[140%] h-24 rounded-[32px] blur-lg opacity-80" style={{ background: 'linear-gradient(90deg, rgba(79,70,229,.25), rgba(168,85,247,.2), rgba(16,185,129,.25))' }} />
      <div className="absolute -left-28 top-44 w-[150%] h-24 rounded-[32px] blur-lg opacity-70 rotate-3" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,.22), rgba(16,185,129,.18), rgba(59,130,246,.2))' }} />
      <div className="relative z-10 grid grid-cols-[1fr_auto] gap-8 items-end h-full">
        <div className="self-center">
          <h4 className="text-2xl font-semibold">About Us</h4>
          <p className="mt-2 text-slate-600 max-w-md">MemoWave is built in public with a love for speed, minimalism, and detail. We craft tools that feel like air.</p>
        </div>
        <div className="relative mr-6 mb-2">
          <div className="w-40 h-28 bg-fuchsia-500 rounded-md" style={{ boxShadow: '0 30px 60px rgba(168,85,247,.25)' }} />
          <div className="absolute -top-10 -left-10"><Coin size={84} gloss /></div>
        </div>
      </div>
    </div>
  );
}

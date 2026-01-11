"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { rtdb } from '@/lib/firebase';
import { ref as dbRef, onValue, update, get, push, remove, set } from 'firebase/database';
import Editor from '@/components/Editor';
import Loader from '@/components/Loader';
import { useRouter } from 'next/navigation';
import { FiArrowLeft, FiLock, FiPlus, FiTrash2, FiEdit3 } from 'react-icons/fi';

type SecretPageItem = { id: string; name: string; order?: number; createdAt: number; lastUpdated: number };

function sha256(s: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(s);
  return crypto.subtle.digest('SHA-256', data).then((buf) => {
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  });
}

export default function SecretVaultPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  // undefined = loading; null = no password set; string = password hash present
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [verified, setVerified] = useState(false);
  // Prevent flicker to "Enter password" immediately after creation
  const [creatingNow, setCreatingNow] = useState(false);

  // Pages state
  const [pages, setPages] = useState<SecretPageItem[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [contentReady, setContentReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(false);
  // Inline create state like normal pages
  const [isCreating, setIsCreating] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const createBoxRef = useRef<HTMLDivElement | null>(null);
  const createLiRef = useRef<HTMLLIElement | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const editorRef = useRef<any>(null);
  // Guard to avoid autosave firing while initializing content
  const hydratingRef = useRef(false);

  // redirect unauthenticated to home (middleware also protects)
  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [authLoading, user, router]);

  // Subscribe to secret hash and pages list
  useEffect(() => {
    if (!user) return;
    const base = `users/${user.uid}/secret`;
    const unsub = onValue(dbRef(rtdb, base), (snap) => {
      const v = (snap.exists() ? snap.val() : {}) as any;
      setHash(typeof v?.password === 'string' ? v.password : null);
      const p = (v?.pages || {}) as Record<string, any>;
      const list: SecretPageItem[] = Object.entries(p).map(([id, meta]) => ({
        id,
        name: meta?.name || 'Untitled',
        order: meta?.order,
        createdAt: meta?.createdAt || 0,
        lastUpdated: meta?.lastUpdated || meta?.updatedAt || 0,
      }));
      // order by custom order then createdAt
      list.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
      setPages(list);
      // If a page is selected but not found (e.g., race on move or creation), reselect first available
      if (selectedPage && !list.find((x) => x.id === selectedPage)) {
        setSelectedPage(list.length ? list[0].id : null);
      }
    });
    return () => { try { unsub(); } catch { } };
  }, [user]);

  const needsSetup = useMemo(() => hash === null, [hash]);
  const isDuplicate = useMemo(() => {
    const n = newItemName.trim().toLowerCase();
    return !!n && pages.some((p) => (p.name || '').trim().toLowerCase() === n);
  }, [newItemName, pages]);

  useEffect(() => {
    if (!isCreating) return;
    const onDown = (e: MouseEvent) => {
      if (createBoxRef.current && !createBoxRef.current.contains(e.target as Node)) {
        setIsCreating(false);
        setNewItemName('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isCreating]);

  const verifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!pw) { setError('Enter password'); return; }
    setVerifying(true);
    setError(null);
    try {
      const digest = await sha256(pw);
      if (hash && digest === hash) {
        setVerified(true);
      } else {
        setError('Incorrect password');
      }
    } catch {
      setError('Failed to verify');
    } finally {
      setVerifying(false);
    }
  };

  const setPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!pw || pw.length < 4) { setError('Password should be at least 4 characters'); return; }
    if (pw !== pw2) { setError('Passwords do not match'); return; }
    setVerifying(true);
    setCreatingNow(true);
    setError(null);
    try {
      const digest = await sha256(pw);
      await update(dbRef(rtdb), { [`users/${user.uid}/secret/password`]: digest, [`users/${user.uid}/secret/pages`]: {} });
      setVerified(true);
    } catch {
      setError('Failed to set password');
    } finally { setVerifying(false); setCreatingNow(false); }
  };

  // content load on page select
  useEffect(() => {
    const load = async () => {
      setContentReady(false);
      hydratingRef.current = true;
      if (!selectedPage) { setContent(''); lastSavedRef.current = ''; setContentReady(true); return; }
      try {
        const res = await fetch(`/api/secret-pages/${selectedPage}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        setContent((data?.content as string) || '');
        lastSavedRef.current = (data?.content as string) || '';
      } catch { setContent(''); lastSavedRef.current = ''; }
      setContentReady(true);
      // Release hydration guard on next tick so editor can mount before we accept changes
      setTimeout(() => { hydratingRef.current = false; }, 0);
    };
    load();
  }, [selectedPage]);

  const handleContentChange = (val: string) => {
    // Ignore editor updates during hydration (mount/initial setContent)
    if (hydratingRef.current) return;
    setContent((prev) => (prev === val ? prev : val));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const pid = selectedPage; if (!pid) return;
      // Do not overwrite existing content with blank due to any spurious onUpdate
      if ((val || '').trim() === '' && (lastSavedRef.current || '').trim() !== '') return;
      if (val === lastSavedRef.current) return;
      setIsSaving(true);
      const now = Date.now();
      try {
        await fetch(`/api/secret-pages/${pid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: val }),
        });
        if (user) await update(dbRef(rtdb), { [`users/${user.uid}/secret/pages/${pid}/lastUpdated`]: now, [`users/${user.uid}/secret/pages/${pid}/updatedAt`]: now });
        lastSavedRef.current = val;
      } catch { }
      finally { setIsSaving(false); }
    }, 600);
  };

  const createPage = async (name: string) => {
    if (!user) return;
    const now = Date.now();
    const pagesSnap = await get(dbRef(rtdb, `users/${user.uid}/secret/pages`));
    const data = (pagesSnap.val() || {}) as Record<string, { order?: number; name?: string }>;
    const maxOrder = Object.values(data).reduce((acc, p) => Math.max(acc, p.order ?? -1), -1);
    const nextOrder = maxOrder + 1;
    const newRef = push(dbRef(rtdb, `users/${user.uid}/secret/pages`));
    const id = newRef.key!;
    await set(newRef, { name, createdAt: now, updatedAt: now, lastUpdated: now, order: nextOrder });
    await fetch(`/api/secret-pages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ content: '', name }),
    });
    setSelectedPage(id);
  };

  const renamePage = async (id: string, name: string) => {
    if (!user) return;
    const now = Date.now();
    await update(dbRef(rtdb), { [`users/${user.uid}/secret/pages/${id}/name`]: name, [`users/${user.uid}/secret/pages/${id}/updatedAt`]: now });
    await fetch(`/api/secret-pages/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name }),
    });
  };

  const deletePage = async (id: string) => {
    if (!user) return;
    if (!confirm('Delete this page?')) return;
    try {
      await remove(dbRef(rtdb, `users/${user.uid}/secret/pages/${id}`));
      await fetch(`/api/secret-pages/${id}`, { method: 'DELETE', credentials: 'include' });
      if (selectedPage === id) setSelectedPage(null);
    } catch { }
  };

  // Deleting loader state for secret list
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const handleDelete = async (id: string) => {
    setDeletingIds((p) => new Set(p).add(id));
    try { await deletePage(id); } finally {
      setDeletingIds((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="xl" text="Loading..." />
      </div>
    );
  }

  // Always ask password on every visit, even if hash exists
  if (!verified) {
    // Await initial secret state to avoid flicker between "Set password" and "Enter password"
    if (hash === undefined) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader size="lg" text="Preparing your vault…" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
            <Link href="/notebooks" className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900"><FiArrowLeft className="mr-2" />Back</Link>
            <div className="text-sm text-gray-600 inline-flex items-center gap-2"><FiLock /> Secret notes</div>
          </div>
        </header>
        <div className="max-w-md mx-auto pt-12 px-4">
          <div className="bg-white border rounded-lg p-5 shadow-sm">
            {(needsSetup || creatingNow) ? (
              <>
                <div className="text-lg font-semibold text-gray-900 mb-1">Set password</div>
                <div className="text-sm text-gray-600 mb-4">Create a password to protect your secret pages. You will be asked every time you open this vault.</div>
                <form onSubmit={setPassword} className="space-y-3" autoComplete="off" data-lpignore="true" data-1p-ignore="true">
                  {/* Inert fields to discourage aggressive password managers */}
                  <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
                  <input type="password" name="password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" />
                  <input type="password" name="secret_create" className="w-full border rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-500 bg-white" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" readOnly onFocus={(e) => { e.currentTarget.readOnly = false; }} onMouseDown={(e) => { const t = e.currentTarget; if (t.readOnly) { e.preventDefault(); t.readOnly = false; setTimeout(() => t.focus(), 0); } }} />
                  <input type="password" name="secret_confirm" className="w-full border rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-500 bg-white" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" readOnly onFocus={(e) => { e.currentTarget.readOnly = false; }} onMouseDown={(e) => { const t = e.currentTarget; if (t.readOnly) { e.preventDefault(); t.readOnly = false; setTimeout(() => t.focus(), 0); } }} />
                  {error && <div className="text-xs text-red-600">{error}</div>}
                  <button type="submit" disabled={verifying} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{verifying ? 'Saving…' : 'Save password'}</button>
                </form>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-gray-900 mb-1">Enter password</div>
                <div className="text-sm text-gray-600 mb-4">This vault is protected. Enter your password to continue.</div>
                <form onSubmit={verifyPassword} className="space-y-3" autoComplete="off" data-lpignore="true" data-1p-ignore="true">
                  {/* Inert fields to discourage aggressive password managers */}
                  <input type="text" name="username" autoComplete="username" className="hidden" tabIndex={-1} aria-hidden="true" />
                  <input type="password" name="password" autoComplete="new-password" className="hidden" tabIndex={-1} aria-hidden="true" />
                  <input type="password" name="secret_enter" className="w-full border rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-500 bg-white" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} data-lpignore="true" data-1p-ignore="true" data-form-type="other" readOnly onFocus={(e) => { e.currentTarget.readOnly = false; }} onMouseDown={(e) => { const t = e.currentTarget; if (t.readOnly) { e.preventDefault(); t.readOnly = false; setTimeout(() => t.focus(), 0); } }} />
                  {error && <div className="text-xs text-red-600">{error}</div>}
                  <button type="submit" disabled={verifying} className="w-full inline-flex justify-center items-center gap-2 px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">{verifying ? 'Verifying…' : 'Unlock'}</button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Authenticated + verified vault UI: pages bar + editor
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      <header className="bg-white shadow-sm z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Link href="/notebooks" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-700"><FiArrowLeft />Back</Link>
            <h1 className="text-xl font-semibold text-gray-900 inline-flex items-center gap-2"><FiLock /> Secret notes</h1>
          </div>
          <div />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-white border-r border-gray-200 flex-shrink-0 overflow-hidden">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <div className="font-medium text-gray-800">Pages</div>
            <button className="text-gray-500 hover:text-gray-700" onClick={() => { setIsCreating(true); setNewItemName(''); }} title="Add page"><FiPlus /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {pages.length === 0 && !isCreating && (
              <div className="p-4 text-sm text-center text-gray-500">No pages yet.</div>
            )}
            {/* Inline create box when empty list */}
            {isCreating && pages.length === 0 && (
              <div ref={createBoxRef} className="p-2 border-t border-gray-100">
                <input
                  type="text"
                  autoFocus
                  className={`w-full p-1 text-sm border rounded ${isDuplicate ? 'border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500'}`}
                  placeholder="Enter page name"
                  spellCheck={false}
                  autoComplete="off"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const name = newItemName.trim();
                      if (!name || isDuplicate) { e.preventDefault(); return; }
                      setIsCreating(false);
                      setNewItemName('');
                      await createPage(name);
                    }
                    if (e.key === 'Escape') { setIsCreating(false); setNewItemName(''); }
                  }}
                />
                {isDuplicate && (
                  <div className="mt-1 text-xs text-red-600">A page with this name already exists</div>
                )}
              </div>
            )}
            {/* List */}
            {pages.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {pages.map((p) => (
                  <li key={p.id} className={`group p-3 cursor-pointer ${selectedPage === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`} onClick={() => setSelectedPage(p.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-gray-800" title={p.name}>
                        <span className="truncate inline-block max-w-[170px]">{p.name}</span>
                      </div>
                      {deletingIds.has(p.id) ? (
                        <div className="flex items-center"><span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
                      ) : (
                        <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                          <button className="p-1 rounded hover:bg-gray-200" title="Rename" onClick={(e) => { e.stopPropagation(); const name = prompt('Rename page', p.name); if (name && name.trim()) renamePage(p.id, name.trim()); }}><FiEdit3 size={14} /></button>
                          <button className="p-1 rounded hover:bg-gray-200 text-red-600" title="Delete" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}><FiTrash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
                {/* Inline create box when list exists */}
                {isCreating && (
                  <li className="p-2 border-t border-gray-100" ref={createLiRef}>
                    <input
                      type="text"
                      autoFocus
                      className={`w-full p-1 text-sm border rounded ${isDuplicate ? 'border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500' : 'border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-500'}`}
                      placeholder="Enter page name"
                      spellCheck={false}
                      autoComplete="off"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const name = newItemName.trim();
                          if (!name || isDuplicate) { e.preventDefault(); return; }
                          setIsCreating(false);
                          setNewItemName('');
                          await createPage(name);
                        }
                        if (e.key === 'Escape') { setIsCreating(false); setNewItemName(''); }
                      }}
                    />
                    {isDuplicate && (
                      <div className="mt-1 text-xs text-red-600">A page with this name already exists</div>
                    )}
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 md:p-8">
            {selectedPage ? (
              <div className="max-w-4xl mx-auto">
                {/* Status and controls above editor */}
                <div className="mb-3 flex justify-end items-center gap-4">
                  <div className="text-sm text-gray-500">{isSaving ? 'Saving changes…' : 'Synced'}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600 select-none">Spell check</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={spellcheckEnabled}
                      onClick={() => setSpellcheckEnabled((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${spellcheckEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                      title="Toggle browser spellcheck for the editor"
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${spellcheckEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                </div>
                <div className="relative min-h-[300px] bg-white shadow-sm border border-gray-200 rounded-lg">
                  {contentReady ? (
                    <Editor
                      ref={editorRef as any}
                      content={content}
                      resetKey={selectedPage}
                      onUpdate={(val: string) => handleContentChange(val)}
                      onEditorReady={(ed: any) => { (editorRef as any).current = ed; }}
                      spellcheck={spellcheckEnabled}
                      lang="en-US"
                      className="h-full min-h-[300px] focus:outline-none text-gray-900"
                      config={{ editorProps: { attributes: { class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-8 pt-10 pl-16 pr-16 h-full' } }, autofocus: false, immediatelyRender: false, enableInputRules: false, enablePasteRules: false, editable: true }}
                      onRequestAI={() => {/* uses same AI pipeline */ }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader size="lg" text="Loading your secret note..." />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-[300px] max-w-2xl mx-auto w-full mt-12">
                <div className="rounded-lg p-6 text-center bg-white border border-gray-200">
                  <div className="text-base text-gray-700">Select a page on the left or create a new one.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

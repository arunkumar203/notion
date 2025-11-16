"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Editor from '@/components/Editor';
import Loader from '@/components/Loader';
import Link from 'next/link';
import { FiCopy, FiCheck, FiArrowLeft } from 'react-icons/fi';

type ShareData = {
  shareId: string;
  ownerUid: string;
  canEdit: boolean;
  createdAt: number;
  page: { id: string; name: string; content: string; updatedAt: number };
};

export default function PublicSharePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const editorRef = useRef<any>(null);
  // Local content state mirrors the editor and last-saved tracking to avoid PATCH thrash
  const [content, setContent] = useState<string>('');
  const lastSavedRef = useRef<string>('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [characterCount, setCharacterCount] = useState(0);
  const [wordCount, setWordCount] = useState(0);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/share/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load share');
      const json = await res.json();
  setData(json);
  // Seed local content and last-saved snapshot to prevent initial save flicker
  const initial = (json?.page?.content as string) || '';
  setContent(initial);
  lastSavedRef.current = initial;
  // Initialize counts
  setCharacterCount(initial.length);
  const words = initial.trim() === '' ? 0 : initial.trim().split(/\s+/).length;
  setWordCount(words);
    } catch (e: any) {
      setError(e?.message || 'Failed to load share');
    }
  };

  useEffect(() => { load(); }, [id]);

  const title = data?.page?.name || 'Shared Page';
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/share/${id}` : '';

  const editorConfig = useMemo(() => ({
    editorProps: { attributes: { class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none p-8 pt-10 pl-16 pr-16 h-full' } },
    autofocus: false,
    immediatelyRender: false,
    enableInputRules: false,
    enablePasteRules: false,
    editable: !!data?.canEdit,
  }), [data?.canEdit]);

  // Debounced save similar to the main editor
  const onUpdate = useCallback((newContent: string) => {
    if (!data?.canEdit) return; // guard when view-only
    // Update local state only if changed to avoid loops
    setContent((prev) => (prev === newContent ? prev : newContent));
    
    // Update character and word counts
    setCharacterCount(newContent.length);
    const words = newContent.trim() === '' ? 0 : newContent.trim().split(/\s+/).length;
    setWordCount(words);
    
    // Debounce saves
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      // Only save if content actually differs from last saved snapshot
      if (lastSavedRef.current === newContent) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/share/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newContent }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
        lastSavedRef.current = newContent;
      } catch {
        // Silent for now; public page keeps editing lightweight
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [data?.canEdit, id]);

  // Clear pending timers on unmount
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-800">
        <div className="p-6 bg-white border rounded shadow-sm max-w-lg w-full text-center">
          <div className="text-lg font-semibold mb-2">Link unavailable</div>
          <div className="text-sm text-gray-600 mb-4">{error}</div>
          <Link href="/" className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"><FiArrowLeft /> Go home</Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader size="xl" text="Loading shared page..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white shadow-sm z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                } catch {}
              }}
              title="Copy link"
              className={`p-1 rounded border text-gray-600 hover:bg-gray-50 ${copied ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200'}`}
            >
              {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-gray-600">{data.canEdit ? 'Shared — can edit' : 'Shared — view only'}</span>
          <div className="flex items-center gap-4">
            <span className="text-gray-500">{characterCount} chars • {wordCount} words</span>
            <span className="text-gray-500">{data.canEdit ? (saving ? 'Saving changes…' : 'Synced') : 'Synced'}</span>
          </div>
        </div>
        <div className="min-h-[400px] bg-white border rounded-md">
          <Editor
            ref={editorRef as any}
            content={content}
            resetKey={data.page.id}
            onUpdate={onUpdate}
            onEditorReady={() => {}}
            spellcheck={false}
            lang="en-US"
            className="h-full min-h-[400px] focus:outline-none text-gray-900"
            config={editorConfig as any}
          />
        </div>
      </main>
    </div>
  );
}

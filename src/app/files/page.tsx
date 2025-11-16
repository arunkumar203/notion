"use client";

import React, { useEffect, useState } from 'react';
import Uploader from '@/components/Files/Uploader';

type FileItem = {
  $id: string;
  name: string;
  mimeType?: string;
  sizeOriginal?: number;
};

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/files/list', { cache: 'no-store' });
      const data = await res.json();
      setFiles(data.files || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  // Auto-refresh when uploads complete (global overlay dispatches this event)
  useEffect(() => {
    const onUploaded = () => refresh();
    window.addEventListener('files:uploaded', onUploaded as any);
    return () => window.removeEventListener('files:uploaded', onUploaded as any);
  }, []);

  const onDelete = async (id: string) => {
    const ok = confirm('Delete this file?');
    if (!ok) return;
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (res.ok) refresh();
  };

  const fileUrl = (f: FileItem) => `/api/files/view/${encodeURIComponent(f.$id)}?name=${encodeURIComponent(f.name)}`;
  const _downloadUrl = (f: FileItem) => `/api/files/download/${encodeURIComponent(f.$id)}?name=${encodeURIComponent(f.name)}`;
  const previewUrl = (f: FileItem) => `/api/files/preview/${encodeURIComponent(f.$id)}?width=320&height=180&gravity=center`;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Files</h1>
        <p className="text-sm text-gray-600">Upload, preview, and delete files stored in Appwrite.</p>
      </div>

      <Uploader onDone={refresh} />

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">{loading ? 'Loading…' : `${files.length} files`}</div>
        <button onClick={refresh} className="px-3 py-1.5 rounded bg-black text-white text-sm">Refresh</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map((f) => (
          <div key={f.$id} className="group relative border rounded p-3 space-y-2">
            {f.mimeType?.startsWith('image/') ? (
              <a href={fileUrl(f)} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl(f)} alt={f.name} className="w-full h-40 object-cover rounded" />
              </a>
            ) : null}
            <div className="flex items-center justify-between gap-2">
              <a href={fileUrl(f)} target="_blank" rel="noreferrer" className="font-medium truncate text-blue-700 hover:underline" title={f.name}>{f.name}</a>
              <span className="text-xs text-gray-600 shrink-0">{(f.sizeOriginal || 0) > 0 ? `${((f.sizeOriginal || 0)/1024/1024).toFixed(2)} MB` : ''} {f.mimeType ? `• ${f.mimeType}` : ''}</span>
            </div>
            {/* 3-dots menu */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <details className="relative">
                <summary className="list-none cursor-pointer w-8 h-8 rounded-full flex items-center justify-center bg-white border shadow-sm">
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <span className="block w-1 h-1 bg-gray-600 rounded-full" />
                    <span className="block w-1 h-1 bg-gray-600 rounded-full" />
                    <span className="block w-1 h-1 bg-gray-600 rounded-full" />
                  </div>
                </summary>
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onClick={async () => {
                      const name = prompt('New name', f.name);
                      if (!name || name.trim() === f.name) return;
                      // Metadata disabled: skip server rename, just refresh list (or client-rename if list includes it)
                      refresh();
                    }}
                  >Rename</button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(f.$id)}
                  >Delete</button>
                </div>
              </details>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

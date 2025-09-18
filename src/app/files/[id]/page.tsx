"use client";

import React from 'react';
import Link from 'next/link';

export default function FileDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = React.useState<string>('');
  React.useEffect(() => { (async () => { try { const p = await params; setId(p.id); } catch {} })(); }, [params]);
  if (!id) return <div className="p-6">Loading…</div>;
  const viewUrl = `/api/files/view/${encodeURIComponent(id)}`;
  const downloadUrl = `/api/files/download/${encodeURIComponent(id)}`;
  const onDelete = async () => {
    const ok = confirm('Delete this file?');
    if (!ok) return;
    const res = await fetch(`/api/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) window.location.href = '/files';
  };
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold truncate">File</h1>
        <Link className="text-sm text-blue-600 underline" href="/files">Back to files</Link>
      </div>
      <iframe src={viewUrl} className="w-full h-[60vh] rounded border" />
      <div className="flex items-center gap-2">
        <a className="px-3 py-1.5 text-sm rounded border" href={viewUrl} target="_blank" rel="noreferrer">Open</a>
        <a className="px-3 py-1.5 text-sm rounded border" href={downloadUrl}>Download</a>
        <button className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-700" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

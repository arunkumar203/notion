"use client";

import { useEffect, useState } from 'react';
import { appwriteClient } from '@/lib/appwrite';

export default function AppwriteVerifyPage() {
  const [status, setStatus] = useState<'idle'|'ok'|'error'>('idle');
  const [msg, setMsg] = useState<string>('');

  const sendPing = async () => {
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT as string;
    const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string;
    try {
      // Use a direct fetch with project header so Appwrite can detect the platform
      const res = await fetch(`${endpoint}/health/version`, {
        cache: 'no-store',
        headers: { 'X-Appwrite-Project': project },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ver = await res.text().catch(() => 'unknown');
      // Touch the SDK so the console also sees an SDK-initialized page
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      appwriteClient;
      setStatus('ok');
      setMsg(`Connected. Appwrite version: ${ver}`);
    } catch (e: any) {
      setStatus('error');
      setMsg(e?.message || 'Failed');
    }
  };

  useEffect(() => { sendPing(); }, []);

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-2">Appwrite connection check</h1>
  <p className="text-sm text-gray-600 mb-4">Open this page while the Appwrite console shows &quot;Waiting for connection…&quot;. If it doesn’t auto-complete, click the button.</p>
      <div className="flex items-center gap-3">
        <button onClick={sendPing} className="px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-60" disabled={status === 'ok'}>
          Send ping
        </button>
        {status === 'idle' && <div className="text-gray-700">Pinging…</div>}
        {status === 'ok' && <div className="text-green-700">{msg}</div>}
        {status === 'error' && <div className="text-red-700">{msg}</div>}
      </div>
    </div>
  );
}

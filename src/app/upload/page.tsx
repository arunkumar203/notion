"use client";

import { useState, useMemo } from "react";
import { appwriteClient } from "@/lib/appwrite";
import { appwriteStorage, AppwriteID } from "@/lib/appwrite";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const bucketId = useMemo(
    () => process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID || "",
    []
  );

  async function handleUpload() {
    if (!file) {
      setMessage("Please select a file first.");
      return;
    }
    if (!bucketId) {
      setMessage("Bucket ID missing. Set NEXT_PUBLIC_APPWRITE_BUCKET_ID.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setMessage(null);

    try {
      const fd = new FormData();
      fd.set('file', file, file.name);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        let msg = 'Upload failed';
        try { const j = await res.json(); msg = j?.error || msg; } catch {}
        throw new Error(msg);
      }
      setMessage('Uploaded successfully');
      setProgress(100);
    } catch (err: any) {
      console.error("Upload failed:", err);
      setMessage(`Upload failed: ${err?.message || String(err)}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold mb-4">Upload to Appwrite</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-4"
      />

      <button
        onClick={handleUpload}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-60"
        disabled={!file || uploading}
      >
        {uploading ? "Uploading..." : "Upload"}
      </button>

      {progress > 0 && <p className="mt-2">Progress: {progress}%</p>}
      {message && <p className="mt-4">{message}</p>}
    </div>
  );
}

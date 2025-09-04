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
      // 1. Get JWT from server
      const res = await fetch("/api/files/token", { method: "POST" });
      const { jwt } = await res.json();
      if (!jwt) throw new Error("Failed to fetch upload token");

      // 2. Set JWT
      appwriteClient.setJWT(jwt);

      // 3. Upload via Appwrite SDK for progress events
      await appwriteStorage.createFile(
        bucketId,
        AppwriteID.unique(),
        file,
        undefined,
        (p: any) => {
          const pctRaw =
            typeof p?.progress === 'number'
              ? p.progress
              : p?.loaded && p?.total
              ? (p.loaded / p.total) * 100
              : 0;
          setProgress(Math.max(1, Math.min(99, Math.round(pctRaw))));
        }
      );

      setMessage(`Uploaded successfully`);
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

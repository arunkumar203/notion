"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export default function Uploader({ onDone }: { onDone?: () => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  // Removed: app-wide overlay now handled in GlobalDragOverlay
  // Track in-flight fake progress animations (requestAnimationFrame IDs)
  const rafs = useRef<Record<string, number>>({});
  const fakeDurations = useRef<Record<string, number>>({}); // ms per upload id
  const activeFlags = useRef<Record<string, boolean>>({});

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const next: UploadItem[] = arr.map((f, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      file: f,
      progress: 0,
      status: "queued",
    }));
    setItems((prev) => [...prev, ...next]);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Do not stop propagation so any parent listeners (if any) can still see the event
    const dt = e.dataTransfer;
    if (!dt) return;
    // Prefer FileList; fall back to DataTransferItemList to support some desktop environments
    if (dt.files && dt.files.length > 0) {
      addFiles(dt.files);
      return;
    }
    const items = dt.items ? Array.from(dt.items) : [];
    const files: File[] = [];
    for (const it of items) {
      try {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      } catch {}
    }
    if (files.length > 0) addFiles(files);
  }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      try {
        (e as any).dataTransfer.dropEffect = "copy";
      } catch {}
    };
    el.addEventListener("dragover", onDragOver as any);
    return () => el.removeEventListener("dragover", onDragOver as any);
  }, []);

  // Removed global capture listeners; handled by GlobalDragOverlay

  const startFakeProgress = (id: string, fileSizeBytes: number) => {
    // Duration scales with size: ~0.8s per MB, clamped 8s..45s
    const sizeMB = Math.max(1, fileSizeBytes / (1024 * 1024));
    const duration = Math.min(45000, Math.max(8000, Math.round(sizeMB * 800)));
    fakeDurations.current[id] = duration;
    activeFlags.current[id] = true;

    let startTime: number | null = null;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      // 1% -> 99% range while uploading
      const target = 1 + eased * 98;

      setItems((prev) =>
        prev.map((p) => {
          if (p.id !== id || p.status !== "uploading") return p;
          // Never go backwards; also cap at 99 while uploading
          const next = Math.min(99, Math.max(p.progress, target));
          return { ...p, progress: next };
        })
      );

      // Continue animating while flagged active and time remaining
      if (activeFlags.current[id] && target < 99) {
        rafs.current[id] = requestAnimationFrame(tick);
      }
    };

    // kick off
    rafs.current[id] = requestAnimationFrame(tick);
  };

  const stopFakeProgress = (id: string) => {
    const raf = rafs.current[id];
    if (raf) cancelAnimationFrame(raf);
    delete rafs.current[id];
    delete fakeDurations.current[id];
    delete activeFlags.current[id];
  };

  const uploadOne = async (it: UploadItem) => {
    setItems((prev) =>
      prev.map((p) =>
        p.id === it.id ? { ...p, status: "uploading", progress: 1 } : p
      )
    );
    startFakeProgress(it.id, it.file.size);
    try {
      const fd = new FormData();
      fd.set("file", it.file, it.file.name);
      const res = await fetch("/api/files/upload", { method: "POST", body: fd });
      if (!res.ok) {
        let msg = "Upload failed";
        try { const j = await res.json(); msg = j?.error || msg; } catch {}
        throw new Error(msg);
      }
      stopFakeProgress(it.id);
      setItems((prev) =>
        prev.map((p) =>
          p.id === it.id ? { ...p, progress: 100, status: "done" } : p
        )
      );
    } catch (e: any) {
      stopFakeProgress(it.id);
      const msg = e?.message || "Upload failed";
      setItems((prev) =>
        prev.map((p) =>
          p.id === it.id ? { ...p, status: "error", error: msg } : p
        )
      );
    }
  };

  useEffect(() => {
    const queued = items.find((i) => i.status === "queued");
    if (queued) {
      uploadOne(queued).then(() => {
        if (onDone) onDone();
      });
    }
  }, [items]);

  // Cleanup only on unmount
  useEffect(() => {
    return () => {
      Object.values(rafs.current).forEach((rafId) => cancelAnimationFrame(rafId));
      rafs.current = {};
      fakeDurations.current = {};
      Object.keys(activeFlags.current).forEach((k) => delete activeFlags.current[k]);
    };
  }, []);

  return (
    <div className="space-y-3">
  {/* App-wide overlay is mounted in layout via GlobalDragOverlay */}
      <div
        ref={dropRef}
        className="border border-dashed border-gray-400 rounded p-6 text-center"
  onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          try { (e as any).dataTransfer.dropEffect = 'copy'; } catch {}
        }}
      >
        <div className="mb-2">Drag & drop files here (max 25 MB each)</div>
        <button
          className="px-3 py-1.5 rounded bg-black text-white text-sm"
          onClick={() => inputRef.current?.click()}
        >
          Select files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 text-sm">
              <div className="flex-1 truncate">
                {it.file.name}{" "}
                <span className="text-gray-500">
                  ({(it.file.size / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
              <div className="w-40 h-2 bg-gray-200 rounded overflow-hidden">
                <div
                  className={`h-full ${
                    it.status === "error" ? "bg-red-500" : "bg-green-600"
                  } transition-all duration-300 ease-out`}
                  style={{ width: `${it.progress}%` }}
                />
              </div>
              <div className="w-20 text-right">
                {it.status === "uploading"
                  ? `${it.progress.toFixed(0)}%`
                  : it.status === "done"
                  ? "Done"
                  : it.status === "error"
                  ? "Error"
                  : "Queued"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

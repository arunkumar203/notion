"use client";

import React, { useEffect, useRef, useState } from "react";
// No client SDK upload here; use server endpoint to avoid JWT and service user deps

export default function GlobalDragOverlay() {
  const [active, setActive] = useState(false);
  const dragCounter = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      let okCount = 0;
      const createdFiles: Array<{ id: string; name: string; mimeType?: string }> = [];
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f, f.name);
        const res = await fetch("/api/files/upload", { method: "POST", body: fd });
        if (!res.ok) {
          let msg = `Upload failed for ${f.name}`;
          try { const j = await res.json(); msg = j?.error || msg; } catch {}
          console.error(msg);
        } else {
          okCount += 1;
          try {
            const j = await res.json();
            const file = j?.file;
            if (file) {
              createdFiles.push({ id: file.$id || file.id, name: file.name, mimeType: file.mimeType });
            }
          } catch {}
        }
      }
      // Notify any listeners (e.g., Files page) that new files were uploaded
      try { window.dispatchEvent(new CustomEvent('files:uploaded', { detail: { count: okCount } })); } catch {}
      // If an editor is active, ask it to insert the uploaded files at the caret
      if (createdFiles.length > 0) {
        try { window.dispatchEvent(new CustomEvent('editor:insert-files', { detail: { files: createdFiles } })); } catch {}
      }
    } catch (e: any) {
      setError(e?.message || "Upload failed");
    }
  };

  useEffect(() => {
    const isInEditor = (e: DragEvent) => {
      try {
        const t = (e.target as Element | null);
        if (t && typeof (t as any).closest === 'function') {
          return !!(t as Element).closest('[data-editor-root="true"]');
        }
      } catch {}
      return false;
    };
    const hasFiles = (e: DragEvent) => {
      try {
        const dt = e.dataTransfer as DataTransfer | null;
        if (!dt) return false;
        if (dt.items && dt.items.length > 0) {
          return Array.from(dt.items).some((it) => it.kind === "file");
        }
        const types = Array.from(dt.types || []);
        if (types.length === 0) return true; // OS drag sometimes empty on enter
        return types.includes("Files");
      } catch {
        return true;
      }
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current += 1;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (isInEditor(e)) return; // let editor handle
      e.preventDefault();
      try { (e.dataTransfer as DataTransfer).dropEffect = "copy"; } catch {}
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (isInEditor(e)) {
        // Let the editor handle the actual file processing, but always close the overlay
        dragCounter.current = 0;
        setActive(false);
        return;
      }
      e.preventDefault();
      dragCounter.current = 0;
      setActive(false);
      const files: File[] = [];
      const dt = e.dataTransfer as DataTransfer | null;
      if (dt?.files && dt.files.length > 0) {
        uploadFiles(Array.from(dt.files));
        return;
      }
      if (dt?.items && dt.items.length > 0) {
        for (const it of Array.from(dt.items)) {
          try { if (it.kind === "file") { const f = it.getAsFile(); if (f) files.push(f); } } catch {}
        }
        if (files.length > 0) uploadFiles(files);
      }
    };
    document.addEventListener("dragenter", onEnter, { capture: true });
    document.addEventListener("dragover", onOver, { capture: true });
    document.addEventListener("dragleave", onLeave, { capture: true });
    document.addEventListener("drop", onDrop, { capture: true });
    return () => {
      document.removeEventListener("dragenter", onEnter, { capture: true } as any);
      document.removeEventListener("dragover", onOver, { capture: true } as any);
      document.removeEventListener("dragleave", onLeave, { capture: true } as any);
      document.removeEventListener("drop", onDrop, { capture: true } as any);
    };
  }, []);

  return active ? (
    <div
      className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-[1px] flex items-center justify-center pointer-events-none"
    >
      <div className="pointer-events-none border-2 border-dashed border-white/80 text-white bg-white/10 rounded-xl p-12 text-center max-w-md mx-auto">
        <div className="text-lg font-semibold mb-1">Drop files to upload</div>
        <div className="text-sm opacity-90">Release anywhere in this area</div>
      </div>
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-3 py-2 rounded shadow">
          {error}
        </div>
      )}
    </div>
  ) : null;
}

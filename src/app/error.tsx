"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Optionally log the error to an error reporting service
    // console.error("Global error boundary:", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa", color: "#111" }}>
      <div style={{ maxWidth: 560, padding: 24, background: "white", border: "1px solid #eee", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>The page crashed while handling your action. You can try again or go back home.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => reset()}
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#f9fafb", cursor: "pointer" }}
          >
            Try again
          </button>
          <Link href="/" style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: 8, background: "#f9fafb" }}>Home</Link>
        </div>
        {process.env.NODE_ENV !== 'production' && (
          <pre style={{ marginTop: 16, fontSize: 12, whiteSpace: "pre-wrap" }}>{String(error?.message || '')}</pre>
        )}
      </div>
    </div>
  );
}

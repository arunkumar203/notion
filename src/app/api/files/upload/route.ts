import { NextResponse } from "next/server";
import { appwriteFetch, getAppwriteConfig } from "@/lib/appwrite-rest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Accepts multipart/form-data with `file` field and uploads to Appwrite Storage
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const { bucket } = getAppwriteConfig();
    // Forward multipart form-data to Appwrite REST API
    const fd = new FormData();
    // unique() lets Appwrite generate an id
    fd.set("fileId", "unique()");
    fd.set("file", file, file.name);

    const res = await appwriteFetch(`/storage/buckets/${bucket}/files`, {
      method: "POST",
      body: fd as any,
    });
    const data = await res.json();
    return NextResponse.json({ ok: true, file: data });
  } catch (e: any) {
    console.error("[api/files/upload] error", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}

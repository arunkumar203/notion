import { NextResponse } from "next/server";
import { appwriteFetch, getAppwriteConfig } from "@/lib/appwrite-rest";
import { verifyAuthentication } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Accepts multipart/form-data with `file` field and uploads to Appwrite Storage
// Requires authentication
export async function POST(req: Request) {
  // Verify authentication first
  const authResult = await verifyAuthentication();
  if (authResult instanceof NextResponse) {
    return authResult; // Return authentication error
  }

  const { uid } = authResult;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // File size limit (25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 25MB." }, { status: 400 });
    }

    // Basic file type validation
    const allowedTypes = [
      'image/', 'video/', 'audio/', 'text/', 'application/pdf', 
      'application/msword', 'application/vnd.openxmlformats-officedocument',
      'application/zip', 'application/json'
    ];
    
    const isAllowedType = allowedTypes.some(type => file.type.startsWith(type));
    if (!isAllowedType) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
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
    
    // Log the upload for security auditing
    // console.log(`File uploaded by user ${uid}: ${data.$id} (${file.name}, ${file.size} bytes)`);
    
    return NextResponse.json({ ok: true, file: data });
  } catch (e: any) {
    console.error("[api/files/upload] error", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { appwriteFetch, getAppwriteConfig } from "@/lib/appwrite-rest";
import { verifyAuthentication } from "@/lib/auth-helpers";
import { isMaintenanceModeActive } from "@/lib/maintenance";
import { canUploadFile, recordFileUploadWithIndex, formatBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Accepts multipart/form-data with `file` field and uploads to Appwrite Storage
// Requires authentication and checks storage limits
export async function POST(req: Request) {
  // console.log('=== [api/files/upload] POST request received ===');
// 
  // Check maintenance mode first
  if (await isMaintenanceModeActive()) {
    return NextResponse.json({ error: "System is under maintenance" }, { status: 503 });
  }

  // Verify authentication first
  const authResult = await verifyAuthentication();
  if (authResult instanceof NextResponse) {
    return authResult; // Return authentication error
  }

  const { uid } = authResult;

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const workspaceId = form.get("workspaceId") as string | null;
    const pageId = form.get("pageId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // File size limit per file (25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB in bytes
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Maximum size is 25MB per file." }, { status: 400 });
    }

    // Check user's total storage limit
    const storageCheck = await canUploadFile(uid, file.size);
    if (!storageCheck.allowed) {
      return NextResponse.json({
        error: `Storage limit exceeded. You have ${formatBytes(storageCheck.remaining)} remaining out of ${formatBytes(storageCheck.limit)} total. This file is ${formatBytes(file.size)}.`,
        code: 'STORAGE_LIMIT_EXCEEDED',
        details: {
          used: storageCheck.used,
          limit: storageCheck.limit,
          remaining: storageCheck.remaining,
          fileSize: file.size
        }
      }, { status: 413 });
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

    if (!data.$id) {
      throw new Error('Upload to storage failed');
    }

    // Record the file in RTDB for storage tracking
    try {
      await recordFileUploadWithIndex(uid, {
        id: data.$id,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        workspaceId: workspaceId || 'personal',
        pageId: pageId || undefined
      });
      // console.log(`[api/files/upload] Tracked file ${data.$id} for user ${uid}, size: ${file.size} bytes`);
    } catch (trackingError: any) {
      console.error('[api/files/upload] Failed to track file in RTDB:', trackingError);
      // Don't fail the upload, just log the error
    }

    return NextResponse.json({ ok: true, file: data });
  } catch (e: any) {
    console.error("[api/files/upload] error", e);
    return NextResponse.json(
      { error: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}

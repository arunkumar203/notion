import { NextResponse } from "next/server";
import { Client, Users } from "node-appwrite";
import { getAppwriteConfig } from "@/lib/appwrite-rest";
import { cookies } from 'next/headers';
import admin, { auth as adminAuth } from '@/lib/firebase-admin';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const jsonError = (status: number, message: string) => NextResponse.json({ error: message }, { status });

// Issues a short-lived JWT for a specific Appwrite user (service user)
// Requires authentication and env APPWRITE_SERVICE_USER_ID to be set to a valid user ID.
export async function POST() {
  try {
    if (!adminAuth) {
      return jsonError(500, 'Authentication service not available');
    }

    // Verify user authentication
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    
    if (!session) {
      return jsonError(401, 'Not authenticated');
    }

    let decoded: any;
    try {
      decoded = await adminAuth.verifySessionCookie(session, true);
    } catch {
      return jsonError(401, 'Invalid session');
    }

    const uid = decoded?.uid as string;
    
    if (!uid) {
      return jsonError(401, 'User not authenticated');
    }

    const { endpoint, project, key } = getAppwriteConfig();
    const userId = process.env.APPWRITE_SERVICE_USER_ID;
    if (!userId) {
      return NextResponse.json(
        { error: "Missing APPWRITE_SERVICE_USER_ID env" },
        { status: 500 }
      );
    }

    const client = new Client().setEndpoint(endpoint).setProject(project).setKey(key);
    const users = new Users(client);

    const { jwt } = await users.createJWT(userId);
    return NextResponse.json({ ok: true, jwt });
  } catch (e: any) {
    console.error("[files/token] error", e);
    return NextResponse.json(
      { error: e?.message || "Failed to issue token" },
      { status: 500 }
    );
  }
}

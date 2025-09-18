import { NextResponse } from "next/server";
import { Client, Users } from "node-appwrite";
import { getAppwriteConfig } from "@/lib/appwrite-rest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Issues a short-lived JWT for a specific Appwrite user (service user)
// Requires env APPWRITE_SERVICE_USER_ID to be set to a valid user ID.
export async function POST() {
  try {
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

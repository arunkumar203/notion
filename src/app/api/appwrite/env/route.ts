import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const endpoint = !!process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = !!process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const key = !!process.env.APPWRITE_API_KEY;
  const bucket = !!process.env.APPWRITE_BUCKET_ID;
  const missing: string[] = [];
  if (!endpoint) missing.push('NEXT_PUBLIC_APPWRITE_ENDPOINT');
  if (!project) missing.push('NEXT_PUBLIC_APPWRITE_PROJECT_ID');
  if (!key) missing.push('APPWRITE_API_KEY');
  if (!bucket) missing.push('APPWRITE_BUCKET_ID');
  return NextResponse.json({ ok: missing.length === 0, present: { endpoint, project, key, bucket }, missing });
}

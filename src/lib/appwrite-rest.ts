export function getAppwriteConfig() {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
  const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const key = process.env.APPWRITE_API_KEY;
  const bucket = process.env.APPWRITE_BUCKET_ID;
  if (!endpoint || !project || !key || !bucket) {
    throw new Error('Missing Appwrite env (endpoint/project/key/bucket)');
  }
  return { endpoint, project, key, bucket } as const;
}

export async function appwriteFetch(path: string, init: RequestInit = {}) {
  const { endpoint, project, key } = getAppwriteConfig();
  const headers: Record<string, string> = {
    'X-Appwrite-Project': project,
    'X-Appwrite-Key': key,
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${endpoint}${path}`, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    let err: any = undefined;
    try { err = await res.json(); } catch {}
    const msg = err?.message || err?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res;
}

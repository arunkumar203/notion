// Server-side Appwrite client using API key. Do NOT import this in client components.
import { Client, Storage } from 'node-appwrite';

export const getServerAppwrite = () => {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT as string;
  const project = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string;
  const apiKey = process.env.APPWRITE_API_KEY as string;
  if (!endpoint || !project || !apiKey) {
    throw new Error('Missing Appwrite server env: endpoint/project/api key');
  }
  const client = new Client().setEndpoint(endpoint).setProject(project).setKey(apiKey);
  const storage = new Storage(client);
  return { client, storage };
};

export const getBucketId = () => {
  const bucket = process.env.APPWRITE_BUCKET_ID as string;
  if (!bucket) throw new Error('Missing APPWRITE_BUCKET_ID');
  return bucket;
};

import { Client, Account, Storage, ID } from 'appwrite';

// Client-side Appwrite instance. Only exposes public config.
// Server-only secrets (API key) must NEVER be used here.
export const appwriteClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT as string)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string);

export const appwriteAccount = new Account(appwriteClient);
export const appwriteStorage = new Storage(appwriteClient);
export const AppwriteID = ID;

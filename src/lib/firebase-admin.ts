import * as admin from 'firebase-admin';

// Check if we're in a server environment
const isServer = typeof window === 'undefined';

// Initialize Firebase Admin only on the server side
let auth: admin.auth.Auth | null = null;

if (isServer) {
  try {
    const serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    // Check if all required environment variables are present
    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      console.error('Missing required Firebase Admin environment variables');
      // debug lines removed
      // Do not throw here; allow the app to run and the API to return a graceful error
      auth = null;
    } else {
      // Initialize Firebase Admin if not already initialized
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: serviceAccount.projectId,
            clientEmail: serviceAccount.clientEmail,
            privateKey: serviceAccount.privateKey,
          }),
          databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        });
        // debug line removed
      }

      // ... (previous code)
      auth = admin.auth();
    }
  } catch (error) {
    console.error('Firebase admin initialization error:', error);
    auth = null;
  }
}

// Export aliases to match usage in API routes
export const adminAuth = auth;
export const rtdb = (admin.apps.length > 0) ? admin.database() : null as any as admin.database.Database;

export { auth };
export default admin;

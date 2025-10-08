'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
  reload
} from 'firebase/auth';
import { auth, rtdb } from '@/lib/firebase';
import { ensureSampleWorkspace } from '@/lib/onboarding';
import { ref, get, set } from 'firebase/database';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signup: (email: string, password: string) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  loginWithGoogle: () => Promise<User>;
  sendVerificationEmail: () => Promise<void>;
  checkEmailVerification: () => Promise<boolean>;
  manualVerifyEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => { },
  signup: async () => {
    throw new Error('signup must be used within an AuthProvider');
  },
  login: async () => {
    throw new Error('login must be used within an AuthProvider');
  },
  loginWithGoogle: async () => {
    throw new Error('loginWithGoogle must be used within an AuthProvider');
  },
  sendVerificationEmail: async () => {
    throw new Error('sendVerificationEmail must be used within an AuthProvider');
  },
  checkEmailVerification: async () => {
    throw new Error('checkEmailVerification must be used within an AuthProvider');
  },
  manualVerifyEmail: async () => {
    throw new Error('manualVerifyEmail must be used within an AuthProvider');
  },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Ensure user record exists in RTDB with an empty notebooks map
  const ensureUserRecord = async (uid: string, email?: string | null) => {
    try {
      const userRef = ref(rtdb, `users/${uid}`);
      const snap = await get(userRef);
      if (!snap.exists()) {
        await set(userRef, {
          email: email ?? null,
          createdAt: Date.now(),
          role: 'user', // Default role for all new users
          notebooks: {},
        });
      }
    } catch (e) {
      console.error('ensureUserRecord failed:', e);
    }
  };

  const createSession = async (idToken: string) => {
    // debug line removed
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ idToken }),
      credentials: 'include'
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Session creation failed:', errorData);
      throw new Error('Failed to create session');
    }
    // debug line removed
    return response;
  };

  const login = async (email: string, password: string) => {
    // debug line removed
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // debug line removed

    // Check if email is verified for email/password login
    if (!userCredential.user.emailVerified) {
      // Don't create session for unverified users
      setUser(userCredential.user);
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    // Force token refresh to ensure we have the latest token
    const idToken = await userCredential.user.getIdToken(true);
    await createSession(idToken);
    await ensureUserRecord(userCredential.user.uid, userCredential.user.email);

    // Update the user state
    setUser(userCredential.user);
    return userCredential.user;
  };

  const signup = async (email: string, password: string) => {
    try {
      // debug line removed
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // debug line removed

      // Send email verification immediately after signup
      await sendEmailVerification(userCredential.user);

      // Don't create session for unverified users
      // Update the user state so they can access the verification page
      setUser(userCredential.user);
      await ensureUserRecord(userCredential.user.uid, userCredential.user.email);

      return userCredential.user;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // debug line removed

      // Prevent any default behavior that might cause a page reload
      const result = await signInWithPopup(auth, provider);
      // debug line removed

      // Google accounts are pre-verified, so we can proceed with session creation
      // Force token refresh to ensure we have the latest token
      const idToken = await result.user.getIdToken(true);
      // debug line removed

      // Create session with the token
      await createSession(idToken);

      // Update the user state
      setUser(result.user);
      await ensureUserRecord(result.user.uid, result.user.email);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      // Clean up any partial auth state
      await auth.signOut();
      throw error;
    }
  };



  useEffect(() => {
    let isMounted = true;

    const handleAuthStateChange = async (user: User | null) => {
      if (!isMounted) return;

      if (user) {
        // Update user state first for immediate UI feedback
        setUser(user);

        try {
          // Ensure user record exists
          await ensureUserRecord(user.uid, user.email);

          // Don't automatically create sessions - only create them during explicit login
          // This prevents sessions from being created when users are just on verification page
        } catch (error) {
          console.error('Error in auth state change:', error);
        }
      } else {
        try {
          // Ensure any stale session cookies are cleared when Firebase auth has no user
          await fetch('/api/auth/session', {
            method: 'DELETE',
            credentials: 'include',
            cache: 'no-store',
          });
        } catch (error) {
          console.error('Failed to clear session cookie after auth state change:', error);
        }
        setUser(null);
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);




  const value = {
    user,
    loading,
    signOut: async () => {
      try {
        // debug line removed
        await firebaseSignOut(auth);

        // Clear the session cookie
        await fetch('/api/auth/session', {
          method: 'DELETE',
          credentials: 'include'
        });

        // Clear the user state
        setUser(null);
        // debug line removed
        // Navigate to home client-side to avoid full page reload
        try { router.replace('/'); } catch { }
      } catch (error) {
        console.error('Error signing out:', error);
        throw error;
      }
    },
    signup,
    login,
    loginWithGoogle,
    sendVerificationEmail: async () => {
      if (!user) throw new Error('No user logged in');
      await sendEmailVerification(user);
    },
    checkEmailVerification: async () => {
      if (!user) throw new Error('No user logged in');
      await reload(user);
      return user.emailVerified;
    },
    manualVerifyEmail: async () => {
      if (!user) throw new Error('No user logged in');



      try {
        // Get the current ID token
        const idToken = await user.getIdToken(true);


        // Call the manual verification API with the ID token
        const response = await fetch('/api/auth/manual-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          credentials: 'include'
        });



        if (!response.ok) {
          const errorData = await response.json();
          console.error('API error:', errorData);
          throw new Error(errorData.error || 'Failed to manually verify email');
        }

        const result = await response.json();


        // Reload the user to get updated verification status
        await reload(user);


        // The API should have already created a session cookie, but let's ensure it
        if (user.emailVerified) {

          try {
            const newIdToken = await user.getIdToken(true);
            await createSession(newIdToken);

          } catch (sessionError) {
            console.warn('Session creation failed, but user is verified:', sessionError);
          }
        }
      } catch (error) {
        console.error('Manual verification failed:', error);
        throw error;
      }
    },
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


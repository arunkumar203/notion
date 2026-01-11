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
  sendPasswordResetEmail,
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
  resetPassword: (email: string) => Promise<void>;
  confirm2FALogin: (idToken: string, code: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => { },
  signup: async () => { throw new Error('signup must be used within an AuthProvider'); },
  login: async () => { throw new Error('login must be used within an AuthProvider'); },
  loginWithGoogle: async () => { throw new Error('loginWithGoogle must be used within an AuthProvider'); },
  sendVerificationEmail: async () => { throw new Error('sendVerificationEmail must be used within an AuthProvider'); },
  checkEmailVerification: async () => { throw new Error('checkEmailVerification must be used within an AuthProvider'); },
  resetPassword: async () => { throw new Error('resetPassword must be used within an AuthProvider'); },
  confirm2FALogin: async () => { throw new Error('confirm2FALogin must be used within an AuthProvider'); },
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
      const text = await response.text();
      console.error('Session creation failed:', text);
      throw new Error('Failed to create session');
    }
    // debug line removed
    return response;
  };

  const confirm2FALogin = async (idToken: string, code: string) => {
    const response = await fetch('/api/auth/2fa/verify-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, code })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Verification failed');
    }

    if (user) {
      await ensureUserRecord(user.uid, user.email);
      setUser(user);
      return user;
    }
    throw new Error('User context lost during 2FA');
  };

  // ... rest of functions
  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        setUser(userCredential.user);
        throw new Error('EMAIL_NOT_VERIFIED');
      }

      // Check 2FA Status from RTDB
      const snapshot = await get(ref(rtdb, `users/${userCredential.user.uid}/settings/2sv`));
      const settings = snapshot.val();

      if (settings?.enabled) {
        setUser(userCredential.user);
        throw {
          code: '2FA_REQUIRED',
          message: '2FA Required',
          user: userCredential.user
        };
      }

      const idToken = await userCredential.user.getIdToken(true);
      await createSession(idToken);
      await ensureUserRecord(userCredential.user.uid, userCredential.user.email);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (error: any) {
      throw error;
    }
  };

  const signup = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      // Wait for user to be populated in Firebase Auth
      const currentUser = userCredential.user;

      // Send verification email
      await sendEmailVerification(currentUser);

      // Ensure user record exists
      await ensureUserRecord(currentUser.uid, currentUser.email);

      // Update state
      setUser(currentUser);

      // Do NOT create session cookie yet - wait for email verification
      // But we can let them see the "Verify Email" page

      return currentUser;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);

      // Check 2FA Status from RTDB
      const snapshot = await get(ref(rtdb, `users/${result.user.uid}/settings/2sv`));
      const settings = snapshot.val();

      if (settings?.enabled) {
        setUser(result.user);
        throw {
          code: '2FA_REQUIRED',
          message: '2FA Required',
          user: result.user
        };
      }

      const idToken = await result.user.getIdToken(true);
      await createSession(idToken);

      setUser(result.user);
      await ensureUserRecord(result.user.uid, result.user.email);
      return result.user;
    } catch (error: any) {
      if (error.code === '2FA_REQUIRED') throw error;
      console.error('Error signing in with Google:', error);
      await auth.signOut();
      throw error;
    }
  };



  useEffect(() => {
    let isMounted = true;

    // Fallback timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth loading timeout - forcing loading to false');
        setLoading(false);
      }
    }, 15000); // 15 second timeout (increased for slower connections)

    const handleAuthStateChange = async (user: User | null) => {
      if (!isMounted) return;

      try {
        if (user) {
          // Update user state first for immediate UI feedback
          setUser(user);

          // Ensure user record exists (don't block on this)
          // Only create record for verified users to prevent permission errors
          if (user.emailVerified) {
            ensureUserRecord(user.uid, user.email).catch(error => {
              console.error('Error ensuring user record:', error);
            });
          }

          // Don't refresh session on every auth state change to avoid loops
          // Session will be refreshed by the periodic refresh or on login
        } else {
          setUser(null);

          // Clear session cookie when user logs out (don't block on this)
          fetch('/api/auth/session', {
            method: 'DELETE',
            credentials: 'include',
            cache: 'no-store',
          }).catch(error => {
            console.error('Failed to clear session cookie:', error);
          });
        }
      } catch (error) {
        console.error('Error in auth state change:', error);
      } finally {
        // Always set loading to false, even if there are errors
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const unsubscribe = onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
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
    resetPassword: async (email: string) => {
      await sendPasswordResetEmail(auth, email);
    },
    confirm2FALogin,
  };

  // Periodically refresh session to prevent expiration
  useEffect(() => {
    // Skip session validation for unverified users (they don't have a session cookie yet)
    if (!user || !user.emailVerified) return;

    // Validate session immediately on mount and refresh periodically
    const validateAndRefresh = async () => {
      try {
        // First, validate the current session
        const validationResponse = await fetch('/api/auth/validate-session', {
          credentials: 'include',
          cache: 'no-store'
        });

        if (!validationResponse.ok) {
          // Session is invalid - but don't automatically sign out here as it causes loops.
          // The middleware will handle redirects if the session is truly dead.
          // This prevents "flicker" signouts on minor network glitches.
          console.warn('Session validation warning:', await validationResponse.text());
          return;
        }

        // Session is valid, refresh it
        const idToken = await user.getIdToken(true); // Force refresh
        await createSession(idToken);
        console.log('Session refreshed successfully');
      } catch (error) {
        console.error('Failed to validate/refresh session:', error);
        // Don't sign out on network errors
      }
    };

    // Validate immediately
    validateAndRefresh();

    // Refresh session every 50 minutes (Firebase sessions last ~1 hour)
    const refreshInterval = setInterval(validateAndRefresh, 50 * 60 * 1000); // 50 minutes

    return () => clearInterval(refreshInterval);
  }, [user]);

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


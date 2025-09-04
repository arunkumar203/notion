'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

export function useRedirectAfterLogin(redirectPath = '/notebooks') {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const auth = getAuth();
    
    let isMounted = true;
    
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user && isMounted) {
  // console.log('Auth state changed in useRedirectAfterLogin, user:', user.uid);
        // Always use client-side navigation to prevent full page reloads
        router.push(redirectPath);
      }
    });

    // Cleanup subscription on unmount
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router, redirectPath, pathname]);

  return null;
}
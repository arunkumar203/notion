'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';

export function useEmailVerification() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Don't redirect while auth is loading
    if (loading) return;

    // Don't redirect if no user
    if (!user) return;

    // Don't redirect if already on verification page
    if (pathname === '/verify-email') return;

    // Don't redirect for public paths
    const publicPaths = ['/login', '/signup', '/', '/about', '/changelog'];
    if (publicPaths.includes(pathname)) return;

    // Check if user needs email verification
    const isGoogleProvider = user.providerData.some(p => p.providerId === 'google.com');
    const needsVerification = !user.emailVerified && !isGoogleProvider;

    if (needsVerification) {
      router.replace('/verify-email');
    }
  }, [user, loading, pathname, router]);

  return {
    needsVerification: user && !user.emailVerified && !user.providerData.some(p => p.providerId === 'google.com'),
    isVerified: user?.emailVerified || user?.providerData.some(p => p.providerId === 'google.com'),
  };
}
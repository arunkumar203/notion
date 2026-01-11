'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirect from old /notebooks route to new /workspaces route
 */
export default function NotebooksRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/workspaces');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        <p className="text-gray-600">Redirecting to workspaces...</p>
      </div>
    </div>
  );
}
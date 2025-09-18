'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ensureSampleWorkspace } from '@/lib/onboarding';
import { ref, get, set } from 'firebase/database';
import { rtdb } from '@/lib/firebase';

export default function FirstTimeSetup() {
  const { user } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const markWelcomeCompleted = useCallback(async (uid: string) => {
    if (!uid) return;

    try {
      await set(ref(rtdb, `users/${uid}/onboarding/welcomeCompleted`), true);
    } catch (error) {
      console.error('Error marking onboarding complete:', error);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkFirstTime = async () => {
      if (!user) {
        if (isMounted) {
          setShowWelcome(false);
          setIsChecking(false);
        }
        return;
      }

      if (isMounted) {
        setIsChecking(true);
      }

      try {
        const onboardingRef = ref(rtdb, `users/${user.uid}/onboarding`);
        const onboardingSnapshot = await get(onboardingRef);
        const onboardingData = onboardingSnapshot.exists() ? onboardingSnapshot.val() : {};
        const welcomeCompleted = onboardingData?.welcomeCompleted === true;

        if (welcomeCompleted) {
          if (isMounted) {
            setShowWelcome(false);
          }
          return;
        }

        const creationTime = user.metadata?.creationTime ?? null;
        const lastSignInTime = user.metadata?.lastSignInTime ?? null;
        const isFirstSignIn = Boolean(
          creationTime &&
          lastSignInTime &&
          creationTime === lastSignInTime
        );

        if (!isFirstSignIn) {
          if (!welcomeCompleted) {
            markWelcomeCompleted(user.uid);
          }
          if (isMounted) {
            setShowWelcome(false);
          }
          return;
        }

        if (isMounted) {
          setShowWelcome(true);
        }
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        if (isMounted) {
          setShowWelcome(false);
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    };

    checkFirstTime();

    return () => {
      isMounted = false;
    };
  }, [user, markWelcomeCompleted]);

  const handleCreateSample = async () => {
    if (!user || isCreating) return;

    setIsCreating(true);
    try {
      await ensureSampleWorkspace(user.uid);
      console.log('Sample workspace created successfully');
    } catch (error) {
      console.error('Error creating sample workspace:', error);
    } finally {
      setShowWelcome(false);
      if (user) {
        await markWelcomeCompleted(user.uid);
      }
      setIsCreating(false);
    }
  };

  const handleSkip = async () => {
    setShowWelcome(false);
    if (user) {
      await markWelcomeCompleted(user.uid);
    }
  };

  if (isChecking) return null;
  if (!showWelcome) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm dark:bg-gray-950/70">
      <div className="w-full max-w-md mx-4 rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Welcome to Onenot!</h2>
        <p className="mt-3 mb-6 text-sm text-gray-600 dark:text-gray-300">Would you like to create a sample notebook to get started?</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={handleSkip}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
          >
            Skip for now
          </button>
          <button
            onClick={handleCreateSample}
            disabled={isCreating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-900"
          >
            {isCreating ? 'Creating...' : 'Create Sample Workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useEmailVerification } from '@/hooks/useEmailVerification';
import { ensureSampleWorkspace } from '@/lib/onboarding';
import { ref, get, set } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { usePathname } from 'next/navigation';

// Module-level to persist across Strict Mode double-mount
let onboardingSettingsFetched = false;
let onboardingSettingsData: { mandatory: boolean } | null = null;

export default function FirstTimeSetup() {
  const { user } = useAuth();
  const { needsVerification, isVerified } = useEmailVerification();
  const [isChecking, setIsChecking] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [onboardingMandatory, setOnboardingMandatory] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const hasStartedCreation = useRef(false);
  const pathname = usePathname();

  const shouldBlockOnboarding = Boolean(
    pathname &&
    ['/verify-email', '/login', '/signup', '/appwrite-verify'].some((prefix) =>
      pathname.startsWith(prefix)
    )
  );

  const markWelcomeCompleted = useCallback(async (uid: string) => {
    if (!uid) return;

    try {
      await set(ref(rtdb, `users/${uid}/onboarding/welcomeCompleted`), true);
    } catch (error) {
      console.error('Error marking onboarding complete:', error);
    }
  }, []);

  const handleCreateSample = useCallback(async () => {
    if (!user) return;

    if (!isCreating) {
      setIsCreating(true);
    }

    try {
      await ensureSampleWorkspace(user.uid);
    } catch (error) {
      console.error('Error creating sample workspace:', error);
    } finally {
      setShowWelcome(false);
      if (user) {
        await markWelcomeCompleted(user.uid);
      }
      setIsCreating(false);
    }
  }, [user, isCreating, markWelcomeCompleted]);

  // Fetch onboarding settings (only once globally)
  useEffect(() => {
    // Use cached data if already fetched
    if (onboardingSettingsFetched && onboardingSettingsData) {
      setOnboardingMandatory(onboardingSettingsData.mandatory);
      setLoadingSettings(false);
      return;
    }

    // Prevent duplicate fetch
    if (onboardingSettingsFetched) {
      return;
    }
    onboardingSettingsFetched = true;

    const fetchOnboardingSettings = async () => {
      try {
        const response = await fetch('/api/onboarding-settings');
        if (response.ok) {
          const data = await response.json();
          const mandatory = data.onboardingMandatory ?? false;
          onboardingSettingsData = { mandatory };
          setOnboardingMandatory(mandatory);
        }
      } catch (error) {
        console.error('Error fetching onboarding settings:', error);
        setOnboardingMandatory(false);
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchOnboardingSettings();
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (!user || shouldBlockOnboarding || loadingSettings) {
      if (isMounted) {
        setShowWelcome(false);
        setIsChecking(false);
      }
      return () => {
        isMounted = false;
      };
    }

    const checkFirstTime = async () => {
      // Don't show onboarding if email verification is needed
      if (needsVerification) {
        if (isMounted) {
          setShowWelcome(false);
          setIsChecking(false);
        }
        return;
      }

      // Only proceed if email is verified
      if (!isVerified) {
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
        if (!onboardingSnapshot.exists()) {
          try {
            await set(onboardingRef, { welcomeCompleted: false, firstLoginAt: Date.now() });
          } catch (error) {
            console.error('Error initializing onboarding state:', error);
          }
          if (isMounted) {
            setShowWelcome(true);
          }
          return;
        }

        const onboardingData = onboardingSnapshot.val() ?? {};
        const welcomeCompleted = onboardingData?.welcomeCompleted === true;

        if (welcomeCompleted) {
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
  }, [user, markWelcomeCompleted, needsVerification, isVerified, shouldBlockOnboarding, loadingSettings]);



  // Handle mandatory onboarding creation
  useEffect(() => {
    if (showWelcome && onboardingMandatory && !isCreating && user && !hasStartedCreation.current) {
      hasStartedCreation.current = true;
      handleCreateSample();
    }
  }, [showWelcome, onboardingMandatory, isCreating, user, handleCreateSample]);

  const handleSkip = async () => {
    setShowWelcome(false);
    if (user) {
      await markWelcomeCompleted(user.uid);
    }
  };

  if (isChecking) return null;
  if (!showWelcome) return null;

  // When onboarding is mandatory, show creating state
  if (onboardingMandatory) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm dark:bg-gray-950/70">
        <div className="w-full max-w-md mx-4 rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Welcome to Onenot!</h2>
          <p className="mt-3 mb-6 text-sm text-gray-600 dark:text-gray-300">
            Creating your sample workspace to help you get started...
          </p>
          <div className="flex justify-center">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Creating sample workspace...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Optional onboarding - show choice buttons
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm dark:bg-gray-950/70">
      <div className="w-full max-w-md mx-4 rounded-xl border border-gray-200 bg-white p-6 text-gray-900 shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Welcome to Onenot!</h2>
        <p className="mt-3 mb-6 text-sm text-gray-600 dark:text-gray-300">
          Would you like to create a sample notebook to get started?
        </p>
        <div className="flex justify-end gap-3">
          {!isCreating && (
            <button
              onClick={handleSkip}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
            >
              Skip for now
            </button>
          )}
          <button
            onClick={handleCreateSample}
            disabled={isCreating}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus:ring-offset-gray-900"
          >
            {isCreating ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Creating...</span>
              </div>
            ) : (
              'Create Sample Workspace'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { FcGoogle } from 'react-icons/fc';
import { FaSpinner } from 'react-icons/fa';

const MIN_PASSWORD_LENGTH = 6;

export default function SignUpPage() {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);
  const { signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  const charactersLabel = (count: number) => (count === 1 ? 'character' : 'characters');

  let confirmFeedback = '';
  if (password.length > 0) {
    const diff = password.length - confirmPassword.length;
    if (diff !== 0) {
      const absDiff = Math.abs(diff);
      const characterWord = charactersLabel(absDiff);
      confirmFeedback =
        diff > 0
          ? `Confirm password needs ${absDiff} more ${characterWord}.`
          : `Confirm password has ${absDiff} extra ${characterWord}.`;
    } else if (confirmPassword.length > 0 && password !== confirmPassword) {
      confirmFeedback = 'Passwords do not match.';
    }
  }

  const baseDisabled = password.length < MIN_PASSWORD_LENGTH || password !== confirmPassword;
  const disableSubmit = loading || isGoogleLoading || baseDisabled;
  const submitDisabledReason =
    !loading && !isGoogleLoading && baseDisabled
      ? password.length < MIN_PASSWORD_LENGTH
        ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
        : confirmFeedback || 'Passwords do not match.'
      : '';

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validation
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
      return;
    }

    setLoading(true);
    setError('');

    try {
  // debug line removed
      // This will create the user and set the session cookie
      const user = await signup(email, password);
      
      if (!user) {
        throw new Error('Failed to create user');
      }
      
  // debug line removed
      // Use router.push for client-side navigation without full page reload
      router.push('/notebooks');
      return;
  } catch (err: unknown) {
      console.error('Signup error:', err);

      // Handle specific error cases
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : undefined;
  const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : undefined;
      if (code || message) {
        switch (code || message) {
          case 'auth/email-already-in-use':
            setError('An account already exists with this email. Try logging in instead.');
            break;
          case 'auth/invalid-email':
            setError('Please enter a valid email address');
            break;
          case 'auth/weak-password':
            setError('Please choose a stronger password');
            break;
          case 'auth/operation-not-allowed':
            setError('Email/password accounts are not enabled');
            break;
          default:
            setError(message || 'Failed to create an account. Please try again.');
        }
      } else {
        setError('Failed to create an account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsGoogleLoading(true);
    setError('');
    
    try {
  // debug line removed
      const user = await loginWithGoogle();
      
      if (!user) {
        throw new Error('Failed to sign in with Google');
      }
      
  // debug line removed
      // Use replace instead of push to prevent the back button from going back to the signup page
      router.replace('/notebooks');
      return;
  } catch (error: unknown) {
      console.error('Google sign up error:', error);
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message) : undefined;
      setError(message || 'Failed to sign up with Google. Please try again.');
  // Do not rethrow; keep the page stable and let the user try again
    } finally {
      if (typeof window !== 'undefined') {
        setIsGoogleLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center mb-4">
        <Link
          href="/"
          className="text-lg font-bold text-blue-600 hover:text-blue-700"
        >
          Home 
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md w-full space-y-8 bg-white p-6 rounded-lg shadow-md">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Or{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-500">
                sign in to an existing account
              </Link>
            </p>
          </div>

          <div className="mt-8">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGoogleSignUp(e);
              }}
              disabled={loading || isGoogleLoading}
              className={`w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading || isGoogleLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isGoogleLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                  Signing up...
                </>
              ) : (
                <>
                  <FcGoogle className="w-5 h-5 mr-2" />
                  Sign up with Google
                </>
              )}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="email-address" className="sr-only">Email address</label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || isGoogleLoading}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder={`Password (min ${MIN_PASSWORD_LENGTH} characters)`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isGoogleLoading}
                />
               
              </div>
              <div>
                <label htmlFor="confirm-password" className="sr-only">Confirm Password</label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading || isGoogleLoading}
                />
              </div>
            </div>

            <div className="space-y-4">
              <button
                type="submit"
                disabled={disableSubmit}
                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${disableSubmit ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${disableSubmit ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <FaSpinner className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Creating Account...
                  </>
                ) : (
                  'Sign up with Email'
                )}
              </button>
              {submitDisabledReason && (
                <p className="text-sm text-red-600 text-center">{submitDisabledReason}</p>
              )}

              <div className="text-xs text-gray-500 text-center">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}





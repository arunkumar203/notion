'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import { FaSpinner } from 'react-icons/fa';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();



    const trimmedEmail = email.trim();

    const normalizedEmail = trimmedEmail.toLowerCase();

    const rawPassword = password;



    if (!normalizedEmail || !rawPassword) {

      setError('Please enter both email and password');

      return;

    }



    setLoading(true);

    setError('');



    try {

      await login(normalizedEmail, rawPassword);

      // debug line removed

      router.replace('/notebooks');

    } catch (err: unknown) {

      console.error('Login error:', err);



      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : undefined;

      const message = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : undefined;


      // Handle email verification error
      if (message === 'EMAIL_NOT_VERIFIED') {
        router.push('/verify-email');
        return;
      }

      if (code) {

        switch (code) {

          case 'auth/user-not-found':

            setError('No account found with this email. Try signing up instead.');

            break;

          case 'auth/wrong-password':

            setError('Incorrect password. Please try again or reset it.');

            break;

          case 'auth/invalid-credential':

            setError('Invalid email or password.');

            break;

          case 'auth/invalid-email':

            setError('Please enter a valid email address.');

            break;

          case 'auth/too-many-requests':

            setError('Too many failed attempts. Please try again later.');

            break;

          case 'auth/user-disabled':

            setError('Your account has been disabled by the system administrator. Please contact the system admin to enable your account.');

            break;

          default:

            setError(message || 'Failed to log in. Please try again.');

        }

      } else {

        setError(message || 'Failed to log in. Please try again.');

      }

    } finally {

      setLoading(false);

    }

  };



  const handleGoogleSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
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
      // Use replace to prevent going back to login page
      router.replace('/notebooks');
      return;
    } catch (error: unknown) {
      console.error('Google sign in error:', error);
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : undefined;
      const message = typeof error === 'object' && error && 'message' in error ? String((error as { message?: unknown }).message) : undefined;

      // Handle specific error cases
      if (code === 'auth/user-disabled') {
        setError('Your account has been disabled by the system administrator. Please contact the system admin to enable your account.');
      } else {
        setError(message || 'Failed to sign in with Google. Please try again.');
      }
      // Do not rethrow; keep the page stable and let the user try again
    } finally {
      if (typeof window !== 'undefined') {
        // Only update loading state if we're still on the page
        setIsGoogleLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <Link href="/" className="text-lg font-bold text-blue-600 hover:text-blue-700">
          Home
        </Link>
      </div>

      {/* Main content */}
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md w-full space-y-8 bg-white p-6 rounded-lg shadow-md">
          {/* Title */}
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Sign in to your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Or{' '}
              <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
                create a new account
              </Link>
            </p>
          </div>

          {/* Google Sign In */}
          <div className="mt-8">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleGoogleSignIn(e);
              }}
              disabled={loading || isGoogleLoading}
              className={`w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading || isGoogleLoading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
            >
              {isGoogleLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 mr-2"></div>
                  Signing in...
                </>
              ) : (
                <>
                  <FcGoogle className="w-5 h-5 mr-2" />
                  Continue with Google
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with email</span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 
                         1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 
                         11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 
                         10l1.293-1.293a1 1 0 00-1.414-1.414L10 
                         8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Email/Password Form */}
          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Email address
                </label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 
                             placeholder-gray-500 text-gray-900 focus:outline-none 
                             focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || isGoogleLoading}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 
                             placeholder-gray-500 text-gray-900 focus:outline-none 
                             focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading || isGoogleLoading}
                />
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex items-center justify-end">
              <div className="text-sm">
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                  Forgot your password?
                </a>
              </div>
            </div>

            {/* Submit Button */}
            <div className="space-y-4">
              <button
                type="submit"
                disabled={loading || isGoogleLoading || password.length < 6}
                className={`w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${password.length < 6
                  ? 'bg-blue-400'
                  : 'bg-blue-600 hover:bg-blue-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${loading || isGoogleLoading || password.length < 6
                    ? 'opacity-70 cursor-not-allowed'
                    : ''
                  }`}
              >
                {loading ? (
                  <>
                    <FaSpinner className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Signing in...
                  </>
                ) : (
                  'Sign in with Email'
                )}
              </button>

              <div className="text-xs text-gray-500 text-center">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}









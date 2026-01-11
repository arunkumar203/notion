'use client';

import { useState, useEffect } from 'react';
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
  const [message, setMessage] = useState('');

  // 2FA State
  const [show2FAInput, setShow2FAInput] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [multiFactorResolver, setMultiFactorResolver] = useState<any>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [isBackupCode, setIsBackupCode] = useState(false);
  const [isForgotPasswordView, setIsForgotPasswordView] = useState(false);

  const { login, loginWithGoogle, resetPassword, user, loading: authLoading, confirm2FALogin } = useAuth();
  const router = useRouter();

  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await resetPassword(email);
      setMessage('Password reset email sent! Check your inbox (and spam folder).');
    } catch (err: unknown) {
      console.error('Reset password error:', err);
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : 'Failed to send reset email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ... (useEffects)

  const handle2FARequired = (err: any) => {
    if (err.code === '2FA_REQUIRED') {
      setShow2FAInput(true);
      setError('');
      return true;
    }
    // Legacy/Native check (just in case)
    if (err.code === 'auth/multi-factor-auth-required') {
      // Fallback or ignore if we strictly use custom now
      setError('Please use the custom 2FA flow.');
      return false;
    }
    return false;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await login(trimmedEmail, password);
      router.replace('/notebooks');
    } catch (err: unknown) {
      const errorObj = err as any;

      if (errorObj?.code === '2FA_REQUIRED') {
        if (handle2FARequired(errorObj)) {
          setLoading(false);
          return;
        }
      }

      // ... (rest of error handling)
      console.error('Login error:', err);

      const code = errorObj.code;
      const message = errorObj.message;

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
            setError('Your account has been disabled. Please contact admin.');
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
      const user = await loginWithGoogle();
      if (!user) throw new Error('Failed to sign in with Google');
      router.replace('/notebooks');
    } catch (error: unknown) {
      const errorObj = error as any;

      if (errorObj?.code === '2FA_REQUIRED') {
        if (handle2FARequired(errorObj)) {
          setIsGoogleLoading(false);
          return;
        }
      }

      console.error('Google sign in error:', error);

      const code = (error as any).code;
      const message = (error as any).message;

      if (code === 'auth/user-disabled') {
        setError('Your account has been disabled. Please contact admin.');
      } else {
        setError(message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      if (typeof window !== 'undefined') setIsGoogleLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode) return;

    setLoading(true);
    setError('');

    try {
      if (!user) throw new Error('User session not initialized for 2FA');
      const idToken = await user.getIdToken(true);
      await confirm2FALogin(idToken, verificationCode);
      router.replace('/notebooks');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address to reset your password.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await resetPassword(email);
      setMessage('Password reset email sent! Check your inbox (and spam folder).');
    } catch (err: unknown) {
      console.error('Reset password error:', err);
      const msg = typeof err === 'object' && err && 'message' in err ? String((err as { message?: unknown }).message) : 'Failed to send reset email.';
      setError(msg);
    } finally {
      setLoading(false);
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
              {show2FAInput ? 'Two-Step Verification' : 'Sign in to your account'}
            </h2>
            {!show2FAInput && (
              <p className="mt-2 text-center text-sm text-gray-600">
                Or{' '}
                <Link href="/signup" className="font-medium text-blue-600 hover:text-blue-500">
                  create a new account
                </Link>
              </p>
            )}
            {show2FAInput && (
              <p className="mt-2 text-center text-sm text-gray-600">
                {isBackupCode
                  ? 'Enter one of your 8-digit backup codes.'
                  : 'Enter the code from your Google Authenticator app.'}
              </p>
            )}
          </div>

          {/* 2FA Form */}
          {show2FAInput ? (
            <form className="mt-8 space-y-6" onSubmit={handle2FASubmit}>
              <div>
                <label htmlFor="2fa-code" className="sr-only">
                  {isBackupCode ? 'Backup Code' : 'Verification Code'}
                </label>
                <input
                  id="2fa-code"
                  type="text"
                  required
                  className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm text-center tracking-widest text-xl"
                  placeholder={isBackupCode ? '0000 0000' : '000 000'}
                  value={verificationCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                    setVerificationCode(val.slice(0, isBackupCode ? 8 : 6))
                  }}
                  maxLength={isBackupCode ? 8 : 6}
                  autoFocus
                />
              </div>

              {error && <div className="text-red-600 text-sm text-center">{error}</div>}

              <button
                type="submit"
                disabled={loading || verificationCode.length !== (isBackupCode ? 8 : 6)}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>

              <div className="flex flex-col gap-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsBackupCode(!isBackupCode);
                    setVerificationCode('');
                    setError('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                >
                  {isBackupCode ? 'Use Authenticator Code' : 'Use Backup Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShow2FAInput(false); setMultiFactorResolver(null); setError(''); setIsBackupCode(false); }}
                  className="text-sm text-gray-600 hover:text-gray-500"
                >
                  Back to Login
                </button>
              </div>
            </form>
          ) : isForgotPasswordView ? (
            // Forgot Password View
            <div className="mt-8">
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPasswordView(false);
                    setError('');
                    setMessage('');
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center mb-4"
                >
                  ← Back to Login
                </button>
                <h3 className="text-xl font-bold text-gray-900">Reset Password</h3>
                <p className="mt-2 text-sm text-gray-600">
                  Enter your email address and we'll send you a link to reset your password.
                </p>
              </div>

              {/* Error/Success Messages */}
              {error && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-400 p-4">
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

              {message && (
                <div className="mb-4 bg-green-50 border-l-4 border-green-400 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-green-700">{message}</p>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSendResetLink} className="space-y-6">
                <div>
                  <label htmlFor="reset-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <FaSpinner className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Sending...
                    </>
                  ) : (
                    'Send Password Reset Link'
                  )}
                </button>
              </form>
            </div>
          ) : (
            // Normal Login View
            <>
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

              {message && (
                <div className="bg-green-50 border-l-4 border-green-400 p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-green-700">{message}</p>
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
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPasswordView(true);
                        setError('');
                        setMessage('');
                      }}
                      className="font-medium text-blue-600 hover:text-blue-500 bg-transparent border-none p-0 cursor-pointer"
                    >
                      Forgot your password?
                    </button>
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
            </>
          )}

        </div>
      </div>
    </div>
  );
}









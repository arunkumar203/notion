'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { sendEmailVerification, reload } from 'firebase/auth';
import { FiMail, FiRefreshCw, FiCheck, FiAlertCircle, FiLogIn } from 'react-icons/fi';
import Link from 'next/link';
import { getAdminSettings } from '../../lib/admin-settings';

export default function VerifyEmailPage() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [isResending, setIsResending] = useState(false);
    const [resendMessage, setResendMessage] = useState('');
    const [isChecking, setIsChecking] = useState(false);
    const [checkMessage, setCheckMessage] = useState('');

    const [emailSendingEnabled, setEmailSendingEnabled] = useState(true);
    const [loadingSettings, setLoadingSettings] = useState(true);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!user || !emailSendingEnabled || loadingSettings || user.emailVerified) {
            if (user?.emailVerified) {
                setCheckMessage('Your email is verified! You can now log in.');
            }
            return;
        }

        const checkVerification = async () => {
            try {
                await reload(user);
                if (user.emailVerified) {
                    setCheckMessage('Your email is verified! You can now log in.');
                    if (intervalRef.current) {
                        clearInterval(intervalRef.current);
                        intervalRef.current = null;
                    }
                }
            } catch (error) {
                console.error('Error checking verification status:', error);
            }
        };

        checkVerification();
        intervalRef.current = setInterval(checkVerification, 3000);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [user, emailSendingEnabled, loadingSettings]);

    useEffect(() => {
        if (!user) {
            router.replace('/login');
        }
    }, [user, router]);

    useEffect(() => {
        if (user?.emailVerified) {
            setCheckMessage('Your email is verified! You can now log in.');
        }
    }, [user?.emailVerified]);

    useEffect(() => {
        const checkEmailSettings = async () => {
            try {
                const data = await getAdminSettings();
                setEmailSendingEnabled(data.emailSendingEnabled);
            } catch (error) {
                console.error('Error checking email settings:', error);
                setEmailSendingEnabled(true);
            } finally {
                setLoadingSettings(false);
            }
        };

        checkEmailSettings();
    }, []);

    const handleResendEmail = async () => {
        if (!user || isResending || user.emailVerified || !emailSendingEnabled) return;

        setIsResending(true);
        setResendMessage('');

        try {
            await sendEmailVerification(user);
            setResendMessage('Verification email sent! Check your inbox and spam folder.');
        } catch (error: any) {
            console.error('Error sending verification email:', error);
            setResendMessage(`Error: ${error.message || 'Failed to send verification email'}`);
        } finally {
            setIsResending(false);
        }
    };

    const handleCheckVerification = async () => {
        if (!user || isChecking || user.emailVerified) return;

        setIsChecking(true);
        setCheckMessage('');

        try {
            await reload(user);
            if (user.emailVerified) {
                setCheckMessage('Your email is verified! You can now log in.');
            } else {
                setCheckMessage('Email not verified yet. Please check your inbox and click the verification link.');
            }
        } catch (error: any) {
            console.error('Error checking verification:', error);
            setCheckMessage(`Error: ${error.message || 'Failed to check verification status'}`);
        } finally {
            setIsChecking(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/');
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };



    const isVerified = user ? Boolean(user.emailVerified) : false;

    // If user is not logged in, redirect to login
    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="text-center">
                    <div className="mx-auto h-16 w-16 bg-indigo-100 rounded-full flex items-center justify-center">
                        <FiMail className="h-8 w-8 text-indigo-600" />
                    </div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        {!loadingSettings && !emailSendingEnabled ? 'Email Verification' : 'Verify your email'}
                    </h2>
                    {!loadingSettings && emailSendingEnabled ? (
                        <p className="mt-2 text-center text-sm text-gray-600">
                            We sent a verification link to{' '}
                            <span className="font-medium text-indigo-600">{user.email}</span>
                        </p>
                    ) : !loadingSettings ? (
                        <p className="mt-2 text-center text-sm text-gray-600">
                            Account: <span className="font-medium text-indigo-600">{user.email}</span>
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
                    <div className="space-y-6">
                        {!loadingSettings && emailSendingEnabled && !isVerified && (
                            <div className="border rounded-md p-4 bg-blue-50 border-blue-200">
                                <div className="flex">
                                    <FiAlertCircle className="h-5 w-5 mt-0.5 text-blue-400" />
                                    <div className="ml-3">
                                        <h3 className="text-sm font-medium text-blue-800">
                                            Please keep this tab open
                                        </h3>
                                        <div className="mt-2 text-sm text-blue-700">
                                            <p>
                                                1. Check your email inbox (and spam folder)<br />
                                                2. Click the verification link in the email<br />
                                                3. Come back here to continue
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!loadingSettings && emailSendingEnabled && !isVerified && (
                            <div className="text-center">
                                <div className="inline-flex items-center text-sm text-gray-600">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                                    Automatically checking verification status...
                                </div>
                            </div>
                        )}

                        {isVerified && (
                            <div className="bg-green-50 border border-green-200 rounded-md p-4 space-y-3">
                                <div className="flex items-start">
                                    <FiCheck className="h-5 w-5 text-green-500 mt-0.5" />
                                    <div className="ml-3">
                                        <h3 className="text-sm font-semibold text-green-800">
                                            Email verified successfully
                                        </h3>
                                        <p className="mt-1 text-sm text-green-700">
                                            Your email is verified. Please log in to access your notebooks.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-center">
                                    <Link
                                        href="/login"
                                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md"
                                    >
                                        <FiLogIn className="h-4 w-4 mr-2" />
                                        Go to login
                                    </Link>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleCheckVerification}
                            disabled={isChecking || isVerified}
                            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isChecking ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    Checking...
                                </>
                            ) : (
                                <>
                                    <FiCheck className="h-4 w-4 mr-2" />
                                    Check Verification Status
                                </>
                            )}
                        </button>

                        {checkMessage && (
                            <div className={`text-sm text-center ${checkMessage.includes('verified')
                                ? 'text-green-600'
                                : checkMessage.includes('Error')
                                    ? 'text-red-600'
                                    : 'text-gray-600'
                                }`}>
                                {checkMessage}
                            </div>
                        )}

                        <button
                            onClick={handleResendEmail}
                            disabled={isResending || !emailSendingEnabled || isVerified}
                            className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isResending ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <FiRefreshCw className="h-4 w-4 mr-2" />
                                    Resend Verification Email
                                </>
                            )}
                        </button>

                        {!loadingSettings && !emailSendingEnabled && (
                            <div className="border-t border-gray-200 pt-4">
                                <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                                    <div className="flex">
                                        <FiAlertCircle className="h-5 w-5 text-orange-400 mt-0.5" />
                                        <div className="ml-3">
                                            <h3 className="text-sm font-medium text-orange-800">
                                                Email Verification Temporarily Disabled
                                            </h3>
                                            <div className="mt-2 text-sm text-orange-700">
                                                <p>
                                                    The system administrator has temporarily disabled email verification.
                                                    Please wait for admin approval or contact support.
                                                </p>
                                                <p className="mt-2">
                                                    <strong>Note:</strong> There may be issues with email delivery at the moment.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {resendMessage && (
                            <div className={`text-sm text-center ${resendMessage.includes('sent')
                                ? 'text-green-600'
                                : 'text-red-600'
                                }`}>
                                {resendMessage}
                            </div>
                        )}

                        <div className="text-center">
                            <button
                                onClick={handleSignOut}
                                className="text-sm text-gray-500 hover:text-gray-700 underline"
                            >
                                Sign out and use a different account
                            </button>
                        </div>

                        <div className="text-center">
                            <Link
                                href="/"
                                className="text-sm text-indigo-600 hover:text-indigo-500"
                            >
                                Back to home
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

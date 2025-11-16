'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import { FiSettings, FiArrowLeft, FiMail, FiCheck, FiX, FiUser } from 'react-icons/fi';
import Link from 'next/link';

interface AdminSettings {
    emailSendingEnabled: boolean;
    showCreatorAttribution: boolean;
    homePageMessage: string;
    onboardingMandatory: boolean;
    allowNewUserSignup: boolean;
}

export default function AdminSettingsPage() {
    const { user, loading: authLoading } = useAuth();
    const { canAccessAdmin, isRootAdmin, role, loading: roleLoading } = useUserRole();
    const router = useRouter();
    const [settings, setSettings] = useState<AdminSettings>({
        emailSendingEnabled: true,
        showCreatorAttribution: true,
        homePageMessage: '',
        onboardingMandatory: false,
        allowNewUserSignup: true,
    });
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<keyof AdminSettings | null>(null);
    const [savingMessage, setSavingMessage] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Redirect if not admin or root_admin
    useEffect(() => {
        if (!authLoading && !roleLoading) {


            if (!user) {

                router.replace('/login');
                return;
            }
            if (!canAccessAdmin) {

                router.replace('/notebooks');
                return;
            }


        }
    }, [user, canAccessAdmin, authLoading, roleLoading, router, role, isRootAdmin]);

    // Fetch settings
    useEffect(() => {
        const fetchSettings = async () => {
            if (!user || !canAccessAdmin) return;

            try {
                setLoading(true);
                setError(null);

                const response = await fetch('/api/admin/settings', {
                    method: 'GET',
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch settings');
                }

                const data = await response.json();
                setSettings({
                    emailSendingEnabled: data.settings?.emailSendingEnabled ?? true,
                    showCreatorAttribution: data.settings?.showCreatorAttribution ?? true,
                    homePageMessage: data.settings?.homePageMessage ?? '',
                    onboardingMandatory: data.settings?.onboardingMandatory ?? false,
                    allowNewUserSignup: data.settings?.allowNewUserSignup ?? true,
                });
            } catch (error: any) {
                console.error('Error fetching settings:', error);
                setError(error.message || 'Failed to load settings');
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user, canAccessAdmin]);

    const handleToggleSetting = async (key: keyof AdminSettings) => {
        if (!isRootAdmin || savingKey) return;

        setSavingKey(key);
        setError(null);
        setSuccess(null);

        try {
            const newValue = !settings[key];

            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: newValue }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                setSettings(prev => ({ ...prev, [key]: newValue }));

                let successMessage = '';
                if (key === 'emailSendingEnabled') {
                    successMessage = `Email sending ${newValue ? 'enabled' : 'disabled'} successfully`;
                } else if (key === 'showCreatorAttribution') {
                    successMessage = `Creator attribution ${newValue ? 'enabled' : 'disabled'} successfully`;
                } else if (key === 'onboardingMandatory') {
                    successMessage = `Onboarding ${newValue ? 'made mandatory' : 'made optional'} successfully`;
                } else if (key === 'allowNewUserSignup') {
                    successMessage = `New user signup ${newValue ? 'enabled' : 'disabled'} successfully`;
                }

                setSuccess(successMessage);
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(result.error || 'Failed to update settings');
            }
        } catch (error: any) {
            setError(`Error: ${error.message}`);
        } finally {
            setSavingKey(null);
        }
    };

    const handleSaveHomeMessage = async () => {
        if (!isRootAdmin || savingMessage) return;

        setSavingMessage(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homePageMessage: settings.homePageMessage }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                setSuccess('Home page message updated successfully');
                setTimeout(() => setSuccess(null), 3000);
            } else {
                setError(result.error || 'Failed to update home page message');
            }
        } catch (error: any) {
            setError(`Error: ${error.message}`);
        } finally {
            setSavingMessage(false);
        }
    };

    const isSavingEmail = savingKey === 'emailSendingEnabled';
    const isSavingAttribution = savingKey === 'showCreatorAttribution';
    const isSavingOnboarding = savingKey === 'onboardingMandatory';
    const isSavingSignup = savingKey === 'allowNewUserSignup';

    // Show loading while checking auth
    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                    <p className="mt-2 text-gray-600">Loading...</p>
                </div>
            </div>
        );
    }

    // Don't render anything if not admin (redirect will handle it)
    if (!user || !canAccessAdmin) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div className="flex items-center">
                            <Link
                                href="/admin/dashboard"
                                className="mr-4 p-2 rounded-md text-gray-400 hover:text-gray-600"
                            >
                                <FiArrowLeft className="h-5 w-5" />
                            </Link>
                            <FiSettings className="h-8 w-8 text-indigo-600 mr-3" />
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
                                <p className="text-sm text-gray-500">Manage system-wide settings</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* View-only notice for admin users */}
                {!isRootAdmin && (
                    <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <FiSettings className="h-5 w-5 text-blue-400" />
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-blue-800">View Only Access</h3>
                                <p className="text-sm text-blue-700 mt-1">
                                    You can view these settings but only Root Admins can make changes.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Status Messages */}
                {(error || success) && (
                    <div className="mb-8 space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <FiX className="h-5 w-5 text-red-400" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700">{error}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {success && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <FiCheck className="h-5 w-5 text-green-400" />
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-green-700">{success}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Settings Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column */}
                    <div className="space-y-8">

                        {/* Email Settings */}
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg rounded-2xl border border-blue-100 p-6 hover:shadow-xl transition-shadow duration-300">
                            <div className="flex items-center mb-6">
                                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiMail className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-xl font-bold text-gray-900">Email System</h3>
                                    <p className="text-sm text-blue-600 font-medium">Verification & Communication</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-gray-900">Email Verification</h4>
                                            <p className="text-xs text-gray-600 mt-1">Automatically send verification emails to new users</p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${settings.emailSendingEnabled ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                                                {isSavingEmail ? 'Updating...' : (settings.emailSendingEnabled ? 'Active' : 'Disabled')}
                                            </span>
                                            <button
                                                onClick={() => handleToggleSetting('emailSendingEnabled')}
                                                disabled={isSavingEmail || !isRootAdmin}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${settings.emailSendingEnabled ? 'bg-blue-600' : 'bg-gray-300'} ${(isSavingEmail || !isRootAdmin) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.emailSendingEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                                        <strong>When enabled:</strong> New users receive verification emails and can access the app after confirming their email address.<br />
                                        <strong>When disabled:</strong> Users see a message that admin approval is required instead of email verification.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* User Signup Settings */}
                        <div className="bg-gradient-to-br from-red-50 to-rose-50 shadow-lg rounded-2xl border border-red-100 p-6 hover:shadow-xl transition-shadow duration-300">
                            <div className="flex items-center mb-6">
                                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiUser className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-xl font-bold text-gray-900">User Registration</h3>
                                    <p className="text-sm text-red-600 font-medium">New Account Creation</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-gray-900">Allow New User Signup</h4>
                                            <p className="text-xs text-gray-600 mt-1">Control whether new users can create accounts</p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${settings.allowNewUserSignup ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'}`}>
                                                {isSavingSignup ? 'Updating...' : (settings.allowNewUserSignup ? 'Open' : 'Closed')}
                                            </span>
                                            <button
                                                onClick={() => handleToggleSetting('allowNewUserSignup')}
                                                disabled={isSavingSignup || !isRootAdmin}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${settings.allowNewUserSignup ? 'bg-green-600' : 'bg-red-600'} ${(isSavingSignup || !isRootAdmin) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.allowNewUserSignup ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                                        <strong>When enabled:</strong> New users can sign up with email/password or Google OAuth.<br />
                                        <strong>When disabled:</strong> Signup page shows a message that registration is closed. All signup fields are disabled and users cannot create new accounts.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Onboarding Settings */}
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 shadow-lg rounded-2xl border border-purple-100 p-6 hover:shadow-xl transition-shadow duration-300">
                            <div className="flex items-center mb-6">
                                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiUser className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-xl font-bold text-gray-900">User Onboarding</h3>
                                    <p className="text-sm text-purple-600 font-medium">First-Time User Experience</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-gray-900">Mandatory Onboarding</h4>
                                            <p className="text-xs text-gray-600 mt-1">Require new users to complete setup process</p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${settings.onboardingMandatory ? 'text-orange-700 bg-orange-100' : 'text-green-700 bg-green-100'}`}>
                                                {isSavingOnboarding ? 'Updating...' : (settings.onboardingMandatory ? 'Required' : 'Optional')}
                                            </span>
                                            <button
                                                onClick={() => handleToggleSetting('onboardingMandatory')}
                                                disabled={isSavingOnboarding || !isRootAdmin}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${settings.onboardingMandatory ? 'bg-purple-600' : 'bg-gray-300'} ${(isSavingOnboarding || !isRootAdmin) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.onboardingMandatory ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                                        <strong>When required:</strong> New users must create a sample workspace and cannot skip the onboarding process.<br />
                                        <strong>When optional:</strong> Users can choose to skip onboarding and start with an empty workspace.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-8">

                        {/* Home Page Attribution */}
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg rounded-2xl border border-amber-100 p-6 hover:shadow-xl transition-shadow duration-300">
                            <div className="flex items-center mb-6">
                                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiUser className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-xl font-bold text-gray-900">Landing Page</h3>
                                    <p className="text-sm text-amber-600 font-medium">Public Page Branding</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-semibold text-gray-900">Creator Attribution</h4>
                                            <p className="text-xs text-gray-600 mt-1">Display creator credit badge on home page</p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${settings.showCreatorAttribution ? 'text-blue-700 bg-blue-100' : 'text-gray-700 bg-gray-100'}`}>
                                                {isSavingAttribution ? 'Updating...' : (settings.showCreatorAttribution ? 'Visible' : 'Hidden')}
                                            </span>
                                            <button
                                                onClick={() => handleToggleSetting('showCreatorAttribution')}
                                                disabled={isSavingAttribution || !isRootAdmin}
                                                className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${settings.showCreatorAttribution ? 'bg-amber-600' : 'bg-gray-300'} ${(isSavingAttribution || !isRootAdmin) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                            >
                                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.showCreatorAttribution ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                                        <strong>When visible:</strong> Shows "App created by R. Arun Kumar" badge beneath the hero header on the landing page.<br />
                                        <strong>When hidden:</strong> Badge is removed for a cleaner, professional marketing experience.
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Home Page Message */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 shadow-lg rounded-2xl border border-green-100 p-6 hover:shadow-xl transition-shadow duration-300">
                            <div className="flex items-center mb-6">
                                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <FiSettings className="h-6 w-6 text-white" />
                                </div>
                                <div className="ml-4">
                                    <h3 className="text-xl font-bold text-gray-900">Announcements</h3>
                                    <p className="text-sm text-green-600 font-medium">Home Page Messages</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-white/50">
                                    <label htmlFor="homePageMessage" className="block text-sm font-semibold text-gray-900 mb-3">
                                        Toast Notification
                                    </label>
                                    <div className="space-y-3">
                                        <textarea
                                            id="homePageMessage"
                                            rows={3}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 disabled:bg-gray-100 disabled:text-gray-500 text-sm"
                                            placeholder="Enter a message to show as a toast on the home page (leave empty to disable)"
                                            value={settings.homePageMessage}
                                            onChange={(e) => setSettings(prev => ({ ...prev, homePageMessage: e.target.value }))}
                                            disabled={!isRootAdmin}
                                        />
                                        <div className="flex justify-end">
                                            <button
                                                onClick={handleSaveHomeMessage}
                                                disabled={savingMessage || !isRootAdmin}
                                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${savingMessage || !isRootAdmin ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'}`}
                                            >
                                                {savingMessage ? 'Saving...' : 'Save Message'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 mt-3">
                                        <strong>How it works:</strong> Message appears as a 5-second toast notification when users visit the home page.<br />
                                        <strong>Use cases:</strong> System announcements, maintenance notices, feature updates, or promotional messages.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
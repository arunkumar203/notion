'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import { ref, update } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { FiUsers, FiArrowLeft, FiEdit2, FiCheck, FiX, FiShield, FiUser, FiUserX, FiTrash2, FiMoreVertical, FiSearch, FiRefreshCw } from 'react-icons/fi';
import Link from 'next/link';

interface User {
    uid: string;
    email: string;
    role: string;
    createdAt: number;
    lastLoginAt?: number;
    workspaceCount: number;
    notebookCount: number;
    disabled?: boolean;
    emailVerified?: boolean;
}

export default function AdminUsersPage() {
    const { user, loading: authLoading } = useAuth();
    const { role, loading: roleLoading, canAccessAdmin, canManageUsers } = useUserRole();
    const router = useRouter();
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null);
    const [processingActions, setProcessingActions] = useState<Record<string, 'enable' | 'disable' | 'delete' | 'role' | null>>({});
    const [processingEmailVerified, setProcessingEmailVerified] = useState<string | null>(null);

    // Redirect if not admin
    useEffect(() => {
        if (!authLoading && !roleLoading) {
            if (!user) {
                router.replace('/login');
                return;
            }
            if (!canAccessAdmin) {
                router.replace('/workspaces');
                return;
            }
        }
    }, [user, canAccessAdmin, authLoading, roleLoading, router]);

    // Fetch users
    useEffect(() => {
        const fetchUsers = async () => {
            if (!user || !canAccessAdmin) return;

            try {
                setLoading(true);
                setError(null);

                const response = await fetch('/api/admin/users', {
                    method: 'GET',
                    credentials: 'include'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to fetch users');
                }

                const data = await response.json();
                setUsers(data.users || []);
            } catch (error: any) {
                console.error('Error fetching users:', error);
                setError(error.message || 'Failed to load users');
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, [user, canAccessAdmin]);

    // Filter users based on search query
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredUsers(users);
        } else {
            const filtered = users.filter(user =>
                user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                user.uid.toLowerCase().includes(searchQuery.toLowerCase())
            );
            setFilteredUsers(filtered);
        }
    }, [users, searchQuery]);

    // Close action menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (actionMenuOpen) {
                // Check if the click is inside an action menu
                const target = event.target as HTMLElement;
                const actionMenu = target.closest('.action-menu');
                if (!actionMenu) {
                    setActionMenuOpen(null);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [actionMenuOpen]);

    const handleRoleChange = async (uid: string, newRole: string) => {
        if (!canManageUsers) return;

        setProcessingActions(prev => ({ ...prev, [uid]: 'role' }));
        try {
            const userRef = ref(rtdb, `users/${uid}/role`);
            await update(ref(rtdb, `users/${uid}`), { role: newRole });

            // Update local state
            setUsers(users.map(u =>
                u.uid === uid ? { ...u, role: newRole } : u
            ));
        } catch (error) {
            console.error('Error updating user role:', error);
            setError('Failed to update user role');
        } finally {
            setProcessingActions(prev => {
                const newState = { ...prev };
                delete newState[uid];
                return newState;
            });
        }
    };

    const handleEmailVerifiedChange = async (uid: string, emailVerified: boolean) => {
        if (!canManageUsers) return;

        setProcessingEmailVerified(uid);
        try {
            const response = await fetch('/api/admin/update-email-verified', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, emailVerified }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                // Update local state
                setUsers(users.map(u =>
                    u.uid === uid ? { ...u, emailVerified } : u
                ));
                setError(null);
            } else {
                setError(result.error || 'Failed to update email verified status');
            }
        } catch (error: any) {
            console.error('Error updating email verified status:', error);
            setError(`Error: ${error.message}`);
        } finally {
            setProcessingEmailVerified(null);
        }
    };

    const handleToggleUserStatus = async (uid: string, disabled: boolean) => {
        if (!canManageUsers) return;

        setProcessingActions(prev => ({ ...prev, [uid]: disabled ? 'disable' : 'enable' }));
        try {
            const response = await fetch('/api/admin/toggle-user-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, disabled }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                await refreshUsers();
                setActionMenuOpen(null);
                setError(null);
            } else {
                setError(result.error || 'Failed to update user status');
            }
        } catch (error: any) {
            setError(`Error: ${error.message}`);
        } finally {
            setProcessingActions(prev => {
                const newState = { ...prev };
                delete newState[uid];
                return newState;
            });
        }
    };

    // Refresh users list (useful after status changes)
    const refreshUsers = async () => {
        if (!user || !canAccessAdmin || refreshing) return;

        try {
            setRefreshing(true);
            setError(null);

            const response = await fetch('/api/admin/users', {
                method: 'GET',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to refresh users');
            }
        } catch (error: any) {
            console.error('Error refreshing users:', error);
            setError(error.message || 'Failed to refresh users');
        } finally {
            setRefreshing(false);
        }
    };

    const handleDeleteUser = async (uid: string, email: string) => {
        if (!canManageUsers) return;

        // Prevent multiple deletions of the same user
        if (processingActions[uid]) return;

        const confirmed = window.confirm(
            `Are you sure you want to permanently delete the account for ${email}?\n\n` +
            'This will delete:\n' +
            '• All their workspaces\n' +
            '• All their notebooks, sections, topics, and pages\n' +
            '• All their shared links\n' +
            '• All their secret notes\n' +
            '• Their user account\n\n' +
            'This action cannot be undone!'
        );

        if (!confirmed) return;

        setProcessingActions(prev => ({ ...prev, [uid]: 'delete' }));
        try {
            const response = await fetch('/api/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid }),
                credentials: 'include'
            });

            const result = await response.json();

            if (response.ok) {
                // Remove user from local state
                setUsers(users.filter(u => u.uid !== uid));
                setActionMenuOpen(null);
            } else {
                setError(result.error || 'Failed to delete user');
            }
        } catch (error: any) {
            setError(`Error: ${error.message}`);
        } finally {
            setProcessingActions(prev => {
                const newState = { ...prev };
                delete newState[uid];
                return newState;
            });
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getRoleIcon = (role: string) => {
        if (role === 'root_admin') return FiShield;
        if (role === 'admin') return FiUser;
        return FiUser;
    };

    const getRoleBadgeColor = (role: string) => {
        if (role === 'root_admin') return 'bg-red-100 text-red-800';
        if (role === 'admin') return 'bg-yellow-100 text-yellow-800';
        return 'bg-blue-100 text-blue-800';
    };

    // Show loading while checking auth and role
    if (authLoading || roleLoading) {
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
                            <FiUsers className="h-8 w-8 text-indigo-600 mr-3" />
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                                <p className="text-sm text-gray-500">Manage user accounts and roles</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* View-only notice for admin users */}
                {!canManageUsers && (
                    <div className="mb-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <FiUsers className="h-5 w-5 text-blue-400" />
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

                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
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

                {/* Users Table */}
                <div className="bg-white shadow rounded-lg overflow-hidden">
                    <div className="px-4 py-5 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2 sm:mb-0">
                                All Users ({filteredUsers.length}{searchQuery && ` of ${users.length}`})
                            </h3>
                            <div className="flex items-center space-x-3">
                                {/* Search Bar */}
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <FiSearch className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search by email..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                </div>
                                {/* Reload Button */}
                                <button
                                    onClick={refreshUsers}
                                    disabled={refreshing || loading}
                                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <FiRefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                                    <span className="ml-2 hidden sm:inline">
                                        {refreshing ? 'Refreshing...' : 'Refresh'}
                                    </span>
                                </button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
                                <p className="mt-2 text-gray-600">Loading users...</p>
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="text-center py-8">
                                <FiUsers className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-500">
                                    {searchQuery ? 'No users match your search' : 'No users found'}
                                </p>
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="mt-2 text-sm text-indigo-600 hover:text-indigo-500"
                                    >
                                        Clear search
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="overflow-hidden">
                                <table className="w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4">
                                                User
                                            </th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                                                Role
                                            </th>
                                            <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                                                Workspaces
                                            </th>
                                            <th className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                                                Notebooks
                                            </th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                                                Created
                                            </th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                                                Status
                                            </th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                                                Verified
                                            </th>
                                            <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {filteredUsers.map((userData) => {
                                            const RoleIcon = getRoleIcon(userData.role);
                                            return (
                                                <tr key={userData.uid} className="hover:bg-gray-50">
                                                    <td className="px-3 py-3">
                                                        <div className="flex items-center">
                                                            <div className="flex-shrink-0 h-8 w-8">
                                                                <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                                                                    <span className="text-xs font-medium text-gray-700">
                                                                        {userData.email.charAt(0).toUpperCase()}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="ml-2 min-w-0 flex-1">
                                                                <div className="text-sm font-medium text-gray-900 truncate">
                                                                    {userData.email}
                                                                </div>
                                                                <div className="text-xs text-gray-500">
                                                                    {userData.uid.substring(0, 8)}...
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <div className="flex items-center">
                                                            {canManageUsers && userData.uid !== user.uid && userData.role !== 'root_admin' ? (
                                                                <div className="relative">
                                                                    {processingActions[userData.uid] === 'role' ? (
                                                                        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400 mr-1"></div>
                                                                            Updating...
                                                                        </div>
                                                                    ) : (
                                                                        <select
                                                                            value={userData.role}
                                                                            onChange={(e) => handleRoleChange(userData.uid, e.target.value)}
                                                                            className={`appearance-none text-xs font-medium border border-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-full px-2 py-1 pr-6 ${getRoleBadgeColor(userData.role)}`}
                                                                        >
                                                                            <option value="user">User</option>
                                                                            <option value="admin">Admin</option>
                                                                        </select>
                                                                    )}
                                                                    {processingActions[userData.uid] !== 'role' && (
                                                                        <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
                                                                            <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(userData.role)}`}>
                                                                    <RoleIcon className="h-3 w-3 mr-1" />
                                                                    {userData.role === 'root_admin' ? 'Root' : userData.role}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-sm text-gray-900 text-center">
                                                        {userData.workspaceCount}
                                                    </td>
                                                    <td className="px-2 py-3 text-sm text-gray-900 text-center">
                                                        {userData.notebookCount}
                                                    </td>
                                                    <td className="px-2 py-3 text-xs text-gray-500">
                                                        {new Date(userData.createdAt).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <div className="flex items-center">
                                                            {userData.disabled ? (
                                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                                                    <FiUserX className="h-3 w-3 mr-1" />
                                                                    Disabled
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                    <FiUser className="h-3 w-3 mr-1" />
                                                                    Enabled
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <div className="flex items-center">
                                                            {canManageUsers && userData.uid !== user.uid && userData.role !== 'root_admin' ? (
                                                                <div className="relative">
                                                                    {processingEmailVerified === userData.uid ? (
                                                                        <div className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400 mr-1"></div>
                                                                            Updating...
                                                                        </div>
                                                                    ) : (
                                                                        <select
                                                                            value={userData.emailVerified ? 'verified' : 'not_verified'}
                                                                            onChange={(e) => handleEmailVerifiedChange(userData.uid, e.target.value === 'verified')}
                                                                            className={`appearance-none text-xs font-medium border border-gray-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 rounded-full px-2 py-1 pr-6 ${userData.emailVerified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
                                                                        >
                                                                            <option value="verified">✅ Yes</option>
                                                                            <option value="not_verified">❌ No</option>
                                                                        </select>
                                                                    )}
                                                                    {processingEmailVerified !== userData.uid && (
                                                                        <div className="absolute inset-y-0 right-0 flex items-center pr-1 pointer-events-none">
                                                                            <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                            </svg>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                userData.emailVerified ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                        <FiCheck className="h-3 w-3 mr-1" />
                                                                        Yes
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                                                        <FiX className="h-3 w-3 mr-1" />
                                                                        No
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-3 text-sm font-medium">
                                                        {canManageUsers && userData.uid !== user.uid && userData.role !== 'root_admin' ? (
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setActionMenuOpen(actionMenuOpen === userData.uid ? null : userData.uid)}
                                                                    className="text-gray-400 hover:text-gray-600 p-1 rounded"
                                                                    disabled={!!processingActions[userData.uid]}
                                                                >
                                                                    {processingActions[userData.uid] ? (
                                                                        <div className="flex items-center text-xs text-gray-600">
                                                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1"></div>
                                                                            {processingActions[userData.uid] === 'enable' && 'Enabling...'}
                                                                            {processingActions[userData.uid] === 'disable' && 'Disabling...'}
                                                                            {processingActions[userData.uid] === 'delete' && 'Deleting...'}
                                                                        </div>
                                                                    ) : (
                                                                        <FiMoreVertical className="h-4 w-4" />
                                                                    )}
                                                                </button>

                                                                {actionMenuOpen === userData.uid && (
                                                                    <div className="action-menu absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                handleToggleUserStatus(userData.uid, !userData.disabled);
                                                                            }}
                                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center"
                                                                        >
                                                                            {userData.disabled ? (
                                                                                <>
                                                                                    <FiUser className="h-4 w-4 mr-2 text-green-600" />
                                                                                    <span className="text-green-600">Enable User</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <FiUserX className="h-4 w-4 mr-2 text-orange-600" />
                                                                                    <span className="text-orange-600">Disable User</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteUser(userData.uid, userData.email)}
                                                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center text-red-600"
                                                                        >
                                                                            <FiTrash2 className="h-4 w-4 mr-2" />
                                                                            Delete Account
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : userData.uid === user.uid ? (
                                                            <span className="text-gray-400 text-xs">Current User</span>
                                                        ) : userData.role === 'root_admin' ? (
                                                            <span className="text-gray-400 text-xs">Root Admin</span>
                                                        ) : (
                                                            <span className="text-gray-400 text-xs">View Only</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
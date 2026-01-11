'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiMail, FiUser, FiCheck, FiLoader, FiAlertCircle } from 'react-icons/fi';
import { ASSIGNABLE_ROLES, type WorkspaceRole } from '@/lib/workspace-permissions';
import { logAction } from '@/lib/audit-logs';
import { useAuth } from '@/context/AuthContext';

interface InviteMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceId: string;
    workspaceName: string;
    onInviteSent?: () => void;
}

const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
    owner: 'Full control of workspace',
    admin: 'Can manage members and all content',
    editor: 'Can create, edit, and delete content',
    commenter: 'Can view and comment only',
    viewer: 'Read-only access',
};

export default function InviteMemberModal({
    isOpen,
    onClose,
    workspaceId,
    workspaceName,
    onInviteSent,
}: InviteMemberModalProps) {
    const { user } = useAuth();
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>('editor');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setRole('editor');
            setError('');
            setSuccess(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || isSubmitting) return;

        setIsSubmitting(true);
        setError('');

        try {
            const res = await fetch('/api/workspaces/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId,
                    email: email.trim().toLowerCase(),
                    role,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to send invite');
            }

            setSuccess(true);
            onInviteSent?.();

            // Audit Log
            if (user) {
                logAction({
                    workspaceId,
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.displayName || '',
                    action: 'INVITE_SENT',
                    targetId: email.trim().toLowerCase(),
                    targetName: email.trim().toLowerCase(),
                    details: `Invited as ${role}`,
                });
            }

            // Close after a short delay
            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (err: any) {
            setError(err.message || 'Failed to send invite');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Invite Member</h2>
                        <p className="text-sm text-gray-500 mt-0.5">to {workspaceName}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Email */}
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                            Email Address
                        </label>
                        <div className="relative">
                            <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="colleague@example.com"
                                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                required
                                disabled={isSubmitting || success}
                            />
                        </div>
                    </div>

                    {/* Role Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role
                        </label>
                        <div className="space-y-2">
                            {ASSIGNABLE_ROLES.map((r) => (
                                <label
                                    key={r}
                                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-all ${role === r
                                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={r}
                                        checked={role === r}
                                        onChange={() => setRole(r as WorkspaceRole)}
                                        className="sr-only"
                                        disabled={isSubmitting || success}
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <FiUser size={16} className={role === r ? 'text-indigo-600' : 'text-gray-400'} />
                                            <span className={`font-medium capitalize ${role === r ? 'text-indigo-700' : 'text-gray-700'}`}>
                                                {r}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5 ml-6">
                                            {ROLE_DESCRIPTIONS[r]}
                                        </p>
                                    </div>
                                    {role === r && (
                                        <FiCheck className="text-indigo-600" size={20} />
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                            <FiAlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {success && (
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                            <FiCheck size={18} />
                            <span>Invite sent successfully!</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || success || !email.trim()}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <FiLoader className="animate-spin" size={16} />
                                    Sending...
                                </>
                            ) : success ? (
                                <>
                                    <FiCheck size={16} />
                                    Sent!
                                </>
                            ) : (
                                'Send Invite'
                            )}
                        </button>
                    </div>
                </form>

                {/* Footer note */}
                <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                        Invites expire after 7 days if not accepted
                    </p>
                </div>
            </div>
        </div>
    );
}

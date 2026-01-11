'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiClock, FiCheck, FiXCircle, FiLoader, FiUsers, FiMail } from 'react-icons/fi';
import { type WorkspaceRole } from '@/lib/workspace-permissions';
import { logAction } from '@/lib/audit-logs';
import { useAuth } from '@/context/AuthContext';

interface Invite {
    id: string;
    email: string;
    workspaceId: string;
    workspaceName: string;
    workspaceOwnerId: string;
    role: WorkspaceRole;
    invitedBy: string;
    invitedAt: number;
    expiresAt: number;
}

interface PendingInvitesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInviteProcessed?: () => void;
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    editor: 'bg-blue-100 text-blue-700',
    commenter: 'bg-green-100 text-green-700',
    viewer: 'bg-gray-100 text-gray-700',
};

export default function PendingInvitesModal({
    isOpen,
    onClose,
    onInviteProcessed,
}: PendingInvitesModalProps) {
    const { user } = useAuth();
    const [invites, setInvites] = useState<Invite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Fetch invites when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchInvites();
        }
    }, [isOpen]);

    const fetchInvites = async () => {
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch('/api/invites');
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch invites');
            }

            setInvites(data.invites || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch invites');
        } finally {
            setIsLoading(false);
        }
    };

    const handleInviteAction = async (inviteId: string, action: 'accept' | 'reject') => {
        setActionLoading(inviteId);

        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId, action }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || `Failed to ${action} invite`);
            }

            // Remove from list
            setInvites((prev) => prev.filter((i) => i.id !== inviteId));
            onInviteProcessed?.();

            if (action === 'accept') {
                // Audit Log
                const invite = invites.find(i => i.id === inviteId);
                if (user && invite) {
                    logAction({
                        workspaceId: invite.workspaceId,
                        userId: user.uid,
                        userEmail: user.email || '',
                        userName: user.displayName || '',
                        action: 'INVITE_ACCEPTED',
                        targetId: user.uid,
                        targetName: user.email || '',
                        details: `Joined as ${invite.role}`,
                    });
                }
                // Optionally redirect or show success
                alert(`You are now a ${data.workspace?.role || 'member'} of "${data.workspace?.name}"`);
            }
        } catch (err: any) {
            alert(err.message || `Failed to ${action} invite`);
        } finally {
            setActionLoading(null);
        }
    };

    const formatTimeRemaining = (expiresAt: number) => {
        const now = Date.now();
        const remaining = expiresAt - now;

        if (remaining <= 0) return 'Expired';

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) return `${days}d ${hours}h left`;
        if (hours > 0) return `${hours}h left`;
        return 'Less than an hour';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                            <FiMail className="text-green-600" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Pending Invites</h2>
                            <p className="text-sm text-gray-500">Workspaces waiting for your response</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white/50 rounded-lg transition-colors"
                    >
                        <FiX size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <FiLoader className="animate-spin text-green-600" size={32} />
                            <p className="text-sm text-gray-500 mt-3">Loading invites...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-600">{error}</p>
                            <button
                                onClick={fetchInvites}
                                className="mt-4 text-sm text-green-600 hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : invites.length === 0 ? (
                        <div className="text-center py-12">
                            <FiUsers className="mx-auto text-gray-300" size={48} />
                            <p className="text-gray-500 mt-4">No pending invites</p>
                            <p className="text-sm text-gray-400 mt-1">
                                When someone invites you to a workspace, it will appear here
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {invites.map((invite) => (
                                <div
                                    key={invite.id}
                                    className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-medium text-gray-900 truncate">
                                                {invite.workspaceName}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[invite.role]}`}>
                                                    {invite.role}
                                                </span>
                                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                                    <FiClock size={10} />
                                                    {formatTimeRemaining(invite.expiresAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 mt-4">
                                        <button
                                            onClick={() => handleInviteAction(invite.id, 'accept')}
                                            disabled={actionLoading === invite.id}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {actionLoading === invite.id ? (
                                                <FiLoader className="animate-spin" size={16} />
                                            ) : (
                                                <>
                                                    <FiCheck size={16} />
                                                    Accept
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleInviteAction(invite.id, 'reject')}
                                            disabled={actionLoading === invite.id}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            <FiXCircle size={16} />
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

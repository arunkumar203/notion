'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiMail, FiClock, FiTrash2, FiLoader, FiSend } from 'react-icons/fi';
import { type WorkspaceRole } from '@/lib/workspace-permissions';
import { logAction } from '@/lib/audit-logs';
import { useAuth } from '@/context/AuthContext';

interface PendingInvite {
    id: string;
    email: string;
    role: WorkspaceRole;
    invitedAt: number;
    expiresAt: number;
    invitedBy: string;
}

interface WorkspacePendingInvitesProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceId: string;
    workspaceName: string;
    onOpenInviteModal: () => void;
}

const ROLE_COLORS: Record<WorkspaceRole, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    editor: 'bg-blue-100 text-blue-700',
    commenter: 'bg-green-100 text-green-700',
    viewer: 'bg-gray-100 text-gray-700',
};

export default function WorkspacePendingInvites({
    isOpen,
    onClose,
    workspaceId,
    workspaceName,
    onOpenInviteModal,
}: WorkspacePendingInvitesProps) {
    const { user } = useAuth();
    const [invites, setInvites] = useState<PendingInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [cancelingId, setCancelingId] = useState<string | null>(null);

    const fetchInvites = useCallback(async () => {
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/workspaces/pending-invites?workspaceId=${encodeURIComponent(workspaceId)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch pending invites');
            }

            setInvites(data.invites || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch pending invites');
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        if (isOpen) {
            fetchInvites();
        }
    }, [isOpen, fetchInvites]);

    const handleCancelInvite = async (inviteId: string) => {
        if (!confirm('Are you sure you want to cancel this invite?')) return;

        setCancelingId(inviteId);

        try {
            const res = await fetch(`/api/workspaces/invite?inviteId=${encodeURIComponent(inviteId)}`, {
                method: 'DELETE',
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to cancel invite');
            }

            // Audit Log
            const cancelledInvite = invites.find(i => i.id === inviteId);
            if (user) {
                logAction({
                    workspaceId,
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.displayName || '',
                    action: 'INVITE_CANCELLED' as any,
                    targetId: cancelledInvite?.email || 'Unknown',
                    targetName: cancelledInvite?.email || 'Unknown',
                    details: `Cancelled invite for ${cancelledInvite?.email}`,
                });
            }

            setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        } catch (err: any) {
            alert(err.message || 'Failed to cancel invite');
        } finally {
            setCancelingId(null);
        }
    };

    const formatTimeRemaining = (expiresAt: number) => {
        const now = Date.now();
        const remaining = expiresAt - now;

        if (remaining <= 0) return 'Expired';

        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        if (days > 0) return `Expires in ${days}d ${hours}h`;
        if (hours > 0) return `Expires in ${hours}h`;
        return 'Expires soon';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                            <FiSend className="text-amber-600" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Pending Invites</h2>
                            <p className="text-sm text-gray-500">{workspaceName}</p>
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
                            <FiLoader className="animate-spin text-amber-600" size={32} />
                            <p className="text-sm text-gray-500 mt-3">Loading invites...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-600">{error}</p>
                            <button
                                onClick={fetchInvites}
                                className="mt-4 text-sm text-amber-600 hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : invites.length === 0 ? (
                        <div className="text-center py-12">
                            <FiMail className="mx-auto text-gray-300" size={48} />
                            <p className="text-gray-500 mt-4">No pending invites</p>
                            <button
                                onClick={() => {
                                    onClose();
                                    onOpenInviteModal();
                                }}
                                className="mt-4 text-sm text-amber-600 hover:underline"
                            >
                                Invite someone
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {invites.map((invite) => (
                                <div
                                    key={invite.id}
                                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {invite.email}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${ROLE_COLORS[invite.role]}`}>
                                                {invite.role}
                                            </span>
                                            <span className="text-xs text-gray-400 flex items-center gap-1">
                                                <FiClock size={10} />
                                                {formatTimeRemaining(invite.expiresAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleCancelInvite(invite.id)}
                                        disabled={cancelingId === invite.id}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                        title="Cancel invite"
                                    >
                                        {cancelingId === invite.id ? (
                                            <FiLoader className="animate-spin" size={16} />
                                        ) : (
                                            <FiTrash2 size={16} />
                                        )}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => {
                                onClose();
                                onOpenInviteModal();
                            }}
                            className="text-sm font-medium text-amber-600 hover:text-amber-700"
                        >
                            + Invite more
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

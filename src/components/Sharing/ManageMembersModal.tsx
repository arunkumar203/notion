'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiUser, FiClock, FiTrash2, FiCheck, FiLoader, FiUserMinus, FiShield, FiEdit3, FiEye, FiMessageCircle, FiSliders } from 'react-icons/fi';
import {
    ASSIGNABLE_ROLES,
    DEFAULT_ROLE_PERMISSIONS,
    canManageRole,
    type WorkspaceRole,
    type WorkspaceAction
} from '@/lib/workspace-permissions';
import { logAction } from '@/lib/audit-logs';
import { useAuth } from '@/context/AuthContext';


interface Member {
    id: string;
    email: string;
    role: WorkspaceRole;
    permissions: string[];
    joinedAt: number;
    invitedBy?: string;
    isOwner: boolean;
}

interface ManageMembersModalProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceId: string;
    workspaceName: string;
    currentUserRole: WorkspaceRole;
    currentUserId: string;
    onMemberRemoved?: () => void;
    onRoleChanged?: () => void;
}

const ROLE_ICONS: Record<WorkspaceRole, React.ComponentType<any>> = {
    owner: FiShield,
    admin: FiShield,
    editor: FiEdit3,
    commenter: FiMessageCircle,
    viewer: FiEye,
};

const ROLE_COLORS: Record<WorkspaceRole, string> = {
    owner: 'bg-purple-100 text-purple-700 border-purple-200',
    admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    editor: 'bg-blue-100 text-blue-700 border-blue-200',
    commenter: 'bg-green-100 text-green-700 border-green-200',
    viewer: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function ManageMembersModal({
    isOpen,
    onClose,
    workspaceId,
    workspaceName,
    currentUserRole,
    currentUserId,
    onMemberRemoved,
    onRoleChanged,
}: ManageMembersModalProps) {
    const { user } = useAuth();
    const [members, setMembers] = useState<Member[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);


    // Fetch members when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchMembers();
        }
    }, [isOpen, workspaceId]);

    const fetchMembers = async () => {
        setIsLoading(true);
        setError('');

        try {
            const res = await fetch(`/api/workspaces/members?workspaceId=${encodeURIComponent(workspaceId)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to fetch members');
            }

            setMembers(data.members || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch members');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRemoveMember = async (memberId: string) => {
        if (!confirm('Are you sure you want to remove this member?')) return;

        setActionLoading(memberId);

        try {
            const res = await fetch(
                `/api/workspaces/members?workspaceId=${encodeURIComponent(workspaceId)}&memberId=${encodeURIComponent(memberId)}`,
                { method: 'DELETE' }
            );

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to remove member');
            }

            setMembers((prev) => prev.filter((m) => m.id !== memberId));
            onMemberRemoved?.();

            // Audit Log
            const removedMember = members.find(m => m.id === memberId);
            if (user) {
                logAction({
                    workspaceId,
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.displayName || '',
                    action: 'WORKSPACE_MEMBER_REMOVED',
                    targetId: memberId,
                    targetName: removedMember?.email || 'Unknown',
                    details: memberId === user.uid ? 'User left workspace' : `Removed by ${user.email}`,
                });
            }
        } catch (err: any) {
            alert(err.message || 'Failed to remove member');
        } finally {
            setActionLoading(null);
        }
    };

    const handleChangeRole = async (memberId: string, newRole: WorkspaceRole) => {
        setActionLoading(memberId);

        try {
            const res = await fetch('/api/workspaces/members', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId,
                    memberId,
                    role: newRole,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to change role');
            }

            setMembers((prev) =>
                prev.map((m) =>
                    m.id === memberId
                        ? { ...m, role: newRole, permissions: DEFAULT_ROLE_PERMISSIONS[newRole] }
                        : m
                )
            );
            onRoleChanged?.();

            // Audit Log
            const member = members.find(m => m.id === memberId);
            if (user) {
                logAction({
                    workspaceId,
                    userId: user.uid,
                    userEmail: user.email || '',
                    userName: user.displayName || '',
                    action: 'WORKSPACE_MEMBER_ROLE_CHANGED',
                    targetId: memberId,
                    targetName: member?.email || 'Unknown',
                    details: `Changed role from ${member?.role} to ${newRole}`,
                });
            }
        } catch (err: any) {
            alert(err.message || 'Failed to change role');
        } finally {
            setActionLoading(null);
        }
    };



    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Manage Members</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{workspaceName}</p>
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
                            <FiLoader className="animate-spin text-indigo-600" size={32} />
                            <p className="text-sm text-gray-500 mt-3">Loading members...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-600">{error}</p>
                            <button
                                onClick={fetchMembers}
                                className="mt-4 text-sm text-indigo-600 hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {members.map((member) => {
                                const RoleIcon = ROLE_ICONS[member.role];
                                const canManage = canManageRole(currentUserRole, member.role);
                                const isSelf = member.id === currentUserId;

                                return (
                                    <div
                                        key={member.id}
                                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium text-sm">
                                                {member.email.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium text-gray-900 truncate">
                                                        {member.email}
                                                    </p>
                                                    {isSelf && (
                                                        <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border capitalize ${ROLE_COLORS[member.role]}`}>
                                                        <RoleIcon size={12} />
                                                        {member.role}
                                                    </span>
                                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                                        <FiClock size={10} />
                                                        Joined {formatDate(member.joinedAt)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 ml-4">
                                            {/* Direct role dropdown (for non-owners if user can manage) */}
                                            {!member.isOwner && canManage && !isSelf && (
                                                <select
                                                    value={member.role}
                                                    onChange={(e) => handleChangeRole(member.id, e.target.value as WorkspaceRole)}
                                                    disabled={actionLoading === member.id}
                                                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Change member role"
                                                >
                                                    {ASSIGNABLE_ROLES.filter((r) => canManageRole(currentUserRole, r)).map((r) => (
                                                        <option key={r} value={r}>
                                                            {r.charAt(0).toUpperCase() + r.slice(1)}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}



                                            {/* Remove button (for non-owners if user can manage OR for self) */}
                                            {!member.isOwner && (canManage || isSelf) && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.id)}
                                                    disabled={actionLoading === member.id}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                    title={isSelf ? 'Leave workspace' : 'Remove member'}
                                                >
                                                    {actionLoading === member.id ? (
                                                        <FiLoader className="animate-spin" size={16} />
                                                    ) : (
                                                        <FiUserMinus size={16} />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">
                            {members.length} member{members.length !== 1 ? 's' : ''}
                        </p>
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

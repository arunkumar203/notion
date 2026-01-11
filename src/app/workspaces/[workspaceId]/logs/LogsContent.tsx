'use client';

import React, { useState, useEffect } from 'react';
import { FiClock, FiUser, FiInfo, FiArrowLeft, FiActivity, FiX, FiRefreshCw, FiExternalLink } from 'react-icons/fi';
import { getWorkspaceLogs, AuditLog } from '@/lib/audit-logs';
import { useAuth } from '@/context/AuthContext';
import { useNotebook } from '@/context/NotebookContext';
import { useRouter } from 'next/navigation';
import WorkspaceNavbar from '@/components/WorkspaceNavbar';
import Link from 'next/link';

interface LogsContentProps {
    workspaceId: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    'WORKSPACE_JOINED': { label: 'User Joined', color: 'bg-green-100 text-green-700' },
    'WORKSPACE_MEMBER_REMOVED': { label: 'Member Removed', color: 'bg-red-100 text-red-700' },
    'WORKSPACE_MEMBER_ROLE_CHANGED': { label: 'Role Changed', color: 'bg-blue-100 text-blue-700' },
    'NOTEBOOK_CREATED': { label: 'Notebook Created', color: 'bg-indigo-100 text-indigo-700' },
    'NOTEBOOK_DELETED': { label: 'Notebook Deleted', color: 'bg-red-100 text-red-700' },
    'NOTEBOOK_RENAMED': { label: 'Notebook Renamed', color: 'bg-indigo-50 text-indigo-600' },
    'SECTION_CREATED': { label: 'Section Created', color: 'bg-purple-100 text-purple-700' },
    'SECTION_DELETED': { label: 'Section Deleted', color: 'bg-red-100 text-red-700' },
    'TOPIC_CREATED': { label: 'Topic Created', color: 'bg-pink-100 text-pink-700' },
    'TOPIC_DELETED': { label: 'Topic Deleted', color: 'bg-red-100 text-red-700' },
    'PAGE_CREATED': { label: 'Page Created', color: 'bg-emerald-100 text-emerald-700' },
    'PAGE_DELETED': { label: 'Page Deleted', color: 'bg-red-100 text-red-700' },
    'PAGE_RENAMED': { label: 'Page Renamed', color: 'bg-emerald-50 text-emerald-600' },
    'COMMENT_ADDED': { label: 'Comment Added', color: 'bg-amber-100 text-amber-700' },
    'COMMENT_DELETED': { label: 'Comment Deleted', color: 'bg-red-100 text-red-700' },
    'INVITE_SENT': { label: 'Invite Sent', color: 'bg-indigo-100 text-indigo-700' },
    'INVITE_ACCEPTED': { label: 'Invite Accepted', color: 'bg-green-100 text-green-700' },
    'INVITE_CANCELLED': { label: 'Invite Cancelled', color: 'bg-red-100 text-red-700' },
};

export default function LogsContent({ workspaceId }: LogsContentProps) {
    const { user } = useAuth();
    const { workspaces } = useNotebook();
    const router = useRouter();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const workspace = workspaces.find(w => w.id === workspaceId);

    const fetchLogs = async () => {
        setRefreshing(true);
        try {
            const data = await getWorkspaceLogs(workspaceId, 100);
            setLogs(data);
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (workspaceId) {
            fetchLogs();
        }
    }, [workspaceId]);

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        // hh:mm am/pm, dd/mm/yy
        const timeStr = date.toLocaleString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
        const dateStr = date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        });
        return `${timeStr.toLowerCase()}, ${dateStr}`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <WorkspaceNavbar />
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <FiRefreshCw className="animate-spin text-indigo-600" size={32} />
                        <p className="text-gray-500">Loading audit logs...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <WorkspaceNavbar />

            <div className="flex-1 max-w-5xl w-full mx-auto p-6">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <Link
                            href={`/workspaces/${workspace?.slug || workspaceId}/notebooks`}
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-sm font-medium mb-2"
                        >
                            <FiArrowLeft size={16} />
                            Back to Notebooks
                        </Link>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <FiActivity className="text-indigo-600" />
                            Workspace Audit Logs
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Recent activities in <strong>{workspace?.name || 'this workspace'}</strong>
                        </p>
                    </div>
                    <button
                        onClick={fetchLogs}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
                    >
                        <FiRefreshCw className={`${refreshing ? 'animate-spin' : ''}`} size={16} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Time</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Target</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                                            No logs found for this workspace.
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => {
                                        const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-600' };
                                        return (
                                            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 flex items-center gap-1.5">
                                                    <FiClock size={12} />
                                                    {formatDate(log.timestamp)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${actionInfo.color}`}>
                                                        {actionInfo.label}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium text-gray-900">{log.userName || 'Unknown'}</span>
                                                        <span className="text-[10px] text-gray-400">{log.userEmail}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-sm text-gray-700 font-medium">{log.targetName || '-'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-xs text-gray-500 truncate max-w-md block">
                                                        {log.details || '-'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-100 flex items-start gap-3">
                    <FiInfo className="text-indigo-600 mt-0.5" size={18} />
                    <div className="text-xs text-indigo-700">
                        <strong>About Workspace Audit Logs:</strong> These logs track important structural changes and member interactions within the workspace. Only Owners and Administrators have access to this page.
                    </div>
                </div>
            </div>
        </div>
    );
}

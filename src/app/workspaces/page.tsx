'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotebook } from '@/context/NotebookContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    FiPlus,
    FiFolder,
    FiMoreVertical,
    FiEdit3,
    FiTrash2,
    FiClock,
    FiSearch,
    FiGrid,
    FiList,
    FiUserPlus,
    FiUsers,
    FiShare2,
    FiActivity,
} from 'react-icons/fi';

import WorkspaceNavbar from '@/components/WorkspaceNavbar';
import { InviteMemberModal, ManageMembersModal, WorkspacePendingInvites } from '@/components/Sharing';
import { useSharedWorkspaces } from '@/hooks/useSharedWorkspaces';
import { WORKSPACE_ACTIONS, hasPermission, type WorkspaceRole } from '@/lib/workspace-permissions';
import { rtdb } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

export default function WorkspacesPage() {
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const {
        workspaces,
        workspacesLoading,
        createWorkspace,
        renameWorkspace,
        deleteWorkspace,
        selectWorkspace,
    } = useNotebook();

    // Shared workspaces
    const { sharedWorkspaces, isLoading: sharedLoading } = useSharedWorkspaces(user?.uid);

    const [newWorkspaceName, setNewWorkspaceName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [isOpeningWorkspace, setIsOpeningWorkspace] = useState(false);
    const [stableOwnedWorkspaces, setStableOwnedWorkspaces] = useState<any[]>([]);
    const [stableSharedWorkspaces, setStableSharedWorkspaces] = useState<any[]>([]);
    const [showCreateForm, setShowCreateForm] = useState(false);

    // Update stable lists only on initial load or when count changes
    useEffect(() => {
        if (!workspacesLoading) {
            if (stableOwnedWorkspaces.length === 0 || workspaces.length !== stableOwnedWorkspaces.length) {
                setStableOwnedWorkspaces([...workspaces]);
            }
        }
    }, [workspaces, workspacesLoading, stableOwnedWorkspaces.length]);

    useEffect(() => {
        if (!sharedLoading) {
            if (stableSharedWorkspaces.length === 0 || sharedWorkspaces.length !== stableSharedWorkspaces.length) {
                setStableSharedWorkspaces([...sharedWorkspaces]);
            }
        }
    }, [sharedWorkspaces, sharedLoading, stableSharedWorkspaces.length]);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');

    // Sharing state
    const [inviteModalOpen, setInviteModalOpen] = useState(false);
    const [membersModalOpen, setMembersModalOpen] = useState(false);
    const [pendingInvitesOpen, setPendingInvitesOpen] = useState(false);
    const [selectedWorkspace, setSelectedWorkspace] = useState<{ id: string; name: string; role?: WorkspaceRole } | null>(null);
    const [sharedByMeIds, setSharedByMeIds] = useState<Set<string>>(new Set());
    const [isCheckingShared, setIsCheckingShared] = useState(false);

    // Check shared status for owned workspaces
    useEffect(() => {
        let isCancelled = false;
        async function checkShared() {
            if (!workspacesLoading && workspaces.length > 0 && user) {
                setIsCheckingShared(true);
                const sharedIds = new Set<string>();
                try {
                    // Optimized: Fetch all in parallel if there aren't too many
                    await Promise.all(workspaces.map(async (ws: any) => {
                        const membersRef = ref(rtdb, `workspaces/${ws.id}/members`);
                        const membersSnap = await get(membersRef);
                        const memberCount = membersSnap.exists() ? Object.keys(membersSnap.val()).length : 0;

                        if (memberCount > 1) {
                            sharedIds.add(ws.id);
                            return;
                        }

                        const invitesRef = ref(rtdb, `workspaces/${ws.id}/invites`);
                        const invitesSnap = await get(invitesRef);
                        if (invitesSnap.exists() && Object.keys(invitesSnap.val()).length > 0) {
                            sharedIds.add(ws.id);
                        }
                    }));
                } catch (err) {
                    console.error('Error checking shared status:', err);
                }
                if (!isCancelled) {
                    setSharedByMeIds(sharedIds);
                    setIsCheckingShared(false);
                }
            } else if (!workspacesLoading && workspaces.length === 0) {
                setIsCheckingShared(false);
            }
        }
        checkShared();
        return () => { isCancelled = true; };
    }, [workspaces, workspacesLoading, user]);

    // Auth redirect
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/login');
        }
    }, [authLoading, user, router]);

    // Close menu on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuOpenId) {
                setMenuOpenId(null);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [menuOpenId]);

    const handleCreateWorkspace = async () => {
        if (!newWorkspaceName.trim()) return;
        setIsCreating(true);
        try {
            const workspaceId = await createWorkspace(newWorkspaceName.trim());
            const newWorkspace = workspaces.find(w => w.id === workspaceId);
            setNewWorkspaceName('');
            setShowCreateForm(false);
            // Navigate to the new workspace using slug
            if (newWorkspace) {
                router.push(`/workspaces/${newWorkspace.slug}/notebooks`);
            }
        } catch (error: any) {
            alert(error.message || 'Failed to create workspace');
        } finally {
            setIsCreating(false);
        }
    };

    const handleRenameWorkspace = async (id: string) => {
        if (!editingName.trim()) return;
        try {
            await renameWorkspace(id, editingName.trim());
            setEditingId(null);
            setEditingName('');
        } catch (error: any) {
            alert(error.message || 'Failed to rename workspace');
        }
    };

    const handleDeleteWorkspace = async (id: string) => {
        if (!confirm('Are you sure you want to delete this workspace? All notebooks, sections, topics, and pages inside will be deleted.')) {
            return;
        }
        setDeletingId(id);
        try {
            await deleteWorkspace(id);
        } catch (error: any) {
            alert(error.message || 'Failed to delete workspace');
        } finally {
            setDeletingId(null);
        }
    };

    const handleOpenWorkspace = (workspace: any) => {
        setIsOpeningWorkspace(true);
        selectWorkspace(workspace.id);
        router.push(`/workspaces/${workspace.slug}/notebooks`);
    };

    const formatDate = (timestamp: number | undefined) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        return date.toLocaleDateString();
    };

    // Filter workspaces by search using stable lists
    const filteredWorkspaces = stableOwnedWorkspaces.filter(ws =>
        ws.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (authLoading || workspacesLoading || sharedLoading || isCheckingShared || isOpeningWorkspace) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4 text-center px-4">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <FiFolder className="text-indigo-600 animate-pulse" size={16} />
                        </div>
                    </div>
                    <div>
                        <p className="text-gray-900 font-medium">
                            {isOpeningWorkspace ? 'Opening workspace...' : 'Loading workspaces...'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            {isOpeningWorkspace ? 'Preparing your notebooks' : 'Please wait a moment'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <WorkspaceNavbar title="Workspaces" showSearch={false} />

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Search and View Toggle */}
                <div className="flex items-center justify-between mb-6">
                    <div className="relative flex-1 max-w-md">
                        <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search workspaces..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                            title="Grid view"
                        >
                            <FiGrid size={18} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
                            title="List view"
                        >
                            <FiList size={18} />
                        </button>
                    </div>
                </div>

                {/* Create Workspace Button */}
                {!showCreateForm && (
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="mb-6 flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <FiPlus size={20} />
                        <span>New Workspace</span>
                    </button>
                )}

                {/* Create Workspace Form */}
                {showCreateForm && (
                    <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                        <h3 className="text-lg font-medium mb-3">Create New Workspace</h3>
                        <div className="flex gap-3">
                            <input
                                type="text"
                                placeholder="Workspace name..."
                                value={newWorkspaceName}
                                onChange={(e) => setNewWorkspaceName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateWorkspace();
                                    if (e.key === 'Escape') {
                                        setShowCreateForm(false);
                                        setNewWorkspaceName('');
                                    }
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                autoFocus
                            />
                            <button
                                onClick={handleCreateWorkspace}
                                disabled={isCreating || !newWorkspaceName.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isCreating ? 'Creating...' : 'Create'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowCreateForm(false);
                                    setNewWorkspaceName('');
                                }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* Workspaces Grid/List */}
                {filteredWorkspaces.length === 0 ? (
                    <div className="text-center py-16">
                        {searchQuery ? (
                            <p className="text-gray-500">No workspaces found matching "{searchQuery}"</p>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                <FiFolder size={48} className="text-gray-300" />
                                <p className="text-gray-500">No workspaces yet. Create your first workspace to get started!</p>
                            </div>
                        )}
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredWorkspaces.map((workspace) => (
                            <div
                                key={workspace.id}
                                className={`group relative bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer ${menuOpenId === workspace.id ? 'z-30' : ''}`}
                                onClick={() => {
                                    if (editingId !== workspace.id && menuOpenId !== workspace.id) {
                                        handleOpenWorkspace(workspace);
                                    }
                                }}
                            >
                                {/* Card Content */}
                                <div className="p-5">
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                                            <FiFolder size={24} className="text-indigo-600" />
                                        </div>
                                        {/* Menu Button */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id);
                                                }}
                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <FiMoreVertical size={18} />
                                            </button>
                                            {menuOpenId === workspace.id && (
                                                <div
                                                    className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        onClick={() => {
                                                            setEditingId(workspace.id);
                                                            setEditingName(workspace.name);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <FiEdit3 size={14} />
                                                        Rename
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            handleDeleteWorkspace(workspace.id);
                                                            setMenuOpenId(null);
                                                        }}
                                                        disabled={deletingId === workspace.id}
                                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                                                    >
                                                        <FiTrash2 size={14} />
                                                        {deletingId === workspace.id ? 'Deleting...' : 'Delete'}
                                                    </button>
                                                    <div className="h-px bg-gray-200 my-1" />
                                                    <button
                                                        onClick={() => {
                                                            setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                            setInviteModalOpen(true);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <FiUserPlus size={14} />
                                                        Invite
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                            setMembersModalOpen(true);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <FiUsers size={14} />
                                                        Members
                                                    </button>
                                                    <Link
                                                        href={`/workspaces/${workspace.slug}/logs`}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <FiActivity size={14} className="text-indigo-600" />
                                                        Audit Logs
                                                    </Link>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                            setPendingInvitesOpen(true);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                    >
                                                        <FiShare2 size={14} />
                                                        Pending Invites
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {editingId === workspace.id ? (
                                        <div onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameWorkspace(workspace.id);
                                                    if (e.key === 'Escape') {
                                                        setEditingId(null);
                                                        setEditingName('');
                                                    }
                                                }}
                                                onBlur={() => handleRenameWorkspace(workspace.id)}
                                                className="w-full px-2 py-1 border border-indigo-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                autoFocus
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1 mb-2">
                                            <h3 className="text-lg font-medium text-gray-900 truncate">{workspace.name}</h3>
                                            {sharedByMeIds.has(workspace.id) && (
                                                <div className="flex">
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-wider">
                                                        <FiUsers size={10} />
                                                        Shared by you
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Last accessed */}
                                    <div className="flex items-center gap-1 text-xs text-gray-400">
                                        <FiClock size={12} />
                                        <span>{formatDate(workspace.lastAccessedAt || workspace.createdAt)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* List View */
                    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
                        {filteredWorkspaces.map((workspace) => (
                            <div
                                key={workspace.id}
                                className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                onClick={() => {
                                    if (editingId !== workspace.id) {
                                        handleOpenWorkspace(workspace);
                                    }
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                                        <FiFolder size={20} className="text-indigo-600" />
                                    </div>
                                    <div className="flex flex-col">
                                        {editingId === workspace.id ? (
                                            <input
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleRenameWorkspace(workspace.id);
                                                    if (e.key === 'Escape') {
                                                        setEditingId(null);
                                                        setEditingName('');
                                                    }
                                                }}
                                                onBlur={() => handleRenameWorkspace(workspace.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="px-2 py-1 border border-indigo-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-900">{workspace.name}</span>
                                                {sharedByMeIds.has(workspace.id) && (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-wider">
                                                        Shared by you
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-400">{formatDate(workspace.lastAccessedAt || workspace.createdAt)}</span>
                                    <div className="relative">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setMenuOpenId(menuOpenId === workspace.id ? null : workspace.id);
                                            }}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                                        >
                                            <FiMoreVertical size={18} />
                                        </button>
                                        {menuOpenId === workspace.id && (
                                            <div
                                                className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setEditingId(workspace.id);
                                                        setEditingName(workspace.name);
                                                        setMenuOpenId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <FiEdit3 size={14} />
                                                    Rename
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        handleDeleteWorkspace(workspace.id);
                                                        setMenuOpenId(null);
                                                    }}
                                                    disabled={deletingId === workspace.id}
                                                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    <FiTrash2 size={14} />
                                                    {deletingId === workspace.id ? 'Deleting...' : 'Delete'}
                                                </button>
                                                <div className="h-px bg-gray-200 my-1" />
                                                <button
                                                    onClick={() => {
                                                        setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                        setInviteModalOpen(true);
                                                        setMenuOpenId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <FiUserPlus size={14} />
                                                    Invite
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                        setMembersModalOpen(true);
                                                        setMenuOpenId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <FiUsers size={14} />
                                                    Members
                                                </button>
                                                <Link
                                                    href={`/workspaces/${workspace.slug}/logs`}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <FiActivity size={14} className="text-indigo-600" />
                                                    Audit Logs
                                                </Link>
                                                <button
                                                    onClick={() => {
                                                        setSelectedWorkspace({ id: workspace.id, name: workspace.name });
                                                        setPendingInvitesOpen(true);
                                                        setMenuOpenId(null);
                                                    }}
                                                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <FiShare2 size={14} />
                                                    Pending Invites
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Shared Workspaces Section */}
                {stableSharedWorkspaces.length > 0 && (
                    <div className="mt-12">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <FiUsers className="text-indigo-600" />
                            Shared with You
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {stableSharedWorkspaces.map((workspace) => {
                                // Check if user can invite (admin role)
                                const canInvite = hasPermission(workspace.role, WORKSPACE_ACTIONS.INVITE_MEMBERS, null);
                                const canRename = hasPermission(workspace.role, WORKSPACE_ACTIONS.RENAME_WORKSPACE, null);
                                const isViewerOrCommenter = workspace.role === 'viewer' || workspace.role === 'commenter';
                                const showActionsMenu = canInvite || canRename;

                                return (
                                    <div
                                        key={workspace.id}
                                        className={`group relative bg-white rounded-xl border ${isViewerOrCommenter ? 'border-gray-200' : 'border-emerald-200'} hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer ${menuOpenId === `shared-${workspace.id}` ? 'z-30' : ''}`}
                                        onClick={() => {
                                            if (menuOpenId !== `shared-${workspace.id}`) {
                                                selectWorkspace(workspace.id);
                                                router.push(`/workspaces/${workspace.slug}/notebooks`);
                                            }
                                        }}
                                    >
                                        <div className="p-5">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                                                    <FiFolder size={24} className="text-emerald-600" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs px-2 py-1 rounded-full capitalize font-medium ${workspace.role === 'admin' ? 'bg-indigo-100 text-indigo-700' :
                                                        workspace.role === 'editor' ? 'bg-blue-100 text-blue-700' :
                                                            workspace.role === 'commenter' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {workspace.role}
                                                    </span>
                                                    {/* Menu button for users who can perform actions */}
                                                    {showActionsMenu && (
                                                        <div className="relative">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setMenuOpenId(menuOpenId === `shared-${workspace.id}` ? null : `shared-${workspace.id}`);
                                                                }}
                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
                                                            >
                                                                <FiMoreVertical size={18} />
                                                            </button>
                                                            {menuOpenId === `shared-${workspace.id}` && (
                                                                <div
                                                                    className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    {canInvite && (
                                                                        <>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedWorkspace({ id: workspace.id, name: workspace.name, role: workspace.role });
                                                                                    setInviteModalOpen(true);
                                                                                    setMenuOpenId(null);
                                                                                }}
                                                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                            >
                                                                                <FiUserPlus size={14} />
                                                                                Invite
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedWorkspace({ id: workspace.id, name: workspace.name, role: workspace.role });
                                                                                    setMembersModalOpen(true);
                                                                                    setMenuOpenId(null);
                                                                                }}
                                                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                            >
                                                                                <FiUsers size={14} />
                                                                                Members
                                                                            </button>
                                                                            <Link
                                                                                href={`/workspaces/${workspace.slug}/logs`}
                                                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                            >
                                                                                <FiActivity size={14} className="text-indigo-600" />
                                                                                Audit Logs
                                                                            </Link>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedWorkspace({ id: workspace.id, name: workspace.name, role: workspace.role });
                                                                                    setPendingInvitesOpen(true);
                                                                                    setMenuOpenId(null);
                                                                                }}
                                                                                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                                            >
                                                                                <FiShare2 size={14} />
                                                                                Pending Invites
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <h3 className="text-lg font-medium text-gray-900 truncate mb-1">{workspace.name}</h3>
                                            <p className="text-xs text-gray-400 truncate">
                                                Owner: {workspace.ownerEmail}
                                            </p>
                                            <div className="flex items-center gap-1 text-xs text-gray-400 mt-2">
                                                <FiClock size={12} />
                                                <span>Joined {formatDate(workspace.joinedAt)}</span>
                                            </div>
                                            {/* Role-specific info for viewer/commenter */}
                                            {isViewerOrCommenter && (
                                                <div className="mt-2 text-xs text-gray-500 italic">
                                                    {workspace.role === 'viewer' ? 'View only access' : 'View & comment access'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            {/* Sharing Modals */}
            {selectedWorkspace && (
                <>
                    <InviteMemberModal
                        isOpen={inviteModalOpen}
                        onClose={() => setInviteModalOpen(false)}
                        workspaceId={selectedWorkspace.id}
                        workspaceName={selectedWorkspace.name}
                    />
                    <ManageMembersModal
                        isOpen={membersModalOpen}
                        onClose={() => setMembersModalOpen(false)}
                        workspaceId={selectedWorkspace.id}
                        workspaceName={selectedWorkspace.name}
                        currentUserRole={selectedWorkspace.role || 'owner'}
                        currentUserId={user?.uid || ''}
                    />
                    <WorkspacePendingInvites
                        isOpen={pendingInvitesOpen}
                        onClose={() => setPendingInvitesOpen(false)}
                        workspaceId={selectedWorkspace.id}
                        workspaceName={selectedWorkspace.name}
                        onOpenInviteModal={() => {
                            setPendingInvitesOpen(false);
                            setInviteModalOpen(true);
                        }}
                    />
                </>
            )}
        </div>
    );
}

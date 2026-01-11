'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNotebook } from '@/context/NotebookContext';
import { useAuth } from '@/context/AuthContext';
import { rtdb } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

/**
 * This page ensures the workspace is selected in context before loading.
 * Supports both slug-based URLs (preferred) and ID-based URLs (backwards compatibility)
 * Also supports shared workspaces.
 */
export default function WorkspaceNotebooksPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceParam = params?.workspaceId as string; // This is actually the slug now
    const { user, loading: authLoading } = useAuth();
    const { selectWorkspace, selectedWorkspace, workspacesLoading, workspaces, getWorkspaceBySlug } = useNotebook();
    const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
    const [isCheckingShared, setIsCheckingShared] = useState(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/login');
        }
    }, [authLoading, user, router]);

    // Resolve workspace from slug or ID (including shared workspaces)
    useEffect(() => {
        if (!workspaceParam || workspacesLoading || !user) return;

        // Try to find workspace by slug first (preferred) in owned workspaces
        let workspace = getWorkspaceBySlug(workspaceParam);

        // Fallback: try to find by ID for backwards compatibility
        if (!workspace) {
            workspace = workspaces.find(ws => ws.id === workspaceParam) || null;
        }

        if (workspace) {
            setResolvedWorkspaceId(workspace.id);

            // If the workspace exists and we're not already on the slug URL, redirect to slug URL
            if (workspace.slug !== workspaceParam && workspaceParam === workspace.id) {
                router.replace(`/workspaces/${workspace.slug}/notebooks`);
                return;
            }

            if (selectedWorkspace !== workspace.id) {
                selectWorkspace(workspace.id);
            }
            return;
        }

        // Not found in owned workspaces - check if it's a shared workspace
        if (!isCheckingShared) {
            setIsCheckingShared(true);

            // Try to find in shared_workspaces by checking if workspaceParam is a slug or ID
            const checkSharedWorkspace = async () => {
                try {
                    // First try to find by ID directly
                    const sharedRef = ref(rtdb, `users/${user.uid}/shared_workspaces/${workspaceParam}`);
                    const sharedSnap = await get(sharedRef);

                    if (sharedSnap.exists()) {
                        // Found by ID, use it directly
                        setResolvedWorkspaceId(workspaceParam);
                        if (selectedWorkspace !== workspaceParam) {
                            selectWorkspace(workspaceParam);
                        }
                        return;
                    }

                    // Not found by ID, it might be a slug - check all shared workspaces
                    const allSharedRef = ref(rtdb, `users/${user.uid}/shared_workspaces`);
                    const allSharedSnap = await get(allSharedRef);

                    if (allSharedSnap.exists()) {
                        const sharedWsIds = Object.keys(allSharedSnap.val() || {});

                        for (const wsId of sharedWsIds) {
                            const wsRef = ref(rtdb, `workspaces/${wsId}`);
                            const wsSnap = await get(wsRef);

                            if (wsSnap.exists()) {
                                const wsData = wsSnap.val();
                                if (wsData.slug === workspaceParam) {
                                    // Found by slug!
                                    setResolvedWorkspaceId(wsId);
                                    if (selectedWorkspace !== wsId) {
                                        selectWorkspace(wsId);
                                    }
                                    return;
                                }
                            }
                        }
                    }

                    // Workspace not found in owned or shared - redirect
                    if (workspaces.length > 0) {
                        router.replace('/workspaces');
                    }
                } catch (error) {
                    console.error('Error checking shared workspaces:', error);
                    router.replace('/workspaces');
                }
            };

            checkSharedWorkspace();
        }
    }, [workspaceParam, workspacesLoading, workspaces, selectedWorkspace, selectWorkspace, getWorkspaceBySlug, router, user, isCheckingShared]);

    // Show loading while checking auth or workspaces
    if (authLoading || workspacesLoading || !user || !resolvedWorkspaceId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                    <p className="text-gray-600">Loading workspace...</p>
                </div>
            </div>
        );
    }

    // Render the notebooks content once workspace is resolved and selected
    return <NotebooksContent workspaceId={resolvedWorkspaceId} />;
}

// We'll import the existing notebooks page content and pass workspace context
import NotebooksContent from './NotebooksContent';


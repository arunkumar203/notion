'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useNotebook } from '@/context/NotebookContext';
import { useAuth } from '@/context/AuthContext';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';
import { rtdb } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import LogsContent from './LogsContent';

/**
 * Audit logs page for workspaces.
 * Only administrators and owners can view these logs.
 */
export default function WorkspaceLogsPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceParam = params?.workspaceId as string;
    const { user, loading: authLoading } = useAuth();
    const { selectWorkspace, selectedWorkspace, workspacesLoading, workspaces, getWorkspaceBySlug } = useNotebook();
    const { role, isLoading: roleLoading } = useWorkspacePermissions({ workspaceId: selectedWorkspace, userId: user?.uid });

    const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(null);
    const [isCheckingShared, setIsCheckingShared] = useState(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace('/login');
        }
    }, [authLoading, user, router]);

    // Resolve workspace from slug or ID
    useEffect(() => {
        if (!workspaceParam || workspacesLoading || !user) return;

        let workspace = getWorkspaceBySlug(workspaceParam);
        if (!workspace) {
            workspace = workspaces.find(ws => ws.id === workspaceParam) || null;
        }

        if (workspace) {
            setResolvedWorkspaceId(workspace.id);
            if (selectedWorkspace !== workspace.id) {
                selectWorkspace(workspace.id);
            }
            return;
        }

        if (!isCheckingShared) {
            setIsCheckingShared(true);
            const checkSharedWorkspace = async () => {
                try {
                    const sharedRef = ref(rtdb, `users/${user.uid}/shared_workspaces/${workspaceParam}`);
                    const sharedSnap = await get(sharedRef);
                    if (sharedSnap.exists()) {
                        setResolvedWorkspaceId(workspaceParam);
                        if (selectedWorkspace !== workspaceParam) selectWorkspace(workspaceParam);
                        return;
                    }

                    const allSharedRef = ref(rtdb, `users/${user.uid}/shared_workspaces`);
                    const allSharedSnap = await get(allSharedRef);
                    if (allSharedSnap.exists()) {
                        const sharedWsIds = Object.keys(allSharedSnap.val() || {});
                        for (const wsId of sharedWsIds) {
                            const wsRef = ref(rtdb, `workspaces/${wsId}`);
                            const wsSnap = await get(wsRef);
                            if (wsSnap.exists() && wsSnap.val().slug === workspaceParam) {
                                setResolvedWorkspaceId(wsId);
                                if (selectedWorkspace !== wsId) selectWorkspace(wsId);
                                return;
                            }
                        }
                    }
                    router.replace('/workspaces');
                } catch (error) {
                    router.replace('/workspaces');
                }
            };
            checkSharedWorkspace();
        }
    }, [workspaceParam, workspacesLoading, workspaces, selectedWorkspace, selectWorkspace, getWorkspaceBySlug, router, user, isCheckingShared]);

    // Check permissions - only owner and admin can see logs
    useEffect(() => {
        if (!roleLoading && role && role !== 'owner' && role !== 'admin') {
            router.replace(`/workspaces/${workspaceParam}/notebooks`);
        }
    }, [role, roleLoading, router, workspaceParam]);

    if (authLoading || workspacesLoading || roleLoading || !user || !resolvedWorkspaceId) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                    <p className="text-gray-600">Accessing logs...</p>
                </div>
            </div>
        );
    }

    return <LogsContent workspaceId={resolvedWorkspaceId} />;
}

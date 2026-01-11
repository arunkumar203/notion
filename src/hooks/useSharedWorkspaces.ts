'use client';

import { useState, useEffect, useCallback } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, get, onValue, off } from 'firebase/database';
import { type WorkspaceRole } from '@/lib/workspace-permissions';

interface SharedWorkspace {
    id: string;
    name: string;
    slug: string;
    ownerId: string;
    ownerEmail: string;
    role: WorkspaceRole;
    joinedAt: number;
    description?: string;
    createdAt?: number;
    lastAccessedAt?: number;
}

export function useSharedWorkspaces(userId: string | null | undefined) {
    const [sharedWorkspaces, setSharedWorkspaces] = useState<SharedWorkspace[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSharedWorkspaces = useCallback(async () => {
        if (!userId) {
            setSharedWorkspaces([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Get list of shared workspace IDs from user's shared_workspaces
            const sharedWsRef = ref(rtdb, `users/${userId}/shared_workspaces`);
            const sharedWsSnap = await get(sharedWsRef);

            if (!sharedWsSnap.exists()) {
                setSharedWorkspaces([]);
                setIsLoading(false);
                return;
            }

            const sharedWsIds = Object.keys(sharedWsSnap.val() || {});

            if (sharedWsIds.length === 0) {
                setSharedWorkspaces([]);
                setIsLoading(false);
                return;
            }

            // Fetch each workspace's details
            const workspaces: SharedWorkspace[] = [];

            for (const wsId of sharedWsIds) {
                try {
                    const wsRef = ref(rtdb, `workspaces/${wsId}`);
                    const wsSnap = await get(wsRef);

                    if (wsSnap.exists()) {
                        const ws = wsSnap.val();
                        const memberData = ws.members?.[userId];

                        if (memberData) {
                            // Get owner info
                            let ownerEmail = 'Unknown';
                            try {
                                const ownerRef = ref(rtdb, `users/${ws.owner}`);
                                const ownerSnap = await get(ownerRef);
                                if (ownerSnap.exists()) {
                                    ownerEmail = ownerSnap.val()?.email || 'Unknown';
                                }
                            } catch {
                                // Ignore error fetching owner
                            }

                            workspaces.push({
                                id: wsId,
                                name: ws.name || 'Untitled Workspace',
                                slug: ws.slug || wsId,
                                ownerId: ws.owner,
                                ownerEmail,
                                role: memberData.role,
                                joinedAt: memberData.joinedAt,
                                description: ws.description,
                                createdAt: ws.createdAt,
                                lastAccessedAt: ws.lastAccessedAt,
                            });
                        }
                    }
                } catch {
                    // Skip workspaces that fail to fetch
                }
            }

            setSharedWorkspaces(workspaces);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch shared workspaces');
            setSharedWorkspaces([]);
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) {
            setSharedWorkspaces([]);
            setIsLoading(false);
            return;
        }

        // Initial fetch
        fetchSharedWorkspaces();

        // Listen for changes to shared_workspaces
        const sharedWsRef = ref(rtdb, `users/${userId}/shared_workspaces`);
        const unsubscribe = onValue(sharedWsRef, () => {
            fetchSharedWorkspaces();
        });

        return () => {
            off(sharedWsRef);
        };
    }, [userId, fetchSharedWorkspaces]);

    return {
        sharedWorkspaces,
        isLoading,
        error,
        refetch: fetchSharedWorkspaces,
    };
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { rtdb } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import {
    hasPermission,
    getPermissionsForRole,
    DEFAULT_ROLE_PERMISSIONS,
    type WorkspaceRole,
    type WorkspaceAction
} from '@/lib/workspace-permissions';

interface UseWorkspacePermissionsOptions {
    workspaceId: string | null;
    userId: string | null | undefined;
}

interface WorkspacePermissionsResult {
    role: WorkspaceRole | null;
    permissions: WorkspaceAction[];
    isOwner: boolean;
    isMember: boolean;
    isSharedWorkspace: boolean; // True if user is a member but not owner
    isLoading: boolean;
    error: string | null;
    can: (action: WorkspaceAction) => boolean;
    canWithMessage: (action: WorkspaceAction) => { allowed: boolean; message: string };
    refetch: () => void;
}

export function useWorkspacePermissions({
    workspaceId,
    userId,
}: UseWorkspacePermissionsOptions): WorkspacePermissionsResult {
    const [role, setRole] = useState<WorkspaceRole | null>(null);
    const [permissions, setPermissions] = useState<WorkspaceAction[]>([]);
    const [isOwner, setIsOwner] = useState(false);
    const [isMember, setIsMember] = useState(false);
    const [isSharedWorkspace, setIsSharedWorkspace] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPermissions = useCallback(async () => {
        if (!workspaceId || !userId) {
            setRole(null);
            setPermissions([]);
            setIsOwner(false);
            setIsMember(false);
            setIsSharedWorkspace(false);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            // Directly check workspace owner from RTDB
            const wsRef = ref(rtdb, `workspaces/${workspaceId}`);
            const wsSnap = await get(wsRef);

            if (!wsSnap.exists()) {
                setRole(null);
                setPermissions([]);
                setIsOwner(false);
                setIsMember(false);
                setIsSharedWorkspace(false);
                setIsLoading(false);
                return;
            }

            const wsData = wsSnap.val();
            const ownerId = wsData.owner;

            if (ownerId === userId) {
                // User is the owner - full access, no restrictions
                setRole('owner');
                setPermissions(DEFAULT_ROLE_PERMISSIONS.owner);
                setIsOwner(true);
                setIsMember(true);
                setIsSharedWorkspace(false);
                setIsLoading(false);
                return;
            }

            // Check if user is a member (shared workspace)
            const memberData = wsData.members?.[userId];

            if (memberData) {
                const memberRole = memberData.role as WorkspaceRole;
                const customPermissions = memberData.permissions || null;

                setRole(memberRole);
                setPermissions(customPermissions || getPermissionsForRole(memberRole));
                setIsOwner(false);
                setIsMember(true);
                setIsSharedWorkspace(true); // This is a shared workspace
            } else {
                // Not a member
                setRole(null);
                setPermissions([]);
                setIsOwner(false);
                setIsMember(false);
                setIsSharedWorkspace(false);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to fetch permissions');
            setRole(null);
            setPermissions([]);
            setIsOwner(false);
            setIsMember(false);
            setIsSharedWorkspace(false);
        } finally {
            setIsLoading(false);
        }
    }, [workspaceId, userId]);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    // Check if user can perform an action
    const can = useCallback(
        (action: WorkspaceAction): boolean => {
            // Owner always has full access
            if (isOwner) return true;
            // Not a member = no access
            if (!isMember || !role) return false;
            // Check permissions for shared workspace members
            return hasPermission(role, action, permissions.length > 0 ? permissions : null);
        },
        [isOwner, isMember, role, permissions]
    );

    // Check with a user-friendly message
    const canWithMessage = useCallback(
        (action: WorkspaceAction): { allowed: boolean; message: string } => {
            if (isOwner) {
                return { allowed: true, message: '' };
            }
            if (!isMember) {
                return { allowed: false, message: 'You do not have access to this workspace.' };
            }
            if (!role) {
                return { allowed: false, message: 'Your role could not be determined.' };
            }

            const allowed = hasPermission(role, action, permissions.length > 0 ? permissions : null);

            if (!allowed) {
                const actionName = action.replace(/_/g, ' ').toLowerCase();
                return {
                    allowed: false,
                    message: `You are not authorized to ${actionName}. Contact the workspace admin for access.`
                };
            }

            return { allowed: true, message: '' };
        },
        [isOwner, isMember, role, permissions]
    );

    return {
        role,
        permissions,
        isOwner,
        isMember,
        isSharedWorkspace,
        isLoading,
        error,
        can,
        canWithMessage,
        refetch: fetchPermissions,
    };
}


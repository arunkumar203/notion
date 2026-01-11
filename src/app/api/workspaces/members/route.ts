import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth as adminAuth, rtdb } from '@/lib/firebase-admin';
import {
    ASSIGNABLE_ROLES,
    canManageRole,
    DEFAULT_ROLE_PERMISSIONS,
    WORKSPACE_ACTIONS,
    hasPermission,
    type WorkspaceRole,
    type WorkspaceAction
} from '@/lib/workspace-permissions';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

/**
 * GET /api/workspaces/members?workspaceId=xxx
 * Get all members of a workspace
 */
export async function GET(req: Request) {
    try {
        if (!adminAuth) return jsonError(500, 'Server not ready');

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value || '';
        if (!session) return jsonError(401, 'Not authenticated');

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const uid = decoded?.uid as string;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get('workspaceId');

        if (!workspaceId) {
            return jsonError(400, 'Missing workspaceId parameter');
        }

        // Get workspace
        const workspaceRef = rtdb.ref(`workspaces/${workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            return jsonError(404, 'Workspace not found');
        }

        const workspace = workspaceSnap.val();

        // Check if user has access
        const isOwner = workspace.owner === uid;
        const isMember = !!workspace.members?.[uid];

        if (!isOwner && !isMember) {
            return jsonError(403, 'Not authorized to view this workspace');
        }

        // Get owner info
        const ownerSnap = await rtdb.ref(`users/${workspace.owner}`).get();
        const ownerData = ownerSnap.exists() ? ownerSnap.val() : {};

        const members: any[] = [
            {
                id: workspace.owner,
                email: ownerData.email || 'Unknown',
                role: 'owner',
                permissions: DEFAULT_ROLE_PERMISSIONS.owner,
                joinedAt: workspace.createdAt || Date.now(),
                isOwner: true,
            },
        ];

        // Get member info
        if (workspace.members) {
            const memberIds = Object.keys(workspace.members);
            for (const memberId of memberIds) {
                const member = workspace.members[memberId];
                const userSnap = await rtdb.ref(`users/${memberId}`).get();
                const userData = userSnap.exists() ? userSnap.val() : {};

                members.push({
                    id: memberId,
                    email: userData.email || 'Unknown',
                    role: member.role,
                    permissions: member.permissions || DEFAULT_ROLE_PERMISSIONS[member.role as WorkspaceRole],
                    joinedAt: member.joinedAt,
                    invitedBy: member.invitedBy,
                    isOwner: false,
                });
            }
        }

        return NextResponse.json({ members });
    } catch (error) {
        console.error('Error fetching members:', error);
        return jsonError(500, 'Failed to fetch members');
    }
}

/**
 * PUT /api/workspaces/members
 * Update a member's role or permissions
 * Body: { workspaceId, memberId, role?, permissions? }
 */
export async function PUT(req: Request) {
    try {
        if (!adminAuth) return jsonError(500, 'Server not ready');

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value || '';
        if (!session) return jsonError(401, 'Not authenticated');

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const uid = decoded?.uid as string;
        const body = await req.json();
        const { workspaceId, memberId, role, permissions } = body;

        if (!workspaceId || !memberId) {
            return jsonError(400, 'Missing required fields: workspaceId, memberId');
        }

        // Get workspace
        const workspaceRef = rtdb.ref(`workspaces/${workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            return jsonError(404, 'Workspace not found');
        }

        const workspace = workspaceSnap.val();

        // Determine current user's role
        const isOwner = workspace.owner === uid;
        const currentUserMember = workspace.members?.[uid];
        const currentUserRole: WorkspaceRole = isOwner ? 'owner' : (currentUserMember?.role || 'viewer');

        // Check if user can change roles
        if (role && !hasPermission(currentUserRole, WORKSPACE_ACTIONS.CHANGE_ROLES, currentUserMember?.permissions)) {
            return jsonError(403, 'You do not have permission to change roles');
        }

        // Check if user can manage permissions
        if (permissions && !hasPermission(currentUserRole, WORKSPACE_ACTIONS.MANAGE_PERMISSIONS, currentUserMember?.permissions)) {
            return jsonError(403, 'You do not have permission to manage permissions');
        }

        // Cannot modify owner
        if (memberId === workspace.owner) {
            return jsonError(400, 'Cannot modify owner permissions');
        }

        // Get target member
        const targetMember = workspace.members?.[memberId];
        if (!targetMember) {
            return jsonError(404, 'Member not found');
        }

        const targetRole = targetMember.role as WorkspaceRole;

        // Check if current user can manage target role
        if (!canManageRole(currentUserRole, targetRole)) {
            return jsonError(403, 'You cannot manage this member');
        }

        // If changing role
        if (role) {
            if (!ASSIGNABLE_ROLES.includes(role as WorkspaceRole)) {
                return jsonError(400, `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
            }

            // Cannot promote to a role higher than or equal to current user's role
            if (!canManageRole(currentUserRole, role as WorkspaceRole)) {
                return jsonError(403, 'Cannot assign this role');
            }

            await rtdb.ref(`workspaces/${workspaceId}/members/${memberId}/role`).set(role);

            // Reset custom permissions when role changes
            await rtdb.ref(`workspaces/${workspaceId}/members/${memberId}/permissions`).set(null);
        }

        // If updating permissions
        if (permissions !== undefined) {
            // Validate permissions are valid actions
            if (permissions !== null) {
                const validActions = Object.values(WORKSPACE_ACTIONS);
                const invalidPerms = permissions.filter((p: string) => !validActions.includes(p as any));
                if (invalidPerms.length > 0) {
                    return jsonError(400, `Invalid permissions: ${invalidPerms.join(', ')}`);
                }
            }

            await rtdb.ref(`workspaces/${workspaceId}/members/${memberId}/permissions`).set(permissions);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating member:', error);
        return jsonError(500, 'Failed to update member');
    }
}

/**
 * DELETE /api/workspaces/members
 * Remove a member from workspace
 * Query: ?workspaceId=xxx&memberId=xxx
 */
export async function DELETE(req: Request) {
    try {
        if (!adminAuth) return jsonError(500, 'Server not ready');

        const cookieStore = await cookies();
        const session = cookieStore.get('session')?.value || '';
        if (!session) return jsonError(401, 'Not authenticated');

        let decoded: any;
        try {
            decoded = await adminAuth.verifySessionCookie(session, true);
        } catch {
            return jsonError(401, 'Invalid session');
        }

        const uid = decoded?.uid as string;
        const url = new URL(req.url);
        const workspaceId = url.searchParams.get('workspaceId');
        const memberId = url.searchParams.get('memberId');

        if (!workspaceId || !memberId) {
            return jsonError(400, 'Missing required parameters: workspaceId, memberId');
        }

        // Get workspace
        const workspaceRef = rtdb.ref(`workspaces/${workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            return jsonError(404, 'Workspace not found');
        }

        const workspace = workspaceSnap.val();

        // Cannot remove owner
        if (memberId === workspace.owner) {
            return jsonError(400, 'Cannot remove workspace owner');
        }

        // Determine current user's role
        const isOwner = workspace.owner === uid;
        const currentUserMember = workspace.members?.[uid];
        const currentUserRole: WorkspaceRole = isOwner ? 'owner' : (currentUserMember?.role || 'viewer');

        // Check if user can remove members
        // Users can always remove themselves (leave workspace)
        const isSelfRemoval = memberId === uid;

        if (!isSelfRemoval && !hasPermission(currentUserRole, WORKSPACE_ACTIONS.REMOVE_MEMBERS, currentUserMember?.permissions)) {
            return jsonError(403, 'You do not have permission to remove members');
        }

        // Get target member
        const targetMember = workspace.members?.[memberId];
        if (!targetMember) {
            return jsonError(404, 'Member not found');
        }

        const targetRole = targetMember.role as WorkspaceRole;

        // Check if current user can manage target role (unless self-removal)
        if (!isSelfRemoval && !canManageRole(currentUserRole, targetRole)) {
            return jsonError(403, 'You cannot remove this member');
        }

        // Remove member from workspace
        await rtdb.ref(`workspaces/${workspaceId}/members/${memberId}`).remove();

        // Remove workspace from user's shared_workspaces
        await rtdb.ref(`users/${memberId}/shared_workspaces/${workspaceId}`).remove();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing member:', error);
        return jsonError(500, 'Failed to remove member');
    }
}

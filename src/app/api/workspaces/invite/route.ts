import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth as adminAuth, rtdb } from '@/lib/firebase-admin';
import { ASSIGNABLE_ROLES, INVITE_EXPIRY_MS, isInviteExpired, type WorkspaceRole } from '@/lib/workspace-permissions';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

/**
 * POST /api/workspaces/invite
 * Send an invite to a user by email
 */
export async function POST(req: Request) {
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
        const { workspaceId, email, role } = body;

        if (!workspaceId || !email || !role) {
            return jsonError(400, 'Missing required fields: workspaceId, email, role');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return jsonError(400, 'Invalid email format');
        }

        // Validate role
        if (!ASSIGNABLE_ROLES.includes(role as WorkspaceRole)) {
            return jsonError(400, `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
        }

        // Get workspace to verify ownership and get name
        const workspaceRef = rtdb.ref(`workspaces/${workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            return jsonError(404, 'Workspace not found');
        }

        const workspace = workspaceSnap.val();
        const isOwner = workspace.owner === uid;
        const isAdmin = workspace.members?.[uid]?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return jsonError(403, 'Only owner or admin can invite members');
        }

        // Check if user is trying to invite themselves
        const userSnap = await rtdb.ref(`users/${uid}`).get();
        const currentUserEmail = userSnap.exists() ? userSnap.val()?.email : null;
        if (email.toLowerCase() === currentUserEmail?.toLowerCase()) {
            return jsonError(400, 'You cannot invite yourself');
        }

        // Check if email is already a member (need to find user by email)
        // First, check if there's already a pending invite for this email + workspace
        const existingInvitesSnap = await rtdb.ref('invites')
            .orderByChild('email')
            .equalTo(email.toLowerCase())
            .get();

        if (existingInvitesSnap.exists()) {
            const invites = existingInvitesSnap.val();
            for (const inviteId of Object.keys(invites)) {
                const invite = invites[inviteId];
                if (invite.workspaceId === workspaceId && invite.status === 'pending') {
                    // Check if expired
                    if (isInviteExpired(invite.invitedAt)) {
                        // Delete expired invite
                        await rtdb.ref(`invites/${inviteId}`).remove();
                    } else {
                        return jsonError(400, 'An invite is already pending for this email');
                    }
                }
            }
        }

        // Create invite
        const inviteRef = rtdb.ref('invites').push();
        const inviteId = inviteRef.key;
        const now = Date.now();

        const inviteData = {
            email: email.toLowerCase(),
            workspaceId,
            workspaceOwnerId: workspace.owner,
            workspaceName: workspace.name || 'Untitled Workspace',
            role,
            invitedBy: uid,
            invitedAt: now,
            expiresAt: now + INVITE_EXPIRY_MS,
            status: 'pending',
        };

        await inviteRef.set(inviteData);

        return NextResponse.json({
            success: true,
            invite: {
                id: inviteId,
                ...inviteData,
            },
        });
    } catch (error) {
        console.error('Error creating invite:', error);
        return jsonError(500, 'Failed to create invite');
    }
}

/**
 * DELETE /api/workspaces/invite
 * Cancel/revoke a pending invite
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
        const inviteId = url.searchParams.get('inviteId');

        if (!inviteId) {
            return jsonError(400, 'Missing inviteId parameter');
        }

        // Get invite
        const inviteRef = rtdb.ref(`invites/${inviteId}`);
        const inviteSnap = await inviteRef.get();

        if (!inviteSnap.exists()) {
            return jsonError(404, 'Invite not found');
        }

        const invite = inviteSnap.val();

        // Verify permission to cancel (must be workspace owner, admin, or the one who invited)
        const workspaceRef = rtdb.ref(`workspaces/${invite.workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            // Workspace deleted, clean up invite
            await inviteRef.remove();
            return NextResponse.json({ success: true });
        }

        const workspace = workspaceSnap.val();
        const isOwner = workspace.owner === uid;
        const isAdmin = workspace.members?.[uid]?.role === 'admin';
        const isInviter = invite.invitedBy === uid;

        if (!isOwner && !isAdmin && !isInviter) {
            return jsonError(403, 'Not authorized to cancel this invite');
        }

        await inviteRef.remove();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error canceling invite:', error);
        return jsonError(500, 'Failed to cancel invite');
    }
}

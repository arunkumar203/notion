import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth as adminAuth, rtdb } from '@/lib/firebase-admin';
import { isInviteExpired, DEFAULT_ROLE_PERMISSIONS, type WorkspaceRole } from '@/lib/workspace-permissions';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

/**
 * GET /api/invites
 * Get all pending invites for the current user (by email)
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
        const email = decoded?.email?.toLowerCase();

        if (!email) {
            return NextResponse.json({ invites: [] });
        }

        // Find all pending invites for this email
        const invitesSnap = await rtdb.ref('invites')
            .orderByChild('email')
            .equalTo(email)
            .get();

        if (!invitesSnap.exists()) {
            return NextResponse.json({ invites: [] });
        }

        const invitesData = invitesSnap.val();
        const invites: any[] = [];
        const expiredIds: string[] = [];

        for (const [inviteId, invite] of Object.entries(invitesData) as [string, any][]) {
            if (invite.status === 'pending') {
                if (isInviteExpired(invite.invitedAt)) {
                    expiredIds.push(inviteId);
                } else {
                    invites.push({
                        id: inviteId,
                        ...invite,
                    });
                }
            }
        }

        // Clean up expired invites in background
        if (expiredIds.length > 0) {
            Promise.all(expiredIds.map(id => rtdb.ref(`invites/${id}`).remove())).catch(console.error);
        }

        return NextResponse.json({ invites });
    } catch (error) {
        console.error('Error fetching invites:', error);
        return jsonError(500, 'Failed to fetch invites');
    }
}

/**
 * POST /api/invites (accept or reject)
 * Body: { inviteId: string, action: 'accept' | 'reject' }
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
        const email = decoded?.email?.toLowerCase();
        const body = await req.json();
        const { inviteId, action } = body;

        if (!inviteId || !action) {
            return jsonError(400, 'Missing required fields: inviteId, action');
        }

        if (action !== 'accept' && action !== 'reject') {
            return jsonError(400, 'Action must be "accept" or "reject"');
        }

        // Get invite
        const inviteRef = rtdb.ref(`invites/${inviteId}`);
        const inviteSnap = await inviteRef.get();

        if (!inviteSnap.exists()) {
            return jsonError(404, 'Invite not found');
        }

        const invite = inviteSnap.val();

        // Verify this invite is for the current user
        if (invite.email !== email) {
            return jsonError(403, 'This invite is not for you');
        }

        // Check if expired
        if (isInviteExpired(invite.invitedAt)) {
            await inviteRef.remove();
            return jsonError(400, 'This invite has expired');
        }

        // Check if workspace still exists
        const workspaceRef = rtdb.ref(`workspaces/${invite.workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            await inviteRef.remove();
            return jsonError(400, 'Workspace no longer exists');
        }

        if (action === 'reject') {
            // Just delete the invite
            await inviteRef.remove();
            return NextResponse.json({ success: true, action: 'rejected' });
        }

        // ACCEPT: Add user to workspace members and add workspace to user's shared_workspaces
        const workspace = workspaceSnap.val();
        const role = invite.role as WorkspaceRole;
        const now = Date.now();

        // Check if already a member
        if (workspace.members?.[uid]) {
            await inviteRef.remove();
            return jsonError(400, 'You are already a member of this workspace');
        }

        // Check if user is the owner
        if (workspace.owner === uid) {
            await inviteRef.remove();
            return jsonError(400, 'You are the owner of this workspace');
        }

        // Add member to workspace
        const memberData = {
            role,
            permissions: null, // Use default permissions
            joinedAt: now,
            invitedBy: invite.invitedBy,
        };

        await rtdb.ref(`workspaces/${invite.workspaceId}/members/${uid}`).set(memberData);

        // Add workspace to user's shared_workspaces
        await rtdb.ref(`users/${uid}/shared_workspaces/${invite.workspaceId}`).set(true);

        // Delete the invite
        await inviteRef.remove();

        return NextResponse.json({
            success: true,
            action: 'accepted',
            workspace: {
                id: invite.workspaceId,
                name: workspace.name,
                role,
            },
        });
    } catch (error) {
        console.error('Error processing invite:', error);
        return jsonError(500, 'Failed to process invite');
    }
}

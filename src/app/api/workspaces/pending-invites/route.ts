import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth as adminAuth, rtdb } from '@/lib/firebase-admin';
import { isInviteExpired } from '@/lib/workspace-permissions';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

/**
 * GET /api/workspaces/pending-invites?workspaceId=xxx
 * Get all pending invites for a workspace (for owner/admin to see)
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

        // Get workspace to verify access
        const workspaceRef = rtdb.ref(`workspaces/${workspaceId}`);
        const workspaceSnap = await workspaceRef.get();

        if (!workspaceSnap.exists()) {
            return jsonError(404, 'Workspace not found');
        }

        const workspace = workspaceSnap.val();
        const isOwner = workspace.owner === uid;
        const isAdmin = workspace.members?.[uid]?.role === 'admin';

        if (!isOwner && !isAdmin) {
            return jsonError(403, 'Only owner or admin can view pending invites');
        }

        // Get all pending invites for this workspace
        const invitesSnap = await rtdb.ref('invites')
            .orderByChild('workspaceId')
            .equalTo(workspaceId)
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
        console.error('Error fetching pending invites:', error);
        return jsonError(500, 'Failed to fetch pending invites');
    }
}

import { NextResponse } from 'next/server';
import { verifyAuthentication } from '@/lib/auth-helpers';
import admin from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const rtdb = admin.database();
const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024; // 50MB

/**
 * GET /api/admin/storage-limit
 * Returns the current default storage limit
 */
export async function GET() {
    const authResult = await verifyAuthentication();
    if (authResult instanceof NextResponse) {
        return authResult;
    }

    const { uid } = authResult;

    try {
        // Check if user is admin
        const userSnap = await rtdb.ref(`users/${uid}/role`).once('value');
        const userRole = userSnap.val();

        if (userRole !== 'root_admin' && userRole !== 'admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const limitSnap = await rtdb.ref('adminSettings/defaultStorageLimit').once('value');
        const limit = limitSnap.exists() ? limitSnap.val() : DEFAULT_STORAGE_LIMIT;

        return NextResponse.json({
            limit,
            limitMB: Math.round(limit / (1024 * 1024)),
            limitFormatted: `${Math.round(limit / (1024 * 1024))} MB`
        });
    } catch (error: any) {
        console.error('[api/admin/storage-limit] GET error:', error);
        return NextResponse.json({ error: error.message || 'Failed to get storage limit' }, { status: 500 });
    }
}

/**
 * PUT /api/admin/storage-limit
 * Updates the default storage limit (admin only)
 */
export async function PUT(req: Request) {
    const authResult = await verifyAuthentication();
    if (authResult instanceof NextResponse) {
        return authResult;
    }

    const { uid } = authResult;

    try {
        // Check if user is root_admin only (stricter control)
        const userSnap = await rtdb.ref(`users/${uid}/role`).once('value');
        const userRole = userSnap.val();

        if (userRole !== 'root_admin') {
            return NextResponse.json({ error: 'Root admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { limitMB } = body;

        if (typeof limitMB !== 'number' || limitMB < 1 || limitMB > 10240) {
            return NextResponse.json(
                { error: 'Storage limit must be between 1 MB and 10 GB' },
                { status: 400 }
            );
        }

        const limitBytes = limitMB * 1024 * 1024;
        await rtdb.ref('adminSettings/defaultStorageLimit').set(limitBytes);

        return NextResponse.json({
            ok: true,
            limit: limitBytes,
            limitMB,
            limitFormatted: `${limitMB} MB`
        });
    } catch (error: any) {
        console.error('[api/admin/storage-limit] PUT error:', error);
        return NextResponse.json({ error: error.message || 'Failed to update storage limit' }, { status: 500 });
    }
}

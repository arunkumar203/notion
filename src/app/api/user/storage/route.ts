import { NextResponse } from 'next/server';
import { verifyAuthentication } from '@/lib/auth-helpers';
import { getUserStorageUsed, getStorageLimit, getUserFiles, formatBytes } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/storage
 * Returns the user's storage usage, limit, and file list
 */
export async function GET() {
    const authResult = await verifyAuthentication();
    if (authResult instanceof NextResponse) {
        return authResult;
    }

    const { uid } = authResult;

    try {
        const [used, limit, files] = await Promise.all([
            getUserStorageUsed(uid),
            getStorageLimit(),
            getUserFiles(uid)
        ]);

        const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
        const remaining = Math.max(0, limit - used);

        return NextResponse.json({
            used,
            limit,
            remaining,
            percentage,
            usedFormatted: formatBytes(used),
            limitFormatted: formatBytes(limit),
            remainingFormatted: formatBytes(remaining),
            fileCount: files.length,
            files: files.map(f => ({
                id: f.id,
                name: f.name,
                size: f.size,
                sizeFormatted: formatBytes(f.size),
                mimeType: f.mimeType,
                workspaceId: f.workspaceId,
                pageId: f.pageId,
                createdAt: f.createdAt
            }))
        });
    } catch (error: any) {
        console.error('[api/user/storage] error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get storage info' },
            { status: 500 }
        );
    }
}

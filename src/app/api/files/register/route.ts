import { NextResponse } from 'next/server';
import { verifyAuthentication } from '@/lib/auth-helpers';
import { recordFileUploadWithIndex } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * POST /api/files/register
 * Registers a file that was uploaded directly to Appwrite from the client.
 * This is needed for storage tracking when bypassing the server-side upload.
 */
export async function POST(req: Request) {
    const authResult = await verifyAuthentication();
    if (authResult instanceof NextResponse) {
        return authResult;
    }

    const { uid } = authResult;

    try {
        const body = await req.json();
        const { fileId, name, size, mimeType, workspaceId, pageId } = body;

        if (!fileId || !name || typeof size !== 'number') {
            return NextResponse.json(
                { error: 'Missing required fields: fileId, name, size' },
                { status: 400 }
            );
        }

        // Record the file in RTDB for storage tracking
        await recordFileUploadWithIndex(uid, {
            id: fileId,
            name,
            size,
            mimeType: mimeType || 'application/octet-stream',
            workspaceId: workspaceId || 'personal',
            pageId: pageId || undefined
        });

        // console.log(`[api/files/register] Tracked file ${fileId} for user ${uid}, size: ${size} bytes`);

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error('[api/files/register] error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to register file' },
            { status: 500 }
        );
    }
}

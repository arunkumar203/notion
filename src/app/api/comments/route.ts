import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth as adminAuth } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const jsonError = (status: number, message: string) =>
    NextResponse.json({ error: message }, { status });

export const runtime = 'nodejs';

/**
 * Comment API Route
 * 
 * Handles CRUD operations for page comments stored in Firestore page documents
 * 
 * Structure: pages/{pageId} -> comments: { [commentId]: Comment[] }
 */

// GET: Fetch all comments for a page
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
        const pageId = url.searchParams.get('pageId');

        if (!pageId) {
            return jsonError(400, 'Missing pageId parameter');
        }

        // Fetch page document from Firestore
        const firestore = getFirestore();
        const pageRef = firestore.collection('pages').doc(pageId);
        const pageDoc = await pageRef.get();

        if (!pageDoc.exists) {
            return NextResponse.json({ comments: [] });
        }

        const pageData = pageDoc.data();
        const commentsData = pageData?.comments || {};
        const comments: any[] = [];

        // Flatten the nested structure
        Object.entries(commentsData).forEach(([commentId, threads]: [string, any]) => {
            if (Array.isArray(threads)) {
                threads.forEach((comment: any) => {
                    comments.push({
                        ...comment,
                        commentId, // The mark ID this comment belongs to
                    });
                });
            }
        });

        return NextResponse.json({ comments });
    } catch (error) {
        console.error('Error fetching comments:', error);
        return jsonError(500, 'Failed to fetch comments');
    }
}

// POST: Add a new comment
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
        const email = decoded?.email || 'Anonymous';

        const body = await req.json();
        const { pageId, commentId, text } = body;

        if (!pageId || !commentId || !text) {
            return jsonError(400, 'Missing required fields: pageId, commentId, text');
        }

        // Generate unique thread comment ID
        const threadCommentId = `${commentId}-${Date.now()}`;
        const now = Date.now();

        const commentData = {
            id: threadCommentId,
            text: text.trim(),
            authorId: uid,
            authorName: email.split('@')[0], // Use email prefix as name
            createdAt: now,
            updatedAt: now,
        };

        // Add comment to Firestore page document
        const firestore = getFirestore();
        const pageRef = firestore.collection('pages').doc(pageId);

        // Get current page data
        const pageDoc = await pageRef.get();
        if (!pageDoc.exists) {
            return jsonError(404, 'Page not found');
        }

        const pageData = pageDoc.data();
        const comments = pageData?.comments || {};

        // Initialize array for this commentId if it doesn't exist
        if (!comments[commentId]) {
            comments[commentId] = [];
        }

        // Add new comment
        comments[commentId].push(commentData);

        // Update page document
        await pageRef.update({ comments });

        return NextResponse.json({
            success: true,
            comment: {
                ...commentData,
                commentId,
            },
        });
    } catch (error) {
        console.error('Error adding comment:', error);
        return jsonError(500, 'Failed to add comment');
    }
}

// PUT: Update an existing comment
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
        const { pageId, commentId, threadCommentId, text } = body;

        if (!pageId || !commentId || !threadCommentId || !text) {
            return jsonError(400, 'Missing required fields');
        }

        // Get page document
        const firestore = getFirestore();
        const pageRef = firestore.collection('pages').doc(pageId);
        const pageDoc = await pageRef.get();

        if (!pageDoc.exists) {
            return jsonError(404, 'Page not found');
        }

        const pageData = pageDoc.data();
        const comments = pageData?.comments || {};

        if (!comments[commentId] || !Array.isArray(comments[commentId])) {
            return jsonError(404, 'Comment not found');
        }

        // Find and update the comment
        const commentIndex = comments[commentId].findIndex((c: any) => c.id === threadCommentId);

        if (commentIndex === -1) {
            return jsonError(404, 'Comment not found');
        }

        const existingComment = comments[commentId][commentIndex];

        if (existingComment.authorId !== uid) {
            return jsonError(403, 'You can only edit your own comments');
        }

        // Update comment
        comments[commentId][commentIndex] = {
            ...existingComment,
            text: text.trim(),
            updatedAt: Date.now(),
        };

        // Update page document
        await pageRef.update({ comments });

        return NextResponse.json({
            success: true,
            comment: {
                ...comments[commentId][commentIndex],
                commentId,
            },
        });
    } catch (error) {
        console.error('Error updating comment:', error);
        return jsonError(500, 'Failed to update comment');
    }
}

// DELETE: Delete a comment
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
        const pageId = url.searchParams.get('pageId');
        const commentId = url.searchParams.get('commentId');
        const threadCommentId = url.searchParams.get('threadCommentId');

        if (!pageId || !commentId || !threadCommentId) {
            return jsonError(400, 'Missing required parameters');
        }

        // Get page document
        const firestore = getFirestore();
        const pageRef = firestore.collection('pages').doc(pageId);
        const pageDoc = await pageRef.get();

        if (!pageDoc.exists) {
            return jsonError(404, 'Page not found');
        }

        const pageData = pageDoc.data();
        const comments = pageData?.comments || {};

        if (!comments[commentId] || !Array.isArray(comments[commentId])) {
            return jsonError(404, 'Comment not found');
        }

        // Find the comment
        const commentIndex = comments[commentId].findIndex((c: any) => c.id === threadCommentId);

        if (commentIndex === -1) {
            return jsonError(404, 'Comment not found');
        }

        const existingComment = comments[commentId][commentIndex];

        if (existingComment.authorId !== uid) {
            return jsonError(403, 'You can only delete your own comments');
        }

        // Remove comment
        comments[commentId].splice(commentIndex, 1);

        // If no comments left for this mark, remove the array
        if (comments[commentId].length === 0) {
            delete comments[commentId];
        }

        // Update page document
        await pageRef.update({ comments });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting comment:', error);
        return jsonError(500, 'Failed to delete comment');
    }
}

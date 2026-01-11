import { rtdb } from './firebase';
import { ref, push, serverTimestamp, query, limitToLast, get, orderByKey } from 'firebase/database';

export type AuditLogAction =
    | 'WORKSPACE_JOINED'
    | 'WORKSPACE_MEMBER_REMOVED'
    | 'WORKSPACE_MEMBER_ROLE_CHANGED'
    | 'NOTEBOOK_CREATED'
    | 'NOTEBOOK_DELETED'
    | 'NOTEBOOK_RENAMED'
    | 'SECTION_CREATED'
    | 'SECTION_DELETED'
    | 'TOPIC_CREATED'
    | 'TOPIC_DELETED'
    | 'PAGE_CREATED'
    | 'PAGE_DELETED'
    | 'PAGE_RENAMED'
    | 'COMMENT_ADDED'
    | 'COMMENT_DELETED'
    | 'INVITE_SENT'
    | 'INVITE_ACCEPTED'
    | 'INVITE_CANCELLED';

export interface AuditLog {
    id: string;
    workspaceId: string;
    userId: string;
    userEmail: string;
    userName?: string;
    action: string;
    targetId?: string;
    targetName?: string;
    details?: string;
    timestamp: number;
}

export async function logAction(params: {
    workspaceId: string;
    userId: string;
    userEmail: string;
    userName?: string;
    action: string;
    targetId?: string;
    targetName?: string;
    details?: string;
}) {
    try {
        const logsRef = ref(rtdb, `workspaces/${params.workspaceId}/audit_logs`);
        await push(logsRef, {
            ...params,
            timestamp: serverTimestamp(),
        });
    } catch (error) {
        console.error('Error logging action to RTDB:', error);
    }
}

export async function getWorkspaceLogs(workspaceId: string, limitCount: number = 50) {
    try {
        const logsRef = ref(rtdb, `workspaces/${workspaceId}/audit_logs`);
        // We order by key since RTDB keys are chronological
        const q = query(logsRef, orderByKey(), limitToLast(limitCount));
        const snapshot = await get(q);

        if (!snapshot.exists()) return [];

        const logs: AuditLog[] = [];
        snapshot.forEach((child) => {
            logs.push({
                id: child.key as string,
                ...child.val(),
                // Fallback for timestamp if needed
                timestamp: child.val().timestamp || Date.now(),
            });
        });

        // Reverse to get descending order (newest first)
        return logs.reverse();
    } catch (error) {
        console.error('Error fetching logs from RTDB:', error);
        return [];
    }
}

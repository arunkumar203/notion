/**
 * Storage Management Utilities
 * 
 * Tracks per-user file storage usage with configurable limits.
 * Files are tracked in RTDB: users/{userId}/files/{fileId}
 * Storage used is aggregated in: users/{userId}/storageUsed
 * Default limit is in: adminSettings/defaultStorageLimit
 */

import admin, { rtdb } from '@/lib/firebase-admin';

const DEFAULT_STORAGE_LIMIT = 50 * 1024 * 1024; // 50MB in bytes

// Helper to get database reference
function getDb(): admin.database.Database {
    const database = rtdb || (admin.apps.length > 0 ? admin.database() : null);
    if (!database) {
        console.error('[storage] Firebase Admin not initialized - cannot access RTDB');
        throw new Error('Firebase Admin not initialized');
    }
    return database;
}

export interface FileRecord {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    uploadedBy: string;
    workspaceId: string;
    pageId?: string;
    createdAt: number;
}

/**
 * Get the storage limit for users (from admin settings)
 */
export async function getStorageLimit(): Promise<number> {
    try {
        const snap = await getDb().ref('adminSettings/defaultStorageLimit').once('value');
        return snap.exists() ? snap.val() : DEFAULT_STORAGE_LIMIT;
    } catch (error) {
        console.error('Error getting storage limit:', error);
        return DEFAULT_STORAGE_LIMIT;
    }
}

/**
 * Get a user's current storage usage
 */
export async function getUserStorageUsed(userId: string): Promise<number> {
    try {
        const snap = await getDb().ref(`users/${userId}/storageUsed`).once('value');
        return snap.exists() ? snap.val() : 0;
    } catch (error) {
        console.error('Error getting storage used:', error);
        return 0;
    }
}

/**
 * Check if user can upload a file of given size
 */
export async function canUploadFile(userId: string, fileSize: number): Promise<{ allowed: boolean; used: number; limit: number; remaining: number }> {
    const [used, limit] = await Promise.all([
        getUserStorageUsed(userId),
        getStorageLimit()
    ]);

    const remaining = Math.max(0, limit - used);
    const allowed = (used + fileSize) <= limit;

    return { allowed, used, limit, remaining };
}

/**
 * Record a file upload and increment user's storage
 */
export async function recordFileUpload(
    userId: string,
    fileRecord: Omit<FileRecord, 'uploadedBy' | 'createdAt'>
): Promise<void> {
    const record: FileRecord = {
        ...fileRecord,
        uploadedBy: userId,
        createdAt: Date.now()
    };

    const updates: Record<string, any> = {};

    // Store file record under user
    updates[`users/${userId}/files/${record.id}`] = record;

    // Increment storage used (using server transaction for atomicity)
    const storageRef = getDb().ref(`users/${userId}/storageUsed`);

    await Promise.all([
        getDb().ref().update(updates),
        storageRef.transaction((current: number | null) => (current || 0) + record.size)
    ]);
}

/**
 * Get a file record by ID
 */
export async function getFileRecord(fileId: string): Promise<FileRecord | null> {
    // We need to search across all users since we don't know who uploaded it
    // This is inefficient - in production, consider a separate files index
    // For now, we'll look up by the file ID pattern in Appwrite metadata

    // Alternative: Store a global index at files/{fileId} pointing to owner
    const indexSnap = await getDb().ref(`fileIndex/${fileId}`).once('value');
    if (!indexSnap.exists()) {
        return null;
    }

    const uploaderId = indexSnap.val();
    const fileSnap = await getDb().ref(`users/${uploaderId}/files/${fileId}`).once('value');

    return fileSnap.exists() ? fileSnap.val() : null;
}

/**
 * Delete a file record and decrement the uploader's storage
 */
export async function deleteFileRecord(fileId: string): Promise<{ uploaderId: string; size: number } | null> {
    const record = await getFileRecord(fileId);
    if (!record) {
        return null;
    }

    const { uploadedBy, size } = record;

    const updates: Record<string, null> = {};
    updates[`users/${uploadedBy}/files/${fileId}`] = null;
    updates[`fileIndex/${fileId}`] = null;

    const storageRef = getDb().ref(`users/${uploadedBy}/storageUsed`);

    await Promise.all([
        getDb().ref().update(updates),
        storageRef.transaction((current: number | null) => Math.max(0, (current || 0) - size))
    ]);

    return { uploaderId: uploadedBy, size };
}

/**
 * Record file upload with global index for lookup
 */
export async function recordFileUploadWithIndex(
    userId: string,
    fileRecord: Omit<FileRecord, 'uploadedBy' | 'createdAt'>
): Promise<void> {
    const record: FileRecord = {
        ...fileRecord,
        uploadedBy: userId,
        createdAt: Date.now()
    };

    // Remove undefined values (Firebase RTDB doesn't accept undefined)
    const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([_, v]) => v !== undefined)
    );

    const updates: Record<string, any> = {};

    // Store file record under user
    updates[`users/${userId}/files/${record.id}`] = cleanRecord;

    // Store global index for reverse lookup
    updates[`fileIndex/${record.id}`] = userId;

    try {
        const db = getDb();
        const storageRef = db.ref(`users/${userId}/storageUsed`);

        await Promise.all([
            db.ref().update(updates),
            storageRef.transaction((current: number | null) => (current || 0) + record.size)
        ]);
    } catch (err: any) {
        console.error('[storage] Error writing to RTDB:', err.message, err.code);
        throw err;
    }
}

/**
 * Get all files for a user (for account page)
 */
export async function getUserFiles(userId: string): Promise<FileRecord[]> {
    const snap = await getDb().ref(`users/${userId}/files`).once('value');
    if (!snap.exists()) {
        return [];
    }

    const files: FileRecord[] = [];
    snap.forEach((child) => {
        files.push(child.val());
    });

    return files;
}

/**
 * Delete all files for a specific entity (cascade delete)
 * Used when deleting pages, topics, sections, notebooks, or workspaces
 * Returns the total size freed, grouped by uploader for storage adjustment
 */
export async function deleteFilesForEntity(
    entityType: 'page' | 'workspace',
    entityId: string
): Promise<Record<string, number>> {
    const freedByUploader: Record<string, number> = {};

    // Query all file records (this is expensive - consider indexing by workspace/page)
    const indexSnap = await getDb().ref('fileIndex').once('value');
    if (!indexSnap.exists()) {
        return freedByUploader;
    }

    const filesToDelete: string[] = [];
    const promises: Promise<void>[] = [];

    // For each file, check if it belongs to the entity
    indexSnap.forEach((child) => {
        const fileId = child.key!;
        const uploaderId = child.val();

        promises.push((async () => {
            const fileSnap = await getDb().ref(`users/${uploaderId}/files/${fileId}`).once('value');
            if (!fileSnap.exists()) return;

            const file: FileRecord = fileSnap.val();
            const matches = entityType === 'workspace'
                ? file.workspaceId === entityId
                : file.pageId === entityId;

            if (matches) {
                filesToDelete.push(fileId);
                freedByUploader[file.uploadedBy] = (freedByUploader[file.uploadedBy] || 0) + file.size;
            }
        })());
    });

    await Promise.all(promises);

    // Delete files and update storage
    for (const fileId of filesToDelete) {
        await deleteFileRecord(fileId);
    }

    return freedByUploader;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

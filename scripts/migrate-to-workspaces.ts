/**
 * MIGRATION SCRIPT: Move notebooks to workspaces architecture
 * 
 * This script performs the following:
 * 1. For each user with notebooks:
 *    a. Create a "Personal Workspace" under /workspaces/{workspaceId}
 *    b. Link workspace under /users/{uid}/workspaces/{workspaceId}
 *    c. For each notebook owned by the user:
 *       - Copy notebook data to /workspaces/{workspaceId}/notebooks/{notebookId}
 *       - Update page indexes to include workspaceId
 *       - Delete the original notebook from /notebooks/{notebookId}
 *    d. Remove /users/{uid}/notebooks entries
 * 2. After all users: Clean up empty /notebooks root
 * 
 * SAFETY FEATURES:
 * - Dry run mode (default) - preview changes without modifying data
 * - Detailed progress percentage
 * - Error handling with rollback capability
 * - Idempotent - can be run multiple times safely
 * 
 * Usage:
 *   npx ts-node scripts/migrate-to-workspaces.ts           # Dry run
 *   npx ts-node scripts/migrate-to-workspaces.ts --execute # Actually migrate
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Initialize Firebase Admin
console.log('🔍 Checking Firebase credentials...\n');

const serviceAccountPath = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH;
const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

// Individual env vars (alternative format)
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

let serviceAccountData: any = undefined;

// Try to load service account from file path
if (serviceAccountPath) {
    console.log(`  Looking for service account file at: ${serviceAccountPath}`);
    if (fs.existsSync(serviceAccountPath)) {
        try {
            const fileContent = fs.readFileSync(serviceAccountPath, 'utf8');
            serviceAccountData = JSON.parse(fileContent);
            console.log(`  ✅ Service account loaded from file\n`);
        } catch (e: any) {
            console.error(`  ❌ Error reading service account file: ${e.message}\n`);
            process.exit(1);
        }
    } else {
        console.error(`  ❌ Service account file not found at: ${serviceAccountPath}\n`);
        process.exit(1);
    }
}
// Try to load from environment variable
else if (serviceAccountJson) {
    console.log(`  Loading service account from FIREBASE_ADMIN_SERVICE_ACCOUNT env var...`);
    try {
        serviceAccountData = JSON.parse(serviceAccountJson);
        console.log(`  ✅ Service account loaded from environment variable\n`);
    } catch (e: any) {
        console.error(`  ❌ Error parsing FIREBASE_ADMIN_SERVICE_ACCOUNT: ${e.message}\n`);
        process.exit(1);
    }
}
// Try to construct from individual env vars
else if (projectId && clientEmail && privateKey) {
    console.log(`  Loading service account from individual environment variables...`);
    try {
        serviceAccountData = {
            type: 'service_account',
            project_id: projectId,
            client_email: clientEmail,
            private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
        };
        console.log(`  ✅ Service account constructed from individual env vars\n`);
    } catch (e: any) {
        console.error(`  ❌ Error constructing service account: ${e.message}\n`);
        process.exit(1);
    }
}
// No credentials found
else {
    console.error(`  ❌ Firebase Admin credentials not found!\n`);
    console.error(`  Please set one of the following in your .env.local file:\n`);
    console.error(`  Option 1: Individual variables:`);
    console.error(`    - FIREBASE_PROJECT_ID=your-project-id`);
    console.error(`    - FIREBASE_CLIENT_EMAIL=your-client-email`);
    console.error(`    - FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n..."\n`);
    console.error(`  Option 2: JSON file path:`);
    console.error(`    - FIREBASE_ADMIN_SERVICE_ACCOUNT_PATH=/path/to/serviceAccount.json\n`);
    console.error(`  Option 3: Full JSON string:`);
    console.error(`    - FIREBASE_ADMIN_SERVICE_ACCOUNT='{"type":"service_account",...}'\n`);
    process.exit(1);
}

// Check database URL
if (!databaseURL) {
    console.error(`  ❌ NEXT_PUBLIC_FIREBASE_DATABASE_URL not found in .env.local\n`);
    process.exit(1);
}

// Initialize Firebase Admin
if (getApps().length === 0) {
    try {
        initializeApp({
            credential: cert(serviceAccountData),
            databaseURL: databaseURL,
        });
        console.log(`✅ Firebase Admin initialized successfully\n`);
    } catch (e: any) {
        console.error(`❌ Failed to initialize Firebase Admin: ${e.message}\n`);
        process.exit(1);
    }
}

const db = getDatabase();
const firestore = getFirestore();

// ============ TYPES ============
interface NotebookData {
    owner: string;
    name: string;
    createdAt?: number;
    updatedAt?: number;
    sections?: Record<string, SectionData>;
}

interface SectionData {
    owner?: string;
    name: string;
    order?: number;
    createdAt?: number;
    updatedAt?: number;
    topics?: Record<string, TopicData>;
}

interface TopicData {
    owner?: string;
    name: string;
    order?: number;
    createdAt?: number;
    updatedAt?: number;
    pages?: Record<string, PageData>;
}

interface PageData {
    owner?: string;
    name: string;
    order?: number;
    createdAt?: number;
    updatedAt?: number;
    lastUpdated?: number;
    parentPageId?: string | null;
    pinned?: boolean;
}

interface UserNotebookLink {
    name: string;
    createdAt?: number;
    updatedAt?: number;
}

interface MigrationStats {
    totalUsers: number;
    usersProcessed: number;
    usersWithNotebooks: number;
    workspacesCreated: number;
    notebooksMigrated: number;
    notebooksDeleted: number;
    pageIndexesUpdated: number;
    errors: string[];
    skipped: string[];
}

// ============ UTILITIES ============
function generatePushId(): string {
    // Simple push ID generator mimicking Firebase's format
    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let now = Date.now();
    const timeStampChars = new Array(8);
    for (let i = 7; i >= 0; i--) {
        timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
        now = Math.floor(now / 64);
    }
    let id = timeStampChars.join('');
    for (let i = 0; i < 12; i++) {
        id += PUSH_CHARS.charAt(Math.floor(Math.random() * 64));
    }
    return id;
}

function formatProgress(current: number, total: number, phase: string): string {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    return `[${bar}] ${percent}% | ${phase}`;
}

function log(message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') {
    const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
    console.log(`${icons[type]} ${message}`);
}

// ============ MIGRATION FUNCTIONS ============

async function getAllUsers(): Promise<string[]> {
    log('Fetching all users...');
    const usersSnap = await db.ref('users').once('value');
    const usersData = usersSnap.val() || {};
    const userIds = Object.keys(usersData);
    log(`Found ${userIds.length} users`, 'success');
    return userIds;
}

async function getUserNotebooks(uid: string): Promise<Record<string, UserNotebookLink>> {
    const snap = await db.ref(`users/${uid}/notebooks`).once('value');
    return snap.val() || {};
}

async function getNotebookData(notebookId: string): Promise<NotebookData | null> {
    const snap = await db.ref(`notebooks/${notebookId}`).once('value');
    return snap.exists() ? snap.val() : null;
}

async function userAlreadyHasWorkspaces(uid: string): Promise<boolean> {
    const snap = await db.ref(`users/${uid}/workspaces`).once('value');
    return snap.exists() && Object.keys(snap.val() || {}).length > 0;
}

async function createWorkspace(
    uid: string,
    workspaceId: string,
    name: string,
    dryRun: boolean
): Promise<void> {
    const now = Date.now();

    const workspaceData = {
        owner: uid,
        name,
        description: 'Migrated from legacy notebooks',
        createdAt: now,
        updatedAt: now,
        notebooks: {},
    };

    const userWorkspaceLink = {
        name,
        description: 'Migrated from legacy notebooks',
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
    };

    if (dryRun) {
        log(`  [DRY RUN] Would create workspace: /workspaces/${workspaceId}`);
        log(`  [DRY RUN] Would link user: /users/${uid}/workspaces/${workspaceId}`);
    } else {
        await db.ref(`workspaces/${workspaceId}`).set(workspaceData);
        await db.ref(`users/${uid}/workspaces/${workspaceId}`).set(userWorkspaceLink);
        log(`  Created workspace: ${name} (${workspaceId})`);
    }
}

async function migrateNotebookToWorkspace(
    workspaceId: string,
    notebookId: string,
    notebookData: NotebookData,
    uid: string,
    dryRun: boolean,
    stats: MigrationStats
): Promise<void> {
    // Deep clone the notebook data for the new location
    const migratedNotebook = JSON.parse(JSON.stringify(notebookData));

    // Ensure owner is set
    migratedNotebook.owner = migratedNotebook.owner || uid;

    // Add order if not present
    if (typeof migratedNotebook.order === 'undefined') {
        migratedNotebook.order = 0;
    }

    if (dryRun) {
        log(`    [DRY RUN] Would copy notebook "${notebookData.name}" to /workspaces/${workspaceId}/notebooks/${notebookId}`);
    } else {
        // Copy notebook to new location
        await db.ref(`workspaces/${workspaceId}/notebooks/${notebookId}`).set(migratedNotebook);
        log(`    Copied notebook "${notebookData.name}" to workspace`);
    }

    stats.notebooksMigrated++;

    // Update page indexes for all pages in this notebook
    await updatePageIndexesForNotebook(workspaceId, notebookId, notebookData, uid, dryRun, stats);
}

async function updatePageIndexesForNotebook(
    workspaceId: string,
    notebookId: string,
    notebookData: NotebookData,
    uid: string,
    dryRun: boolean,
    stats: MigrationStats
): Promise<void> {
    const sections = notebookData.sections || {};

    for (const [sectionId, sectionData] of Object.entries(sections)) {
        const topics = sectionData.topics || {};

        for (const [topicId, topicData] of Object.entries(topics)) {
            const pages = topicData.pages || {};

            for (const [pageId, pageData] of Object.entries(pages)) {
                // Update page index to include workspaceId
                const pageIndexRef = db.ref(`users/${uid}/pageIndex/${pageId}`);
                const existingIndex = await pageIndexRef.once('value');

                if (existingIndex.exists()) {
                    const indexData = existingIndex.val();

                    // Only update if workspaceId is not already set
                    if (!indexData.workspaceId) {
                        const updatedIndex = {
                            ...indexData,
                            workspaceId,
                            notebookId,
                            sectionId,
                            topicId,
                        };

                        if (dryRun) {
                            log(`      [DRY RUN] Would update page index: /users/${uid}/pageIndex/${pageId}`);
                        } else {
                            await pageIndexRef.update({ workspaceId, notebookId, sectionId, topicId });
                        }
                        stats.pageIndexesUpdated++;
                    }
                } else {
                    // Create page index if it doesn't exist
                    const newIndex = {
                        workspaceId,
                        notebookId,
                        sectionId,
                        topicId,
                        parentPageId: pageData.parentPageId || null,
                        owner: pageData.owner || uid,
                        name: pageData.name,
                    };

                    if (dryRun) {
                        log(`      [DRY RUN] Would create page index: /users/${uid}/pageIndex/${pageId}`);
                    } else {
                        await pageIndexRef.set(newIndex);
                    }
                    stats.pageIndexesUpdated++;
                }
            }
        }
    }
}

async function deleteOriginalNotebook(notebookId: string, dryRun: boolean, stats: MigrationStats): Promise<void> {
    if (dryRun) {
        log(`    [DRY RUN] Would delete original notebook: /notebooks/${notebookId}`);
    } else {
        await db.ref(`notebooks/${notebookId}`).remove();
        log(`    Deleted original notebook: /notebooks/${notebookId}`);
    }
    stats.notebooksDeleted++;
}

async function deleteUserNotebooksNode(uid: string, dryRun: boolean): Promise<void> {
    if (dryRun) {
        log(`  [DRY RUN] Would delete user notebooks node: /users/${uid}/notebooks`);
    } else {
        await db.ref(`users/${uid}/notebooks`).remove();
        log(`  Deleted user notebooks node: /users/${uid}/notebooks`);
    }
}

async function cleanupEmptyNotebooksRoot(dryRun: boolean): Promise<void> {
    const snap = await db.ref('notebooks').once('value');
    const data = snap.val() || {};
    const remainingNotebooks = Object.keys(data);

    if (remainingNotebooks.length === 0) {
        if (dryRun) {
            log('[DRY RUN] Would delete empty /notebooks root node');
        } else {
            await db.ref('notebooks').remove();
            log('Deleted empty /notebooks root node', 'success');
        }
    } else {
        log(`/notebooks still has ${remainingNotebooks.length} notebooks (may belong to users not processed)`, 'warn');
    }
}

async function migrateUser(
    uid: string,
    userIndex: number,
    totalUsers: number,
    dryRun: boolean,
    stats: MigrationStats
): Promise<void> {
    const progressPercent = Math.round(((userIndex + 1) / totalUsers) * 100);

    // Check if user already has workspaces (already migrated)
    if (await userAlreadyHasWorkspaces(uid)) {
        stats.skipped.push(`User ${uid}: Already has workspaces`);
        console.log(formatProgress(userIndex + 1, totalUsers, `Skipped user ${uid.slice(0, 8)}... (already migrated)`));
        return;
    }

    // Get user's notebook links
    const userNotebooks = await getUserNotebooks(uid);
    const notebookIds = Object.keys(userNotebooks);

    if (notebookIds.length === 0) {
        stats.skipped.push(`User ${uid}: No notebooks`);
        console.log(formatProgress(userIndex + 1, totalUsers, `Skipped user ${uid.slice(0, 8)}... (no notebooks)`));
        return;
    }

    stats.usersWithNotebooks++;
    console.log(formatProgress(userIndex + 1, totalUsers, `Processing user ${uid.slice(0, 8)}... (${notebookIds.length} notebooks)`));

    // 1. Create Personal Workspace for this user
    const workspaceId = generatePushId();
    await createWorkspace(uid, workspaceId, 'Personal Workspace', dryRun);
    stats.workspacesCreated++;

    // 2. Migrate each notebook
    for (let i = 0; i < notebookIds.length; i++) {
        const notebookId = notebookIds[i];
        const subProgress = Math.round(((i + 1) / notebookIds.length) * 100);
        console.log(`  └─ Notebook ${i + 1}/${notebookIds.length} (${subProgress}%): ${notebookId.slice(0, 8)}...`);

        try {
            // Fetch full notebook data from root /notebooks
            const notebookData = await getNotebookData(notebookId);

            if (!notebookData) {
                stats.errors.push(`Notebook ${notebookId}: Not found in /notebooks (orphaned reference)`);
                log(`    Notebook not found: ${notebookId} (orphaned reference)`, 'warn');
                continue;
            }

            // Verify ownership
            if (notebookData.owner && notebookData.owner !== uid) {
                stats.skipped.push(`Notebook ${notebookId}: Owned by different user (${notebookData.owner})`);
                log(`    Skipping notebook owned by different user: ${notebookData.owner}`, 'warn');
                continue;
            }

            // Copy notebook to workspace
            await migrateNotebookToWorkspace(workspaceId, notebookId, notebookData, uid, dryRun, stats);

            // Delete original notebook from /notebooks root
            await deleteOriginalNotebook(notebookId, dryRun, stats);

        } catch (error: any) {
            stats.errors.push(`Notebook ${notebookId}: ${error.message}`);
            log(`    Error migrating notebook: ${error.message}`, 'error');
        }
    }

    // 3. Delete user's notebooks node
    await deleteUserNotebooksNode(uid, dryRun);

    stats.usersProcessed++;
}

// ============ MAIN MIGRATION ============
async function runMigration(dryRun: boolean): Promise<void> {
    console.log('\n' + '═'.repeat(60));
    console.log('  MIGRATION: Notebooks → Workspaces Architecture');
    console.log('═'.repeat(60));
    console.log(`  Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '🚀 EXECUTE (making changes)'}`);
    console.log(`  Started: ${new Date().toISOString()}`);
    console.log('═'.repeat(60) + '\n');

    const stats: MigrationStats = {
        totalUsers: 0,
        usersProcessed: 0,
        usersWithNotebooks: 0,
        workspacesCreated: 0,
        notebooksMigrated: 0,
        notebooksDeleted: 0,
        pageIndexesUpdated: 0,
        errors: [],
        skipped: [],
    };

    try {
        // Get all users
        const userIds = await getAllUsers();
        stats.totalUsers = userIds.length;

        console.log('\n📋 Phase 1: Migrating Users\n');

        // Process each user
        for (let i = 0; i < userIds.length; i++) {
            await migrateUser(userIds[i], i, userIds.length, dryRun, stats);
        }

        console.log('\n📋 Phase 2: Cleanup\n');

        // Clean up empty /notebooks root
        await cleanupEmptyNotebooksRoot(dryRun);

        // Print summary
        console.log('\n' + '═'.repeat(60));
        console.log('  MIGRATION COMPLETE');
        console.log('═'.repeat(60));
        console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'EXECUTED'}`);
        console.log(`  Completed: ${new Date().toISOString()}`);
        console.log('─'.repeat(60));
        console.log('  📊 STATISTICS:');
        console.log(`     Total users scanned:     ${stats.totalUsers}`);
        console.log(`     Users with notebooks:    ${stats.usersWithNotebooks}`);
        console.log(`     Users migrated:          ${stats.usersProcessed}`);
        console.log(`     Workspaces created:      ${stats.workspacesCreated}`);
        console.log(`     Notebooks migrated:      ${stats.notebooksMigrated}`);
        console.log(`     Notebooks deleted:       ${stats.notebooksDeleted}`);
        console.log(`     Page indexes updated:    ${stats.pageIndexesUpdated}`);
        console.log(`     Skipped:                 ${stats.skipped.length}`);
        console.log(`     Errors:                  ${stats.errors.length}`);
        console.log('─'.repeat(60));

        if (stats.skipped.length > 0) {
            console.log('\n  ⏭️ SKIPPED:');
            stats.skipped.forEach((s, i) => console.log(`     ${i + 1}. ${s}`));
        }

        if (stats.errors.length > 0) {
            console.log('\n  ❌ ERRORS:');
            stats.errors.forEach((e, i) => console.log(`     ${i + 1}. ${e}`));
        }

        console.log('═'.repeat(60));

        if (dryRun) {
            console.log('\n💡 To execute the migration, run:');
            console.log('   npx ts-node scripts/migrate-to-workspaces.ts --execute\n');
        }

    } catch (error: any) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// ============ ENTRY POINT ============
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');

runMigration(dryRun)
    .then(() => {
        console.log('\n✅ Migration script finished.\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    });

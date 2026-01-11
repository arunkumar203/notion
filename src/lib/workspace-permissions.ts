/**
 * Workspace Sharing - Roles & Permissions
 * 
 * These are WORKSPACE-level roles, NOT application roles (root_admin, admin, user)
 */

// All possible workspace actions
export const WORKSPACE_ACTIONS = {
    // Workspace Management
    VIEW_WORKSPACE: 'view_workspace',
    RENAME_WORKSPACE: 'rename_workspace',
    DELETE_WORKSPACE: 'delete_workspace',
    MANAGE_SETTINGS: 'manage_settings',

    // Member Management
    INVITE_MEMBERS: 'invite_members',
    REMOVE_MEMBERS: 'remove_members',
    CHANGE_ROLES: 'change_roles',
    MANAGE_PERMISSIONS: 'manage_permissions',

    // Notebook Actions
    CREATE_NOTEBOOK: 'create_notebook',
    RENAME_NOTEBOOK: 'rename_notebook',
    DELETE_NOTEBOOK: 'delete_notebook',
    VIEW_NOTEBOOK: 'view_notebook',

    // Section Actions
    CREATE_SECTION: 'create_section',
    RENAME_SECTION: 'rename_section',
    DELETE_SECTION: 'delete_section',
    MOVE_SECTION: 'move_section',
    VIEW_SECTION: 'view_section',

    // Topic Actions
    CREATE_TOPIC: 'create_topic',
    RENAME_TOPIC: 'rename_topic',
    DELETE_TOPIC: 'delete_topic',
    MOVE_TOPIC: 'move_topic',
    VIEW_TOPIC: 'view_topic',

    // Page Actions
    CREATE_PAGE: 'create_page',
    EDIT_PAGE: 'edit_page',
    DELETE_PAGE: 'delete_page',
    MOVE_PAGE: 'move_page',
    VIEW_PAGE: 'view_page',
    EXPORT_PAGE: 'export_page',

    // Comment Actions
    ADD_COMMENT: 'add_comment',
    EDIT_OWN_COMMENT: 'edit_own_comment',
    DELETE_OWN_COMMENT: 'delete_own_comment',
    DELETE_ANY_COMMENT: 'delete_any_comment',
    VIEW_COMMENTS: 'view_comments',

    // File Actions
    UPLOAD_FILES: 'upload_files',
    DELETE_OWN_FILE: 'delete_own_file',   // Editor can delete their own files
    DELETE_ANY_FILE: 'delete_any_file',   // Admin/Owner can delete any file
    VIEW_FILES: 'view_files',
} as const;

export type WorkspaceAction = typeof WORKSPACE_ACTIONS[keyof typeof WORKSPACE_ACTIONS];

// Workspace roles
export const WORKSPACE_ROLES = {
    OWNER: 'owner',
    ADMIN: 'admin',
    EDITOR: 'editor',
    COMMENTER: 'commenter',
    VIEWER: 'viewer',
} as const;

export type WorkspaceRole = typeof WORKSPACE_ROLES[keyof typeof WORKSPACE_ROLES];

// Roles that can be assigned via invite (owner is automatic)
export const ASSIGNABLE_ROLES: WorkspaceRole[] = ['admin', 'editor', 'commenter', 'viewer'];

// Default permissions for each role
export const DEFAULT_ROLE_PERMISSIONS: Record<WorkspaceRole, WorkspaceAction[]> = {
    owner: Object.values(WORKSPACE_ACTIONS), // All actions

    admin: [
        // Workspace (except delete)
        WORKSPACE_ACTIONS.VIEW_WORKSPACE,
        WORKSPACE_ACTIONS.RENAME_WORKSPACE,
        WORKSPACE_ACTIONS.MANAGE_SETTINGS,
        // Member management
        WORKSPACE_ACTIONS.INVITE_MEMBERS,
        WORKSPACE_ACTIONS.REMOVE_MEMBERS,
        WORKSPACE_ACTIONS.CHANGE_ROLES,
        WORKSPACE_ACTIONS.MANAGE_PERMISSIONS,
        // All notebook actions
        WORKSPACE_ACTIONS.CREATE_NOTEBOOK,
        WORKSPACE_ACTIONS.RENAME_NOTEBOOK,
        WORKSPACE_ACTIONS.DELETE_NOTEBOOK,
        WORKSPACE_ACTIONS.VIEW_NOTEBOOK,
        // All section actions
        WORKSPACE_ACTIONS.CREATE_SECTION,
        WORKSPACE_ACTIONS.RENAME_SECTION,
        WORKSPACE_ACTIONS.DELETE_SECTION,
        WORKSPACE_ACTIONS.MOVE_SECTION,
        WORKSPACE_ACTIONS.VIEW_SECTION,
        // All topic actions
        WORKSPACE_ACTIONS.CREATE_TOPIC,
        WORKSPACE_ACTIONS.RENAME_TOPIC,
        WORKSPACE_ACTIONS.DELETE_TOPIC,
        WORKSPACE_ACTIONS.MOVE_TOPIC,
        WORKSPACE_ACTIONS.VIEW_TOPIC,
        // All page actions
        WORKSPACE_ACTIONS.CREATE_PAGE,
        WORKSPACE_ACTIONS.EDIT_PAGE,
        WORKSPACE_ACTIONS.DELETE_PAGE,
        WORKSPACE_ACTIONS.MOVE_PAGE,
        WORKSPACE_ACTIONS.VIEW_PAGE,
        WORKSPACE_ACTIONS.EXPORT_PAGE,
        // All comment actions
        WORKSPACE_ACTIONS.ADD_COMMENT,
        WORKSPACE_ACTIONS.EDIT_OWN_COMMENT,
        WORKSPACE_ACTIONS.DELETE_OWN_COMMENT,
        WORKSPACE_ACTIONS.DELETE_ANY_COMMENT,
        WORKSPACE_ACTIONS.VIEW_COMMENTS,
        // All file actions
        WORKSPACE_ACTIONS.UPLOAD_FILES,
        WORKSPACE_ACTIONS.DELETE_OWN_FILE,
        WORKSPACE_ACTIONS.DELETE_ANY_FILE,
        WORKSPACE_ACTIONS.VIEW_FILES,
    ],

    editor: [
        WORKSPACE_ACTIONS.VIEW_WORKSPACE,
        // All notebook actions
        WORKSPACE_ACTIONS.CREATE_NOTEBOOK,
        WORKSPACE_ACTIONS.RENAME_NOTEBOOK,
        WORKSPACE_ACTIONS.DELETE_NOTEBOOK,
        WORKSPACE_ACTIONS.VIEW_NOTEBOOK,
        // All section actions
        WORKSPACE_ACTIONS.CREATE_SECTION,
        WORKSPACE_ACTIONS.RENAME_SECTION,
        WORKSPACE_ACTIONS.DELETE_SECTION,
        WORKSPACE_ACTIONS.MOVE_SECTION,
        WORKSPACE_ACTIONS.VIEW_SECTION,
        // All topic actions
        WORKSPACE_ACTIONS.CREATE_TOPIC,
        WORKSPACE_ACTIONS.RENAME_TOPIC,
        WORKSPACE_ACTIONS.DELETE_TOPIC,
        WORKSPACE_ACTIONS.MOVE_TOPIC,
        WORKSPACE_ACTIONS.VIEW_TOPIC,
        // All page actions
        WORKSPACE_ACTIONS.CREATE_PAGE,
        WORKSPACE_ACTIONS.EDIT_PAGE,
        WORKSPACE_ACTIONS.DELETE_PAGE,
        WORKSPACE_ACTIONS.MOVE_PAGE,
        WORKSPACE_ACTIONS.VIEW_PAGE,
        WORKSPACE_ACTIONS.EXPORT_PAGE,
        // Comment actions (except delete any)
        WORKSPACE_ACTIONS.ADD_COMMENT,
        WORKSPACE_ACTIONS.EDIT_OWN_COMMENT,
        WORKSPACE_ACTIONS.DELETE_OWN_COMMENT,
        WORKSPACE_ACTIONS.VIEW_COMMENTS,
        // Editor file actions (only own files)
        WORKSPACE_ACTIONS.UPLOAD_FILES,
        WORKSPACE_ACTIONS.DELETE_OWN_FILE,
        WORKSPACE_ACTIONS.VIEW_FILES,
    ],

    commenter: [
        WORKSPACE_ACTIONS.VIEW_WORKSPACE,
        WORKSPACE_ACTIONS.VIEW_NOTEBOOK,
        WORKSPACE_ACTIONS.VIEW_SECTION,
        WORKSPACE_ACTIONS.VIEW_TOPIC,
        WORKSPACE_ACTIONS.VIEW_PAGE,
        // Comment actions
        WORKSPACE_ACTIONS.ADD_COMMENT,
        WORKSPACE_ACTIONS.EDIT_OWN_COMMENT,
        WORKSPACE_ACTIONS.DELETE_OWN_COMMENT,
        WORKSPACE_ACTIONS.VIEW_COMMENTS,
        WORKSPACE_ACTIONS.VIEW_FILES,
    ],

    viewer: [
        WORKSPACE_ACTIONS.VIEW_WORKSPACE,
        WORKSPACE_ACTIONS.VIEW_NOTEBOOK,
        WORKSPACE_ACTIONS.VIEW_SECTION,
        WORKSPACE_ACTIONS.VIEW_TOPIC,
        WORKSPACE_ACTIONS.VIEW_PAGE,
        WORKSPACE_ACTIONS.VIEW_COMMENTS,
        WORKSPACE_ACTIONS.VIEW_FILES,
    ],
};

// Role hierarchy (higher index = more permissions)
export const ROLE_HIERARCHY: WorkspaceRole[] = ['viewer', 'commenter', 'editor', 'admin', 'owner'];

/**
 * Check if a role can manage another role
 */
export function canManageRole(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
    const managerIndex = ROLE_HIERARCHY.indexOf(managerRole);
    const targetIndex = ROLE_HIERARCHY.indexOf(targetRole);
    // Can only manage roles lower in hierarchy, and owner cannot be managed by anyone
    return managerIndex > targetIndex && targetRole !== 'owner';
}

/**
 * Get permissions for a role (can be customized or default)
 */
export function getPermissionsForRole(
    role: WorkspaceRole,
    customPermissions?: WorkspaceAction[] | null
): WorkspaceAction[] {
    if (role === 'owner') {
        return DEFAULT_ROLE_PERMISSIONS.owner; // Owner always has all permissions
    }
    return customPermissions || DEFAULT_ROLE_PERMISSIONS[role];
}

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
    role: WorkspaceRole,
    action: WorkspaceAction,
    customPermissions?: WorkspaceAction[] | null
): boolean {
    const permissions = getPermissionsForRole(role, customPermissions);
    return permissions.includes(action);
}

// Invite expiration (7 days)
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Check if an invite has expired
 */
export function isInviteExpired(invitedAt: number): boolean {
    return Date.now() - invitedAt > INVITE_EXPIRY_MS;
}

// Member interface
export interface WorkspaceMember {
    role: WorkspaceRole;
    permissions: WorkspaceAction[] | null; // null = use defaults
    joinedAt: number;
    invitedBy: string;
}

// Invite interface
export interface WorkspaceInvite {
    id: string;
    email: string;
    workspaceId: string;
    workspaceOwnerId: string;
    workspaceName: string;
    role: WorkspaceRole;
    invitedBy: string;
    invitedAt: number;
    status: 'pending';
}

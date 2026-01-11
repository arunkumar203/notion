'use client';

import { forwardRef, RefObject } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { FiShield, FiMenu, FiChevronLeft } from 'react-icons/fi';
import GlobalSearch from './GlobalSearch';
import TasksButton from './Tasks/TasksButton';
import ChatButton from './Chat/ChatButton';
import UserMenu from './UserMenu';
import { InvitesBadge } from './Sharing';

interface WorkspaceNavbarProps {
    title?: string;
    showSearch?: boolean;
    showBackButton?: boolean;
    showHamburgerMenu?: boolean;
    onSearchNavigate?: (result: any) => void;
    onHamburgerClick?: () => void;
    hamburgerButtonRef?: any;
}

const WorkspaceNavbar = forwardRef<HTMLDivElement, WorkspaceNavbarProps>(({
    title = "Workspaces",
    showSearch = false,
    showBackButton = false,
    showHamburgerMenu = false,
    onSearchNavigate,
    onHamburgerClick,
    hamburgerButtonRef
}, ref) => {
    const { user, signOut } = useAuth();
    const { canAccessAdmin } = useUserRole();

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50" ref={ref}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Left side - Back button, Hamburger, Title */}
                    <div className="flex items-center gap-2">
                        {showBackButton && (
                            <Link
                                href="/workspaces"
                                className="inline-flex items-center gap-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-600"
                                title="Back to workspaces"
                            >
                                <FiChevronLeft size={16} />
                                <span className="hidden sm:inline">Workspaces</span>
                            </Link>
                        )}
                        {showHamburgerMenu && (
                            <button
                                ref={hamburgerButtonRef}
                                type="button"
                                onClick={onHamburgerClick}
                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-700"
                                title="Open notebooks/sections/topics"
                                aria-label="Open hierarchy"
                            >
                                <FiMenu />
                            </button>
                        )}
                        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
                    </div>

                    {/* Center - Search (conditional) */}
                    {showSearch && onSearchNavigate && (
                        <div className="flex-1 max-w-2xl mx-8">
                            <GlobalSearch onNavigate={onSearchNavigate} />
                        </div>
                    )}

                    {/* Right side - Actions & User Menu */}
                    <div className="flex items-center gap-4">
                        {/* Tasks Button */}
                        <TasksButton />

                        {/* Chat Button */}
                        <ChatButton />

                        {/* Pending Invites Badge */}
                        <InvitesBadge />

                        {/* Admin Dashboard Button */}
                        {canAccessAdmin && (
                            <Link
                                href="/admin/dashboard"
                                className="flex items-center px-3 py-2 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                                title="Admin Dashboard"
                            >
                                <FiShield className="h-4 w-4 mr-2" />
                                Admin
                            </Link>
                        )}

                        {/* User Menu Dropdown */}
                        <UserMenu email={user?.email || ''} onLogout={signOut} />
                    </div>
                </div>
            </div>
        </header>
    );
});

WorkspaceNavbar.displayName = 'WorkspaceNavbar';

export default WorkspaceNavbar;

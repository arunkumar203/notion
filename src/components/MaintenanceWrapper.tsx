'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import MaintenancePage from './MaintenancePage';
import { usePathname } from 'next/navigation';

export default function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { user, loading: authLoading } = useAuth();
    const { isRootAdmin, canAccessAdmin, loading: roleLoading } = useUserRole();
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [checkingMaintenance, setCheckingMaintenance] = useState(true);

    // State to handle logout transitions
    const [isStableUnauth, setIsStableUnauth] = useState(false);

    // Public paths that should remain accessible during maintenance
    const publicPaths = ['/', '/login', '/signup', '/forgot-password'];
    // Check if current path is exactly one of the public paths
    const isPublicPath = publicPaths.includes(pathname || '');

    useEffect(() => {
        const checkMaintenance = async () => {
            try {
                const response = await fetch('/api/admin/email-settings', { cache: 'no-store' });
                if (response.ok) {
                    const data = await response.json();
                    setMaintenanceMode(data.maintenanceMode === true);
                    setMaintenanceMessage(data.maintenanceMessage || '');
                }
            } catch (error) {
                console.error('Failed to check maintenance status:', error);
            } finally {
                setCheckingMaintenance(false);
            }
        };

        checkMaintenance();

        // Poll every minute to check if maintenance status changed
        const interval = setInterval(checkMaintenance, 60000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (!user) {
            // Delay confirming unauthenticated state to allow for logout redirects
            timeout = setTimeout(() => setIsStableUnauth(true), 500);
        } else {
            setIsStableUnauth(false);
        }
        return () => clearTimeout(timeout);
    }, [user]);

    // While checking initial maintenance status, show loading or nothing
    if (checkingMaintenance || (authLoading || roleLoading)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    // If we are on a public path, ALWAYS render children (allow access)
    // This prevents maintenance page flash during logout/redirects to home
    if (isPublicPath) {
        return <div className="contents">{children}</div>;
    }

    // If maintenance mode is active
    if (maintenanceMode) {
        // Allow access if user is admin or root_admin
        if (user && (isRootAdmin || canAccessAdmin)) {
            return (
                <div className="contents">
                    {/* Optional: Show a banner to admins so they know maintenance is on */}
                    <div className="bg-red-600 text-white text-xs font-bold text-center py-1 px-4 fixed top-0 left-0 right-0 z-[100]">
                        MAINTENANCE MODE ACTIVE - Visible only to Admins
                    </div>
                    <div className="contents">
                        {children}
                    </div>
                </div>
            );
        }

        // If user is null but we haven't stabilized yet (likely logging out), show loader
        if (!user && !isStableUnauth) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            );
        }

        // Otherwise show maintenance page
        return <MaintenancePage message={maintenanceMessage} />;
    }

    // Normal operation
    return <div className="contents">{children}</div>;
}

'use client';

import { useState, useEffect, useCallback } from 'react';

interface Invite {
    id: string;
    email: string;
    workspaceId: string;
    workspaceName: string;
    role: string;
    invitedAt: number;
    expiresAt: number;
}

export function usePendingInvites() {
    const [invites, setInvites] = useState<Invite[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchInvites = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/invites');

            if (!res.ok) {
                if (res.status === 401) {
                    // Not authenticated, silently return empty
                    setInvites([]);
                    return;
                }
                const data = await res.json();
                throw new Error(data.error || 'Failed to fetch invites');
            }

            const data = await res.json();
            setInvites(data.invites || []);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch invites');
            setInvites([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    return {
        invites,
        inviteCount: invites.length,
        isLoading,
        error,
        refetch: fetchInvites,
    };
}

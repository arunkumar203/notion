'use client';

import React, { useState } from 'react';
import { FiMail, FiBell } from 'react-icons/fi';
import { usePendingInvites } from '@/hooks/usePendingInvites';
import { PendingInvitesModal } from '@/components/Sharing';

export default function InvitesBadge() {
    const { inviteCount, refetch } = usePendingInvites();
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (inviteCount === 0) return null;

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="relative p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                title={`${inviteCount} pending invite${inviteCount !== 1 ? 's' : ''}`}
            >
                <FiMail size={20} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {inviteCount > 9 ? '9+' : inviteCount}
                </span>
            </button>

            <PendingInvitesModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onInviteProcessed={() => {
                    refetch();
                    // Trigger a page reload to update shared workspaces
                    window.location.reload();
                }}
            />
        </>
    );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { FiInfo, FiLogOut } from 'react-icons/fi';

interface UserMenuProps {
    email: string;
    onLogout: () => Promise<void> | void;
}

export default function UserMenu({ email, onLogout }: UserMenuProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const initial = (email || '?').trim()[0]?.toUpperCase() || '?';

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold cursor-pointer hover:bg-indigo-700 transition-colors"
                title={email}
            >
                {initial}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-[70]">
                    <Link
                        href="/account"
                        onClick={() => setOpen(false)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center cursor-pointer border-b border-gray-100"
                    >
                        <span className="mr-2">👤</span> Account
                    </Link>

                    <Link
                        href="/changelog"
                        onClick={() => setOpen(false)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center cursor-pointer border-b border-gray-100"
                    >
                        <FiInfo className="mr-2" /> Changelog
                    </Link>
                    <button
                        onClick={() => { setOpen(false); onLogout(); }}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50 flex items-center cursor-pointer"
                    >
                        <FiLogOut className="mr-2" /> Logout
                    </button>
                </div>
            )}
        </div>
    );
}

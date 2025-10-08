'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ref, get } from 'firebase/database';
import { rtdb } from '@/lib/firebase';

export function useUserRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const userRef = ref(rtdb, `users/${user.uid}/role`);
        const snapshot = await get(userRef);
        const userRole = snapshot.exists() ? snapshot.val() : 'user';
        setRole(userRole);
      } catch (error) {
        console.error('Error fetching user role:', error);
        setRole('user'); // Default to user role on error
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();
  }, [user]);

  return {
    role,
    loading,
    isRootAdmin: role === 'root_admin',
    isAdmin: role === 'admin',
    isUser: role === 'user',
    canAccessAdmin: role === 'root_admin' || role === 'admin',
    canManageUsers: role === 'root_admin',
  };
}
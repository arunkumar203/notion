'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'next/navigation';
import { ref, get } from 'firebase/database';
import { rtdb } from '@/lib/firebase';
import { FiUsers, FiBook, FiLayers, FiTag, FiFileText, FiSettings, FiBarChart } from 'react-icons/fi';
import Link from 'next/link';

interface AdminStats {
  totalUsers: number;
  totalNotebooks: number;
  totalSections: number;
  totalTopics: number;
  totalPages: number;
}

export default function AdminDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { role, loading: roleLoading, canAccessAdmin } = useUserRole();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    totalNotebooks: 0,
    totalSections: 0,
    totalTopics: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (!authLoading && !roleLoading) {
      if (!user) {
        router.replace('/login');
        return;
      }
      if (!canAccessAdmin) {
        router.replace('/notebooks');
        return;
      }
    }
  }, [user, canAccessAdmin, authLoading, roleLoading, router]);

  // Fetch admin statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !canAccessAdmin) return;

      try {
        setLoading(true);
        setError(null);



        // Fetch users count
        const usersRef = ref(rtdb, 'users');
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};
        const totalUsers = Object.keys(usersData).length;


        // Fetch notebooks and count sections, topics, pages
        const notebooksRef = ref(rtdb, 'notebooks');
        const notebooksSnapshot = await get(notebooksRef);
        const notebooksData = notebooksSnapshot.exists() ? notebooksSnapshot.val() : {};

        
        let totalNotebooks = 0;
        let totalSections = 0;
        let totalTopics = 0;
        let totalPages = 0;

        if (notebooksData && typeof notebooksData === 'object') {
          Object.values(notebooksData).forEach((notebook: any) => {
            if (notebook && typeof notebook === 'object') {
              totalNotebooks++;
              
              if (notebook.sections && typeof notebook.sections === 'object') {
                Object.values(notebook.sections).forEach((section: any) => {
                  if (section && typeof section === 'object') {
                    totalSections++;
                    
                    if (section.topics && typeof section.topics === 'object') {
                      Object.values(section.topics).forEach((topic: any) => {
                        if (topic && typeof topic === 'object') {
                          totalTopics++;
                          
                          if (topic.pages && typeof topic.pages === 'object') {
                            totalPages += Object.keys(topic.pages).length;
                          }
                        }
                      });
                    }
                  }
                });
              }
            }
          });
        }



        setStats({
          totalUsers,
          totalNotebooks,
          totalSections,
          totalTopics,
          totalPages,
        });
      } catch (error) {
        console.error('Error fetching admin stats:', error);
        setError(`Failed to load statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user, canAccessAdmin]);

  // Show loading while checking auth and role
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not admin (redirect will handle it)
  if (!user || !canAccessAdmin) {
    return null;
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: FiUsers,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Total Notebooks',
      value: stats.totalNotebooks,
      icon: FiBook,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Total Sections',
      value: stats.totalSections,
      icon: FiLayers,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Total Topics',
      value: stats.totalTopics,
      icon: FiTag,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Total Pages',
      value: stats.totalPages,
      icon: FiFileText,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <FiBarChart className="h-8 w-8 text-indigo-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-sm text-gray-500">System overview and management</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/notebooks"
                className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
              >
                Back to App
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {statCards.map((card, index) => (
            <div key={index} className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className={`p-3 rounded-md ${card.bgColor}`}>
                      <card.icon className={`h-6 w-6 ${card.textColor}`} />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {card.title}
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {loading ? (
                          <div className="animate-pulse bg-gray-200 h-6 w-12 rounded"></div>
                        ) : (
                          card.value.toLocaleString()
                        )}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Management Actions */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Management Actions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link
                href="/admin/dashboard/users"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FiUsers className="h-8 w-8 text-blue-600 mr-4" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Manage Users</h4>
                  <p className="text-sm text-gray-500">View and manage user accounts</p>
                </div>
              </Link>

              <Link
                href="/admin/dashboard/settings"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FiSettings className="h-8 w-8 text-purple-600 mr-4" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">System Settings</h4>
                  <p className="text-sm text-gray-500">Configure email and system settings</p>
                </div>
              </Link>

              <Link
                href="/admin/dashboard/analytics"
                className="flex items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FiBarChart className="h-8 w-8 text-green-600 mr-4" />
                <div>
                  <h4 className="text-sm font-medium text-gray-900">Analytics</h4>
                  <p className="text-sm text-gray-500">View system analytics and metrics</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
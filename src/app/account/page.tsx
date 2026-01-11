'use client';



import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import Loader from '@/components/Loader';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword as fbUpdatePassword,
  deleteUser,
} from 'firebase/auth';
import { ref as dbRef, get, onValue } from 'firebase/database';
import { rtdb, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import {
  FiUser,
  FiInfo,
  FiLock,
  FiTrash2,
  FiLogOut,
  FiFileText,
  FiDatabase,
  FiAlertTriangle,
  FiArrowLeft,
  FiMail,
  FiCalendar,
  FiClock,
  FiLink,
  FiKey,
  FiShield,
  FiCheck,
} from 'react-icons/fi';
import { FaSpinner } from 'react-icons/fa';

type TabKey = 'details' | 'shared' | 'password' | 'delete';

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('details');
  const [noteCount, setNoteCount] = useState<number>(0); // Total Pages
  const [storageUsage, setStorageUsage] = useState<string>('—');
  const [storageLimit, setStorageLimit] = useState<string>('—');
  const [storagePercent, setStoragePercent] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const providerData = user?.providerData ?? [];
  const hasPasswordProvider = providerData.some((provider) => provider.providerId === 'password');
  const hasGoogleProvider = providerData.some((provider) => provider.providerId === 'google.com');
  // Shared links state
  const [sharedLinks, setSharedLinks] = useState<Array<{ id: string; pageId: string; pageName?: string; canEdit: boolean; createdAt: number }>>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [deletingPageIds, setDeletingPageIds] = useState<Set<string>>(new Set());
  // AI settings
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState<'flash' | 'pro'>('flash');
  const [flashModelName, setFlashModelName] = useState('gemini-2.5-flash');
  const [proModelName, setProModelName] = useState('gemini-2.5-pro');
  const [aiSpeed, setAiSpeed] = useState<'normal' | 'slow'>('normal');
  const [aiSaving, setAiSaving] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // removed Saved indicator; keep only transient Saving spinner
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<{ apiKey: string; model: 'flash' | 'pro'; speed: 'normal' | 'slow' } | null>(null);

  // Todoist settings
  const [todoistApiKey, setTodoistApiKey] = useState('');
  const [todoistSaving, setTodoistSaving] = useState(false);
  const [todoistError, setTodoistError] = useState<string | null>(null);
  const todoistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTodoistRef = useRef<string | null>(null);

  // 2FA State
  const [is2SVEnabled, setIs2SVEnabled] = useState(false);
  const [is2SVSetupOpen, setIs2SVSetupOpen] = useState(false);
  const [twoFactorSecret, setTwoFactorSecret] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<{ code: string; used: boolean }[]>([]);
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState('');
  const [isDisableConfirmOpen, setIsDisableConfirmOpen] = useState(false);
  const [isDisableBackupCode, setIsDisableBackupCode] = useState(false);

  const downloadBackupCodes = (codes: string[]) => {
    const element = document.createElement("a");
    const content = `MEMOWAVE 2FA Backup Codes
Account: ${user?.email}

Keep these codes in a safe place. Each code can be used only once.

${codes.join("\n")}`;
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = "backup-codes.txt";
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  // Load 2FA Status and Backup Codes
  useEffect(() => {
    if (!user) return;
    const r = dbRef(rtdb, `users/${user.uid}/settings/2sv`);
    const unsub = onValue(r, (snap) => {
      const val = snap.val();
      setIs2SVEnabled(!!val?.enabled);
      if (val?.backupCodes) {
        setBackupCodes(val.backupCodes);
      }
    });
    return () => unsub();
  }, [user]);

  const handleStart2FASetup = async () => {
    setIsLoading(true);
    setSetupError(null);
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to start setup');
      const data = await res.json();
      setTwoFactorSecret(data.secret);
      setQrCodeUrl(data.qrCodeUrl);
      setIs2SVSetupOpen(true);
    } catch (e: any) {
      console.error(e);
      setSetupError(e.message || 'Failed to start 2FA setup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setIsLoading(true);
    setSetupError(null);
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: twoFactorSecret, token: verificationCode })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setIs2SVSetupOpen(false);
      setVerificationCode('');
      setTwoFactorSecret('');

      // Backup codes are returned in data.backupCodes
      if (data.backupCodes) {
        // data.backupCodes is array of objects { code, used }
        setNewBackupCodes(data.backupCodes.map((c: any) => c.code));
      }

      notify('Two-Factor Authentication enabled successfully!');
    } catch (e: any) {
      console.error(e);
      setSetupError(e.message || 'Invalid code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disableCode) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disable');

      notify('Two-Factor Authentication disabled.');
      setBackupCodes([]);
      setNewBackupCodes([]);
      setIsDisableConfirmOpen(false);
      setDisableCode('');
      setIsDisableBackupCode(false);
    } catch (e: any) {
      console.error(e);
      notify('Failed to disable 2FA: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    if (!confirm('This will invalidate your current backup codes. Are you sure?')) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/2fa/generate-backup-codes', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate codes');
      const data = await res.json();
      setBackupCodes(data.backupCodes);
      setNewBackupCodes(data.backupCodes.map((c: any) => c.code));
      notify('New backup codes generated.');
    } catch (e: any) {
      notify(e.message || 'Failed to generate codes');
    } finally {
      setIsLoading(false);
    }
  };

  const notify = (msg: string) => {
    if (typeof window !== 'undefined') alert(msg);
  };

  // Compute Total Pages across all notebooks in RTDB
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        // Get all workspaces user has access to (owned or member)
        const workspacesSnap = await get(dbRef(rtdb, `workspaces`));
        const allWorkspaces = (workspacesSnap.exists() ? workspacesSnap.val() : {}) as Record<string, any>;

        const accessibleWorkspaceIds: string[] = [];
        Object.keys(allWorkspaces || {}).forEach(wsId => {
          const ws = allWorkspaces[wsId];
          // Check if user owns or is a member of this workspace
          if (ws.owner === user.uid || ws.members?.[user.uid]) {
            accessibleWorkspaceIds.push(wsId);
          }
        });

        // console.log('[Account] Accessible workspaces:', accessibleWorkspaceIds);

        let totalPages = 0;

        // Count pages from all accessible workspaces
        for (const wsId of accessibleWorkspaceIds) {
          const wsNbsSnap = await get(dbRef(rtdb, `workspaces/${wsId}/notebooks`));
          if (!wsNbsSnap.exists()) {
            // console.log(`[Account] Workspace ${wsId}: no notebooks`);
            continue;
          }

          // Notebooks are stored directly under workspaces/{wsId}/notebooks/{nbId}
          const wsNbMap = wsNbsSnap.val() as Record<string, any>;
          const wsNotebookIds = Object.keys(wsNbMap || {});

          // console.log(`[Account] Workspace ${wsId}: ${wsNotebookIds.length} notebooks`);

          // Each notebook contains sections -> topics -> pages
          Object.values(wsNbMap).forEach((nb: any, nbIdx) => {
            if (!nb) return;
            const sections = (nb.sections || {}) as Record<string, any>;
            Object.values(sections).forEach((section: any) => {
              const topics = (section?.topics || {}) as Record<string, any>;
              Object.values(topics).forEach((topic: any) => {
                const pages = (topic?.pages || {}) as Record<string, any>;
                totalPages += Object.keys(pages).length;
              });
            });
          });
        }

        // Always fetch file storage usage from API (even if no notebooks)
        try {
          const storageRes = await fetch('/api/user/storage');
          if (storageRes.ok) {
            const storageData = await storageRes.json();
            if (!cancelled) {
              setStorageUsage(storageData.usedFormatted || '0 B');
              setStorageLimit(storageData.limitFormatted || '50 MB');
              setStoragePercent(storageData.percentage || 0);
            }
          } else {
            console.error('[Account] Storage API error:', await storageRes.text());
          }
        } catch (e) {
          console.error('Error fetching storage usage:', e);
        }

        if (!cancelled) {
          setNoteCount(totalPages);
        }
      } catch (e) {
        console.error('Error calculating total pages:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load AI settings from RTDB
  useEffect(() => {
    if (!user) return;
    const r = dbRef(rtdb, `users/${user.uid}/settings/ai`);
    const unsub = onValue(r, (snap) => {
      const v = (snap.exists() ? snap.val() : {}) as any;
      setAiApiKey(v?.apiKey || '');
      const savedModel = (v?.model || '') as string;
      // Determine if saved model is a pro or flash model
      const isPro = savedModel.toLowerCase().includes('pro');
      setAiModel(isPro ? 'pro' : 'flash');
      const sp = (v?.speed || 'normal') as string;
      setAiSpeed(sp === 'slow' ? 'slow' : 'normal');
      // Set baseline to avoid triggering autosave/spinner on initial load
      const baselineApiKey = (v?.apiKey || '') as string;
      const baselineModel: 'flash' | 'pro' = isPro ? 'pro' : 'flash';
      const baselineSpeed: 'normal' | 'slow' = (sp === 'slow' ? 'slow' : 'normal');
      lastSentRef.current = { apiKey: baselineApiKey, model: baselineModel, speed: baselineSpeed };
    });
    return () => unsub();
  }, [user]);

  // Fetch AI model names from admin settings
  useEffect(() => {
    const fetchAIModels = async () => {
      try {
        const res = await fetch('/api/ai-models');
        if (res.ok) {
          const data = await res.json();
          if (data.flashModel) setFlashModelName(data.flashModel);
          if (data.proModel) setProModelName(data.proModel);
        }
      } catch (error) {
        console.error('Error fetching AI models:', error);
      }
    };
    fetchAIModels();
  }, []);

  // Load Todoist settings from RTDB
  useEffect(() => {
    if (!user) return;
    const r = dbRef(rtdb, `users/${user.uid}/settings`);
    const unsub = onValue(r, (snap) => {
      const v = (snap.exists() ? snap.val() : {}) as any;
      const key = (v?.todoistApiKey || '') as string;
      setTodoistApiKey(key);
      lastTodoistRef.current = key;
    });
    return () => unsub();
  }, [user]);

  // Auto-save AI settings when they change (debounced)
  useEffect(() => {
    if (!user) return;
    // Cancel pending save
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    // Avoid redundant POSTs for values we've just sent
    const pending = { apiKey: aiApiKey, model: aiModel, speed: aiSpeed } as const;
    // If we don't have a baseline yet from RTDB, don't autosave (avoid false "Saving…" on first load)
    if (!lastSentRef.current) {
      setAiSaving(false);
      return;
    }
    // If nothing changed vs last sent, ensure spinner is off and skip
    if (
      lastSentRef.current.apiKey === pending.apiKey &&
      lastSentRef.current.model === pending.model &&
      lastSentRef.current.speed === pending.speed
    ) {
      setAiSaving(false);
      return;
    }
    // Save regardless of apiKey emptiness; editor will validate on use
    // Immediately show saving feedback for any change (apiKey/model/speed)
    setAiError(null);
    setAiSaving(true);
    // Map 'flash'/'pro' to actual model names when saving
    const actualModelName = pending.model === 'pro' ? proModelName : flashModelName;
    autosaveTimerRef.current = setTimeout(async () => {
      try {
        const callSave = async (): Promise<Response> => fetch('/api/user/settings/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: pending.apiKey, model: actualModelName, speed: pending.speed }),
          credentials: 'include',
        });
        const refreshSession = async (): Promise<boolean> => {
          try {
            const u = auth.currentUser;
            if (!u) return false;
            const idToken = await u.getIdToken(true);
            const resp = await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              credentials: 'include',
            });
            return resp.ok;
          } catch { return false; }
        };
        let res = await callSave();
        if (res.status === 401) {
          const ok = await refreshSession();
          if (ok) res = await callSave();
        }
        if (!res.ok) {
          if (res.status === 401) {
            console.warn('Not authenticated when saving AI settings. Please sign in again.');
            setAiError('Not authenticated. Please sign in again.');
          } else {
            const j = await res.json().catch(() => null);
            const msg = (j?.error || res.statusText || 'Failed to save AI settings').toString();
            console.warn('Failed to save AI settings', msg);
            setAiError(msg);
          }
        } else {
          lastSentRef.current = { apiKey: pending.apiKey, model: pending.model, speed: pending.speed };
          setAiError(null);
        }
      } catch (e) {
        console.warn('Error saving AI settings', e);
        setAiError('Could not save your settings. Please try again.');
      } finally {
        setAiSaving(false);
      }
    }, 600);
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [user, aiApiKey, aiModel, aiSpeed, flashModelName, proModelName]);

  // Auto-save Todoist settings when they change (debounced)
  useEffect(() => {
    if (!user) return;
    if (todoistTimerRef.current) {
      clearTimeout(todoistTimerRef.current);
      todoistTimerRef.current = null;
    }
    if (lastTodoistRef.current === null) {
      setTodoistSaving(false);
      return;
    }
    if (lastTodoistRef.current === todoistApiKey) {
      setTodoistSaving(false);
      return;
    }
    setTodoistError(null);
    setTodoistSaving(true);
    todoistTimerRef.current = setTimeout(async () => {
      try {
        const callSave = async (): Promise<Response> => fetch('/api/user/settings/todoist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: todoistApiKey }),
          credentials: 'include',
        });
        const refreshSession = async (): Promise<boolean> => {
          try {
            const u = auth.currentUser;
            if (!u) return false;
            const idToken = await u.getIdToken(true);
            const resp = await fetch('/api/auth/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken }),
              credentials: 'include',
            });
            return resp.ok;
          } catch { return false; }
        };
        let res = await callSave();
        if (res.status === 401) {
          const ok = await refreshSession();
          if (ok) res = await callSave();
        }
        if (!res.ok) {
          if (res.status === 401) {
            console.warn('Not authenticated when saving Todoist settings. Please sign in again.');
            setTodoistError('Not authenticated. Please sign in again.');
          } else {
            const j = await res.json().catch(() => null);
            const msg = (j?.error || res.statusText || 'Failed to save Todoist settings').toString();
            console.warn('Failed to save Todoist settings', msg);
            setTodoistError(msg);
          }
        } else {
          lastTodoistRef.current = todoistApiKey;
          setTodoistError(null);
        }
      } catch (e) {
        console.warn('Error saving Todoist settings', e);
        setTodoistError('Could not save your settings. Please try again.');
      } finally {
        setTodoistSaving(false);
      }
    }, 600);
    return () => {
      if (todoistTimerRef.current) {
        clearTimeout(todoistTimerRef.current);
        todoistTimerRef.current = null;
      }
    };
  }, [user, todoistApiKey]);

  // Actively fetch shared links when the Shared Links tab is active; subscribe to RTDB updates
  useEffect(() => {
    if (!user || activeTab !== 'shared') return;
    setLoadingShares(true);
    const r = dbRef(rtdb, `users/${user.uid}/sharedLinks`);
    const unsub = onValue(r, async (snap) => {
      try {
        const val = (snap.exists() ? snap.val() : {}) as Record<string, { link?: string; canEdit?: boolean; createdAt?: number }>;
        const simplified = Object.entries(val).map(([pageId, v]) => ({ id: (v?.link || '') as string, pageId, canEdit: !!v?.canEdit, createdAt: v?.createdAt || 0 }));
        const ids = simplified.map((s) => s.pageId).filter(Boolean);
        const nameMap: Record<string, string> = {};
        await Promise.all(
          ids.map(async (pid) => {
            try {
              const snap = await getDoc(doc(db, 'pages', pid));
              const data: any = snap.data() || {};
              const nm = (data.name as string) || 'Untitled';
              nameMap[pid] = nm;
            } catch {
              nameMap[pid] = 'Untitled';
            }
          })
        );
        const withNames = simplified
          .filter((s) => !!s.id)
          .map((s) => ({ ...s, pageName: nameMap[s.pageId] || 'Untitled' }));
        setSharedLinks(withNames);
        // Clear deleting flags for items that no longer exist
        setDeletingPageIds((prev) => {
          const next = new Set(prev);
          const existing = new Set(withNames.map((s) => s.pageId));
          for (const pid of Array.from(next)) {
            if (!existing.has(pid)) next.delete(pid);
          }
          return next;
        });
      } catch {
        setSharedLinks([]);
      } finally {
        setLoadingShares(false);
      }
    });
    return () => unsub();
  }, [user, activeTab]);

  // Actions
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return notify('You must be logged in.');
    if (newPassword !== confirmPassword) return notify('New passwords do not match');
    if (newPassword.length < 6) return notify('Password should be at least 6 characters long');
    try {
      setIsUpdating(true);
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await fbUpdatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      notify('Password updated successfully');
    } catch (err: any) {
      console.error('Error updating password:', err);
      notify(err?.message || 'Failed to update password');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.email) return notify('You must be logged in.');
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }

    const needsPassword = hasPasswordProvider;
    const canReauthWithGoogle = !needsPassword && hasGoogleProvider;

    if (needsPassword && !deletePassword) {
      notify('Please enter your password to confirm account deletion');
      return;
    }

    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;

    try {
      setIsDeleting(true);

      if (needsPassword) {
        const cred = EmailAuthProvider.credential(user.email, deletePassword);
        await reauthenticateWithCredential(user, cred);
      } else if (canReauthWithGoogle) {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await reauthenticateWithPopup(user, provider);
      } else {
        throw new Error('Unable to verify your identity. Please sign out and sign in again.');
      }

      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Failed to delete account data');
      }

      await signOut();
      notify('Your account and all data have been deleted successfully');
      router.push('/');
    } catch (err: any) {
      console.error('Error deleting account:', err);
      notify(err?.message || 'Failed to delete account');
    } finally {
      setIsDeleting(false);
      setDeletePassword('');
    }
  };


  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back button (like Changelog) */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/notebooks" className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900">
            <FiArrowLeft className="mr-2" /> Back
          </Link>
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">Account</div>
            <UserMenu email={user?.email || ''} onLogout={signOut} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
            <div className="flex items-center">
              <div className="bg-blue-100 p-3 rounded-full">
                <FiUser className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-2xl font-bold text-gray-900">Profile Settings</h2>
                <p className="text-gray-600">{user?.email}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Sidebar Navigation */}
            <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50">
              <nav className="flex-1 px-2 py-4 space-y-1">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'details'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiInfo className="mr-3 h-5 w-5" />
                  Account Details
                </button>
                <button
                  onClick={() => setActiveTab('shared')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'shared'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiLink className="mr-3 h-5 w-5" />
                  Shared Links
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'password'
                    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <FiLock className="mr-3 h-5 w-5" />
                  Change Password
                </button>
                <button
                  onClick={() => setActiveTab('delete')}
                  className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-md ${activeTab === 'delete'
                    ? 'bg-red-50 text-red-700 border-l-4 border-red-500'
                    : 'text-red-600 hover:bg-red-50 hover:text-red-900'
                    }`}
                >
                  <FiTrash2 className="mr-3 h-5 w-5" />
                  Delete Account
                </button>
              </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-6">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Account Information</h3>
                    <p className="mt-1 text-sm text-gray-500">View and manage your account details</p>
                  </div>
                  {/* Account details styled like the reference */}
                  <div className="bg-white shadow overflow-hidden sm:rounded-lg">
                    <div className="px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiMail className="mr-2" /> Email address
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0 break-all">
                        {user?.email || '—'}
                      </dd>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiCalendar className="mr-2" /> Account created
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleString() : '—'}
                      </dd>
                    </div>
                    <div className="border-t border-b border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiClock className="mr-2" /> Last login
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {user?.metadata?.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : '—'}
                      </dd>
                    </div>

                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiShield className="mr-2" /> Two-Step Verification
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        {is2SVEnabled ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between group">
                              <div className="flex items-center text-green-700 font-medium">
                                <FiCheck className="mr-2" /> Enabled
                              </div>
                              <div className="flex flex-col gap-3 items-end relative">
                                {!isDisableConfirmOpen ? (
                                  <button
                                    onClick={() => setIsDisableConfirmOpen(true)}
                                    className="text-red-600 hover:text-red-800 text-sm font-medium transition-colors"
                                  >
                                    Disable
                                  </button>
                                ) : (
                                  <div className="flex flex-col gap-3 mt-2 bg-white p-4 shadow-lg rounded border border-gray-200 w-72 z-10 absolute right-0 top-0">
                                    <p className="text-sm font-medium text-gray-900 border-b pb-2 mb-1">Disable Two-Step Verification</p>
                                    <p className="text-xs text-gray-500">
                                      {isDisableBackupCode
                                        ? 'Enter one of your 8-digit backup codes to confirm.'
                                        : 'Enter the 6-digit code from your authenticator app to confirm.'}
                                    </p>

                                    <input
                                      type="text"
                                      placeholder={isDisableBackupCode ? "0000 0000" : "000 000"}
                                      className="w-full text-lg border rounded px-3 py-2 text-center tracking-widest"
                                      value={disableCode}
                                      maxLength={isDisableBackupCode ? 8 : 6}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                                        setDisableCode(val.slice(0, isDisableBackupCode ? 8 : 6))
                                      }}
                                      autoFocus
                                    />

                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsDisableBackupCode(!isDisableBackupCode);
                                        setDisableCode('');
                                      }}
                                      className="text-xs text-blue-600 hover:text-blue-500 font-medium text-center"
                                    >
                                      {isDisableBackupCode ? 'Use Authenticator Code' : 'Use Backup Code'}
                                    </button>

                                    <div className="flex gap-2 w-full mt-1">
                                      <button
                                        onClick={() => {
                                          setIsDisableConfirmOpen(false);
                                          setDisableCode('');
                                          setIsDisableBackupCode(false);
                                        }}
                                        className="flex-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={handleDisable2FA}
                                        disabled={isLoading || disableCode.length !== (isDisableBackupCode ? 8 : 6)}
                                        className="flex-1 text-sm bg-red-600 hover:bg-red-700 text-white py-2 rounded disabled:opacity-50"
                                      >
                                        {isLoading ? '...' : 'Disable'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="bg-gray-50 p-4 rounded border border-gray-200">
                              <h4 className="font-medium text-gray-900 mb-2">Backup Codes</h4>

                              {newBackupCodes.length > 0 ? (
                                <div className="bg-white p-4 rounded border border-blue-200 shadow-sm animate-fadeIn">
                                  <div className="flex items-start gap-3 mb-4">
                                    <FiAlertTriangle className="text-amber-500 mt-1 flex-shrink-0" />
                                    <div>
                                      <p className="text-sm font-medium text-gray-900">Save your backup codes</p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        These codes will only be shown <strong>once</strong>. If you lose access to your authenticator app, these are the only way to get back into your account.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 mb-4 bg-gray-50 p-3 rounded">
                                    {newBackupCodes.map((code, i) => (
                                      <div key={i} className="font-mono text-sm text-center text-gray-700 select-all">
                                        {code}
                                      </div>
                                    ))}
                                  </div>

                                  <div className="flex gap-3">
                                    <button
                                      onClick={() => downloadBackupCodes(newBackupCodes)}
                                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                                    >
                                      <FiFileText /> Download .txt
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (confirm('Have you saved these codes? You won\'t see them again.')) {
                                          setNewBackupCodes([]);
                                        }
                                      }}
                                      className="px-3 py-2 text-gray-600 text-sm hover:bg-gray-100 rounded"
                                    >
                                      I've saved them
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm text-gray-700">
                                        You have <strong>{backupCodes.filter(c => !c.used).length}</strong> unused backup codes remaining.
                                      </p>
                                      <p className="text-xs text-gray-500 mt-1">
                                        Generate new codes if you're running low or lost your old ones.
                                      </p>
                                    </div>
                                    <button
                                      onClick={handleRegenerateBackupCodes}
                                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline"
                                    >
                                      Regenerate Codes
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div>
                            {!is2SVSetupOpen ? (
                              <button
                                onClick={handleStart2FASetup}
                                disabled={isLoading}
                                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-70 disabled:cursor-wait"
                              >
                                {isLoading ? (
                                  <>
                                    <FaSpinner className="animate-spin -ml-1 mr-2 h-4 w-4" />
                                    Setting up...
                                  </>
                                ) : (
                                  'Setup 2FA'
                                )}
                              </button>
                            ) : (
                              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                                <h4 className="font-medium text-gray-900 mb-2">Setup Two-Step Verification</h4>
                                <p className="text-gray-600 mb-4 text-xs max-w-md">Scan the QR code with Google Authenticator or a similar app to generate verification codes.</p>

                                <div className="flex flex-col sm:flex-row sm:items-start gap-6 mb-6">
                                  {qrCodeUrl && (
                                    <div className="bg-white p-2 rounded shadow-sm inline-block">
                                      <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32" />
                                    </div>
                                  )}
                                  <div className="flex-1">
                                    {twoFactorSecret && (
                                      <div className="mb-4">
                                        <p className="text-xs text-gray-500 mb-1">Cant scan? Enter this code manually:</p>
                                        <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono select-all block w-full break-all border border-gray-200">
                                          {twoFactorSecret}
                                        </code>
                                      </div>
                                    )}
                                    <div className="space-y-3">
                                      <label htmlFor="verify-code" className="block text-xs font-medium text-gray-700">
                                        Enter 6-digit code from app
                                      </label>
                                      <div className="flex gap-2">
                                        <input
                                          id="verify-code"
                                          type="text"
                                          placeholder="000 000"
                                          className="border rounded px-3 py-2 text-sm w-32 tracking-wider text-center"
                                          maxLength={6}
                                          value={verificationCode}
                                          onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                                  <button
                                    onClick={handleVerify2FA}
                                    disabled={verificationCode.length !== 6 || isLoading}
                                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                                  >
                                    {isLoading ? 'Verifying...' : 'Verify & Enable'}
                                  </button>
                                  <button
                                    onClick={() => { setIs2SVSetupOpen(false); setSetupError(null); }}
                                    className="text-gray-600 px-3 py-2 text-sm hover:text-gray-800 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                                {setupError && <p className="text-red-600 text-xs mt-3 flex items-center"><FiAlertTriangle className="mr-1" /> {setupError}</p>}
                              </div>
                            )}
                          </div>
                        )}
                      </dd>
                    </div>

                    {/* AI Settings */}
                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiKey className="mr-2" /> Google AI Studio API key
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                            <input
                              id="ai-api-key"
                              name="ai-api-key"
                              type="text"
                              value={aiApiKey}
                              onChange={(e) => setAiApiKey(e.target.value)}
                              placeholder="Paste your API key"
                              className="flex-1 border rounded px-3 py-2 text-sm"
                              autoComplete="off"
                              inputMode="text"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                            />
                            {aiApiKey.trim().length > 0 && (
                              <select
                                value={aiModel}
                                onChange={(e) => setAiModel(e.target.value as 'flash' | 'pro')}
                                className="border rounded px-3 py-2 text-sm"
                                title="Model"
                              >
                                <option value="flash">{flashModelName}</option>
                                <option value="pro">{proModelName}</option>
                              </select>
                            )}
                            {aiSaving && (
                              <div className="flex items-center text-xs text-gray-600 min-w-[80px]">
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                                  Saving…
                                </span>
                              </div>
                            )}
                          </div>
                          {aiError && (
                            <div className="mt-1 text-xs text-red-600" aria-live="polite">{aiError}</div>
                          )}
                          {aiApiKey.trim().length > 0 && (
                            <div className="flex items-center gap-2 text-sm" title="Streaming speed">
                              <span className="text-gray-600">Speed</span>
                              <div className="inline-flex rounded border border-gray-200 overflow-hidden">
                                <button
                                  type="button"
                                  className={`px-2 py-1 ${aiSpeed === 'normal' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                  onClick={() => setAiSpeed('normal')}
                                >Normal</button>
                                <button
                                  type="button"
                                  className={`px-2 py-1 border-l border-gray-200 ${aiSpeed === 'slow' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                                  onClick={() => setAiSpeed('slow')}
                                >Classy</button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Stored securely for your account. Used for the Write with AI feature.</div>

                        {/* Secret notes vault link */}
                        <div className="mt-4">
                          <Link
                            href="/notebooks/secret"
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50"
                            title="Open your password-protected secret notes"
                          >
                            <FiLock className="text-gray-600" /> Secret notes
                          </Link>
                        </div>
                      </dd>
                    </div>

                    {/* Todoist API Key */}
                    <div className="border-t border-gray-200 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt className="text-sm font-medium text-gray-500 flex items-center">
                        <FiKey className="mr-2" /> Todoist API key
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                            <input
                              id="todoist-api-key"
                              name="todoist-api-key"
                              type="text"
                              value={todoistApiKey}
                              onChange={(e) => setTodoistApiKey(e.target.value)}
                              placeholder="Paste your Todoist API key"
                              className="flex-1 border rounded px-3 py-2 text-sm"
                              autoComplete="off"
                              inputMode="text"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                            />
                            {todoistSaving && (
                              <div className="flex items-center text-xs text-gray-600 min-w-[80px]">
                                <span className="inline-flex items-center gap-1">
                                  <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                                  Saving…
                                </span>
                              </div>
                            )}
                          </div>
                          {todoistError && (
                            <div className="mt-1 text-xs text-red-600" aria-live="polite">{todoistError}</div>
                          )}
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Stored securely for your account. Used for task management integration.</div>
                      </dd>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Usage Insights</h3>
                    <p className="mt-1 text-sm text-gray-500">Overview of your account usage</p>
                  </div>

                  {isLoading ? (
                    <div className="text-sm text-gray-500">Loading…</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      {/* Total Pages Card */}
                      <div className="bg-white overflow-hidden shadow rounded-lg">
                        <div className="px-4 py-5 sm:p-6">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 bg-blue-500 rounded-md p-3">
                              <FiFileText className="h-6 w-6 text-white" />
                            </div>
                            <div className="ml-5 w-0 flex-1">
                              <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">Total Pages</dt>
                                <dd className="flex items-baseline">
                                  <div className="text-2xl font-semibold text-gray-900">{noteCount}</div>
                                </dd>
                              </dl>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Storage Used Card */}
                      <div className="bg-white overflow-hidden shadow rounded-lg">
                        <div className="px-4 py-5 sm:p-6">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 bg-green-500 rounded-md p-3">
                              <FiDatabase className="h-6 w-6 text-white" />
                            </div>
                            <div className="ml-5 w-0 flex-1">
                              <dl>
                                <dt className="text-sm font-medium text-gray-500 truncate">Storage Used</dt>
                                <dd className="flex flex-col gap-2">
                                  <div className="text-2xl font-semibold text-gray-900">
                                    {storageUsage} <span className="text-sm font-normal text-gray-500">/ {storageLimit}</span>
                                  </div>
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all duration-300 ${storagePercent > 90 ? 'bg-red-500' : storagePercent > 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                      style={{ width: `${Math.min(storagePercent, 100)}%` }}
                                    />
                                  </div>
                                  <div className="text-xs text-gray-500">{storagePercent}% used</div>
                                </dd>
                              </dl>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {activeTab === 'shared' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Shared Links</h3>
                    <p className="mt-1 text-sm text-gray-500">Toggle edit access or revoke sharing</p>
                  </div>
                  <div className="mt-1 bg-white border rounded-md">
                    {loadingShares ? (
                      <div className="p-4 text-sm text-gray-600">Loading…</div>
                    ) : sharedLinks.length === 0 ? (
                      <div className="p-4 text-sm text-gray-600">No shared links yet.</div>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {sharedLinks.map((s) => (
                          <li key={s.id} className="p-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">/share/{s.id}</div>
                              <div className="text-xs text-gray-500">Page: {s.pageName || 'Untitled'}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
                                Can edit
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={s.canEdit}
                                  onClick={async () => {
                                    const next = !s.canEdit;
                                    // optimistic update
                                    setSharedLinks((prev) => prev.map((it) => it.pageId === s.pageId ? { ...it, canEdit: next } : it));
                                    try {
                                      // PATCH by shareId (s.id) remains, API will also update RTDB mirror keyed by pageId
                                      const res = await fetch(`/api/share/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ canEdit: next }) });
                                      if (!res.ok) throw new Error('Failed');
                                    } catch {
                                      // revert on error
                                      setSharedLinks((prev) => prev.map((it) => it.pageId === s.pageId ? { ...it, canEdit: !next } : it));
                                    }
                                  }}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${s.canEdit ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                >
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${s.canEdit ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                              </label>
                              <a
                                href={`/share/${s.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline"
                              >
                                Open
                              </a>
                              <button
                                type="button"
                                disabled={deletingPageIds.has(s.pageId)}
                                onClick={async () => {
                                  if (!window.confirm('Delete this share link?')) return;
                                  setDeletingPageIds((prev) => new Set(prev).add(s.pageId));
                                  try {
                                    const res = await fetch(`/api/share`, {
                                      method: 'DELETE',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ pageId: s.pageId }),
                                      credentials: 'include',
                                    });
                                    if (!res.ok) {
                                      // Fallback: try specific shareId delete
                                      const res2 = await fetch(`/api/share/${s.id}`, { method: 'DELETE', credentials: 'include' as RequestCredentials });
                                      if (!res2.ok) {
                                        try { const j = await res.json(); alert(j?.error || 'Failed to delete share'); } catch { alert('Failed to delete share'); }
                                        setDeletingPageIds((prev) => { const n = new Set(prev); n.delete(s.pageId); return n; });
                                      }
                                    }
                                    // On success, we rely on RTDB subscription to remove the item, which will also clear loader
                                  } catch {
                                    setDeletingPageIds((prev) => { const n = new Set(prev); n.delete(s.pageId); return n; });
                                  }
                                }}
                                className="text-xs text-red-600 hover:underline min-w-[64px] text-center"
                              >
                                {deletingPageIds.has(s.pageId) ? (
                                  <span className="inline-flex items-center gap-1 text-red-600">
                                    <Loader size="xs" />
                                    <span>Deleting…</span>
                                  </span>
                                ) : (
                                  'Delete'
                                )}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'password' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Change Password</h3>
                    <p className="mt-1 text-sm text-gray-500">Update your account password</p>
                  </div>
                  <form onSubmit={handleUpdatePassword} className="space-y-4" autoComplete="off">
                    <div>
                      <label htmlFor="current-password" className="block text-sm font-medium text-gray-700">
                        Current Password
                      </label>
                      <input
                        type="password"
                        id="current-password"
                        name="current-pass-entry"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                      />
                    </div>
                    <div>
                      <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="new-password"
                        name="new-pass-entry"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                        minLength={6}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                      />
                    </div>
                    <div>
                      <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        id="confirm-password"
                        name="confirm-pass-entry"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
                        required
                        minLength={6}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        data-lpignore="true"
                        data-1p-ignore="true"
                      />
                    </div>
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isUpdating}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isUpdating ? 'Updating...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {activeTab === 'delete' && (
                <div className="space-y-6">
                  <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <FiAlertTriangle className="h-5 w-5 text-red-500 dark:text-red-300" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-semibold">Danger Zone</h3>
                        <p className="mt-2">This action cannot be undone. All your data will be permanently deleted.</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4">
                    {!showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="inline-flex items-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-offset-gray-900"
                      >
                        <FiTrash2 className="mr-2 h-4 w-4" />
                        Delete My Account
                      </button>
                    ) : (
                      <div className="space-y-4">
                        {hasPasswordProvider ? (
                          <div>
                            <label htmlFor="delete-password" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                              Enter your password to confirm account deletion
                            </label>
                            <input
                              type="password"
                              id="delete-password"
                              name="delete-pass-entry"
                              value={deletePassword}
                              onChange={(e) => setDeletePassword(e.target.value)}
                              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-red-500 focus:outline-none focus:ring-red-500 sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
                              placeholder="Enter your password"
                              required
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="none"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                            />
                          </div>
                        ) : (
                          <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                            <p className="font-medium">Confirm with Google</p>
                            <p className="mt-1">We&apos;ll open a Google window so you can reauthenticate before deleting your account.</p>
                          </div>
                        )}
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeletePassword('');
                            }}
                            className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleDeleteAccount}
                            disabled={isDeleting}
                            className="flex-1 rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-red-500 dark:hover:bg-red-600 dark:focus:ring-offset-gray-900"
                          >
                            {isDeleting ? 'Deleting...' : 'Permanently Delete Account'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple user avatar dropdown (duplicated from notebooks page for consistency)
function UserMenu({ email, onLogout }: { email: string; onLogout: () => Promise<void> | void }) {
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
        className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold cursor-pointer"
        title={email}
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20">
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

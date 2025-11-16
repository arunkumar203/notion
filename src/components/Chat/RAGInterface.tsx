'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { FiDatabase, FiRefreshCw, FiInfo, FiCheck, FiX, FiLoader } from 'react-icons/fi';

interface RAGStatus {
    status: 'not_built' | 'building' | 'ready' | 'error';
    enabled: boolean;
    totalChunks: number;
    totalPages: number;
    lastUpdated?: string;
    currentStep?: {
        step: string;
        details: any;
        timestamp: string;
    };
    startedAt?: number;
    completedAt?: number;
    errorAt?: number;
    lastError?: string;
    firestoreInfo?: {
        totalChunks: number;
        metadata: any;
    };
}

interface RAGInterfaceProps {
    onRAGResponse?: (response: any) => void;
}

function RAGInterface({ onRAGResponse }: RAGInterfaceProps) {
    const { user } = useAuth();
    const [ragStatus, setRAGStatus] = useState<RAGStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [building, setBuilding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch RAG status
    const fetchRAGStatus = async () => {
        if (!user) return;

        try {
            setLoading(true);
            const response = await fetch('/api/rag/status', {
                credentials: 'include'
            });

            if (response.ok) {
                const status = await response.json();
                setRAGStatus(status);

                // Auto-stop building state when build completes
                if (building && (status.status === 'ready' || status.status === 'error')) {
                    setBuilding(false);
                }

                // Pass status to parent component
                if (onRAGResponse) {
                    onRAGResponse(status);
                }
            } else {
                setError('Failed to fetch RAG status');
            }
        } catch (err) {
            setError('Error fetching RAG status');
            console.error('RAG status error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Build RAG index
    const buildRAGIndex = async () => {
        if (!user) return;

        try {
            setBuilding(true);
            setError(null);

            // Immediately update status to show building started
            setRAGStatus(prev => ({
                ...prev,
                status: 'building' as const,
                enabled: prev?.enabled ?? false,
                totalChunks: prev?.totalChunks ?? 0,
                totalPages: prev?.totalPages ?? 0,
                currentStep: {
                    step: 'Starting Build',
                    details: { status: 'initializing', message: 'Preparing to build knowledge base...' },
                    timestamp: new Date().toISOString()
                }
            }));

            const response = await fetch('/api/rag/build', {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();

                // Just set building state, no auto-polling
                setBuilding(true);

            } else {
                const errorData = await response.json();
                setError(errorData.error || 'Failed to build RAG index');
                setBuilding(false);
            }
        } catch (err) {
            setError('Error building RAG index');
            console.error('RAG build error:', err);
            setBuilding(false);
        }
    };



    // Query RAG
    const queryRAG = async (question: string) => {
        if (!user || !question.trim()) return null;

        try {
            const response = await fetch('/api/rag/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question }),
                credentials: 'include'
            });

            if (response.ok) {
                const result = await response.json();
                if (onRAGResponse) {
                    onRAGResponse(result);
                }
                return result;
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'RAG query failed');
            }
        } catch (err) {
            console.error('RAG query error:', err);
            throw err;
        }
    };

    // Load status on mount
    useEffect(() => {
        fetchRAGStatus();
    }, [user]);

    // Auto-refresh status during build
    useEffect(() => {
        if (!building && ragStatus?.status !== 'building') return;

        const interval = setInterval(() => {
            fetchRAGStatus();
        }, 3000); // Check every 3 seconds during build

        return () => clearInterval(interval);
    }, [building, ragStatus?.status]);

    const getStatusIcon = () => {
        switch (ragStatus?.status) {
            case 'ready':
                return <FiCheck className="text-green-500" />;
            case 'building':
                return <FiLoader className="text-blue-500 animate-spin" />;
            case 'error':
                return <FiX className="text-red-500" />;
            default:
                return <FiDatabase className="text-gray-400" />;
        }
    };

    const formatDate = (dateString: string | number) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Check if we should show error
    const shouldShowError = () => {
        if (!ragStatus?.lastError) return false;

        // Don't show "Build stopped by user" message (legacy)
        if (ragStatus.lastError.includes('Build stopped by user')) return false;

        return true;
    };

    // Check if we have a previous successful build to fall back to
    const hasPreviousBuild = () => {
        return ragStatus?.completedAt && ragStatus?.totalChunks > 0;
    };

    // Get the appropriate status message
    const getStatusMessage = () => {
        if (ragStatus?.status === 'ready') {
            return `Ready (${ragStatus.totalPages} pages, ${ragStatus.totalChunks} chunks)`;
        }

        if (ragStatus?.status === 'building') {
            return ragStatus.currentStep ?
                `${ragStatus.currentStep.step}...` :
                'Building knowledge base...';
        }

        if (ragStatus?.status === 'error' && shouldShowError()) {
            if (hasPreviousBuild()) {
                return `Last failed at ${formatDate(ragStatus?.errorAt || Date.now())} - Using previous build (${ragStatus?.totalPages || 0} pages, ${ragStatus?.totalChunks || 0} chunks)`;
            } else {
                return 'Build failed - No previous build available';
            }
        }

        return 'Not built';
    };

    // Memoize expensive calculations
    const statusIcon = useMemo(() => getStatusIcon(), [ragStatus?.status]);
    const statusMessage = useMemo(() => getStatusMessage(), [ragStatus]);
    const showError = useMemo(() => shouldShowError(), [ragStatus?.lastError, ragStatus?.status]);
    const hasPrevBuild = useMemo(() => hasPreviousBuild(), [ragStatus?.completedAt, ragStatus?.totalChunks]);

    return (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {statusIcon}
                    <span className="font-medium text-gray-900">Knowledge Base</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchRAGStatus}
                        disabled={loading}
                        className="p-1 hover:bg-gray-100 rounded"
                        title="Refresh status"
                    >
                        <FiRefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>

                    {!(building || ragStatus?.status === 'building') && (
                        <button
                            onClick={buildRAGIndex}
                            className={`px-3 py-1 text-white text-sm rounded ${ragStatus?.status === 'error'
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : ragStatus?.status === 'ready'
                                    ? 'bg-green-600 hover:bg-green-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                        >
                            {ragStatus?.status === 'error'
                                ? 'Try Again'
                                : ragStatus?.status === 'ready'
                                    ? 'Rebuild Index'
                                    : 'Build Index'
                            }
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-4">
                    <FiLoader className="animate-spin text-blue-500" />
                    <span className="text-sm text-blue-700">Loading RAG status...</span>
                </div>
            ) : (
                <>
                    <div className="text-sm text-gray-600 mb-2">
                        {statusMessage}
                    </div>

                    {/* Current step details */}
                    {ragStatus?.currentStep && ragStatus.status === 'building' && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                            <div className="text-sm font-medium text-blue-900 mb-1">
                                Current Step: {ragStatus.currentStep.step}
                            </div>
                            <div className="text-xs text-blue-700">
                                {ragStatus.currentStep.step === 'RAG Pipeline' && ragStatus.currentStep.details?.max_pages ? (
                                    <div>
                                        📚 Processing up to {ragStatus.currentStep.details.max_pages} pages
                                        <br />
                                        🔄 {ragStatus.currentStep.details.message}
                                    </div>
                                ) : ragStatus.currentStep.step === 'Clearing Old Vectors' ? (
                                    <div>🗑️ Removing previous knowledge base to avoid conflicts</div>
                                ) : ragStatus.currentStep.step === 'Loading Pages' ? (
                                    <div>
                                        📖 Finding your pages...
                                        {ragStatus.currentStep.details?.total_found && (
                                            <div className="mt-1">
                                                Found: {ragStatus.currentStep.details.total_found} total,
                                                Processing: {ragStatus.currentStep.details.processed},
                                                With content: {ragStatus.currentStep.details.with_content}
                                            </div>
                                        )}
                                    </div>
                                ) : ragStatus.currentStep.step === 'Creating Chunks' ? (
                                    <div>✂️ Breaking content into searchable chunks...</div>
                                ) : ragStatus.currentStep.step === 'Generating Embeddings' ? (
                                    <div>🧠 Creating  embeddings for search...</div>
                                ) : ragStatus.currentStep.step === 'Storing Vectors' ? (
                                    <div>💾 Saving to your knowledge base...</div>
                                ) : (
                                    JSON.stringify(ragStatus.currentStep.details, null, 2)
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error display */}
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                            <div className="text-sm text-red-700">{error}</div>
                            {error.includes('API key') && (
                                <div className="text-xs text-red-600 mt-2">
                                    💡 Add your Google AI API key in Account Settings → AI Configuration
                                </div>
                            )}
                        </div>
                    )}

                    {/* Last error - Show detailed error without retry */}
                    {showError && (
                        <div className="bg-red-50 border border-red-200 rounded p-3 mb-3">
                            <div className="text-sm font-medium text-red-900 mb-2">
                                Last Failed: {formatDate(ragStatus?.errorAt || Date.now())}
                            </div>
                            <div className="text-xs text-red-700 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                                {ragStatus?.lastError}
                            </div>
                            {hasPrevBuild ? (
                                <div className="mt-2 text-xs text-amber-600">
                                    ⚠️ Using previous successful build from {formatDate(ragStatus?.completedAt || Date.now())} - RAG is still functional
                                </div>
                            ) : (
                                <div className="mt-2 text-xs text-red-600">
                                    ❌ No previous build available - Please fix the issues above and try again
                                </div>
                            )}
                        </div>
                    )}

                    {/* Success info */}
                    {ragStatus?.status === 'ready' && (
                        <div className="bg-green-50 border border-green-200 rounded p-3">
                            <div className="text-sm text-green-700">
                                ✅ Knowledge base ready with {ragStatus.totalPages} pages processed into {ragStatus.totalChunks} searchable chunks
                            </div>
                            <div className="text-xs text-green-600 mt-1">
                                📚 All pages processed • 🔄 Old data cleared • 🤖 RAG + AI fallback enabled
                            </div>
                            {ragStatus.completedAt && (
                                <div className="text-xs text-green-600 mt-1">
                                    Last successful build: {formatDate(ragStatus.completedAt)}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// Export the memoized component to prevent unnecessary re-renders
export default memo(RAGInterface);
export type { RAGStatus };
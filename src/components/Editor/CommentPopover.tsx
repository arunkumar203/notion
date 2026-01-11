'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FiMessageSquare, FiX, FiSend, FiTrash2, FiEdit2, FiCheck, FiLoader } from 'react-icons/fi';

export interface Comment {
    id: string;
    text: string;
    authorId: string;
    authorName?: string;
    createdAt: number;
    updatedAt?: number;
}

interface CommentPopoverProps {
    commentId: string;
    comments: Comment[];
    position: { top: number; left: number } | null;
    onClose: () => void;
    onAddComment: (commentId: string, text: string) => Promise<void>;
    onUpdateComment: (commentId: string, text: string) => Promise<void>;
    onDeleteComment: (commentId: string) => Promise<void>;
    currentUserId?: string;
    isLoading?: boolean;
    canComment?: boolean;
}

export default function CommentPopover({
    commentId,
    comments,
    position,
    onClose,
    onAddComment,
    onUpdateComment,
    onDeleteComment,
    currentUserId,
    isLoading,
    canComment = true,
}: CommentPopoverProps) {
    const [newCommentText, setNewCommentText] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expandedComment, setExpandedComment] = useState<Comment | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Filter comments for this specific comment mark
    const threadComments = comments.filter(c => c.id.startsWith(commentId));

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Auto-focus textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    // Convert HTML to Markdown when pasting
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const html = clipboardData.getData('text/html');
        if (!html) return; // If no HTML, let default paste happen

        e.preventDefault();

        // Simple HTML to Markdown conversion
        let markdown = html;

        // Convert headings
        markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
        markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
        markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
        markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

        // Convert bold and strong
        markdown = markdown.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '**$2**');

        // Convert italic and emphasis
        markdown = markdown.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '*$2*');

        // Convert links
        markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Convert lists
        markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
        markdown = markdown.replace(/<\/ul>/gi, '\n');
        markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
        markdown = markdown.replace(/<\/ol>/gi, '\n');
        markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

        // Convert code
        markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
        markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n');

        // Convert blockquotes
        markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');

        // Convert paragraphs
        markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

        // Convert line breaks
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

        // Remove remaining HTML tags
        markdown = markdown.replace(/<[^>]+>/g, '');

        // Decode HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = markdown;
        markdown = textarea.value;

        // Clean up extra whitespace
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

        // Insert the markdown at cursor position
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const currentValue = target.value;

        const newValue = currentValue.substring(0, start) + markdown + currentValue.substring(end);
        setNewCommentText(newValue);

        // Set cursor position after inserted text
        setTimeout(() => {
            target.selectionStart = target.selectionEnd = start + markdown.length;
            target.focus();
        }, 0);
    };

    // Handle paste for edit textarea
    const handleEditPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const html = clipboardData.getData('text/html');
        if (!html) return;

        e.preventDefault();

        // Same HTML to Markdown conversion
        let markdown = html;
        markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
        markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
        markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
        markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
        markdown = markdown.replace(/<(b|strong)[^>]*>(.*?)<\/(b|strong)>/gi, '**$2**');
        markdown = markdown.replace(/<(i|em)[^>]*>(.*?)<\/(i|em)>/gi, '*$2*');
        markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
        markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
        markdown = markdown.replace(/<\/ul>/gi, '\n');
        markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
        markdown = markdown.replace(/<\/ol>/gi, '\n');
        markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
        markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
        markdown = markdown.replace(/<pre[^>]*>(.*?)<\/pre>/gi, '```\n$1\n```\n');
        markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n\n');
        markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
        markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
        markdown = markdown.replace(/<[^>]+>/g, '');

        const textarea = document.createElement('textarea');
        textarea.innerHTML = markdown;
        markdown = textarea.value;
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const currentValue = target.value;

        const newValue = currentValue.substring(0, start) + markdown + currentValue.substring(end);
        setEditText(newValue);

        setTimeout(() => {
            target.selectionStart = target.selectionEnd = start + markdown.length;
            target.focus();
        }, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canComment || !newCommentText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onAddComment(commentId, newCommentText.trim());
            setNewCommentText('');
        } catch (error) {
            console.error('Error adding comment:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpdate = async (commentIdToUpdate: string) => {
        if (!canComment || !editText.trim() || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onUpdateComment(commentIdToUpdate, editText.trim());
            setEditingCommentId(null);
            setEditText('');
        } catch (error) {
            console.error('Error updating comment:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (commentIdToDelete: string) => {
        if (!confirm('Delete this comment?')) return;

        setIsSubmitting(true);
        try {
            await onDeleteComment(commentIdToDelete);
        } catch (error) {
            console.error('Error deleting comment:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const startEditing = (comment: Comment) => {
        setEditingCommentId(comment.id);
        setEditText(comment.text);
    };

    const cancelEditing = () => {
        setEditingCommentId(null);
        setEditText('');
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    if (!position) return null;

    return (
        <div
            ref={popoverRef}
            className="fixed z-50 flex gap-3"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`,
            }}
        >
            {/* Main Comment Panel */}
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-80 max-h-[32rem] flex flex-col" style={{ maxWidth: '45vw' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-center gap-2">
                        <FiMessageSquare className="text-indigo-600" size={18} />
                        <h3 className="font-semibold text-gray-900">Comments</h3>
                        {threadComments.length > 0 && (
                            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                {threadComments.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="Close"
                    >
                        <FiX size={18} />
                    </button>
                </div>

                {/* Comments List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-2">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                            <p className="text-xs text-gray-500 font-medium">Loading comments...</p>
                        </div>
                    ) : threadComments.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">
                            No comments yet. Be the first to comment!
                        </p>
                    ) : (
                        threadComments.map((comment) => (
                            <div
                                key={comment.id}
                                className={`bg-gray-50 rounded-lg p-3 border cursor-pointer transition-colors ${expandedComment?.id === comment.id
                                    ? 'border-indigo-400 ring-2 ring-indigo-200'
                                    : 'border-gray-200 hover:border-indigo-300'
                                    }`}
                                onClick={() => setExpandedComment(expandedComment?.id === comment.id ? null : comment)}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-gray-900">
                                            {comment.authorName || 'Anonymous'}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {formatTimestamp(comment.createdAt)}
                                            {comment.updatedAt && comment.updatedAt !== comment.createdAt && (
                                                <span className="ml-1">(edited)</span>
                                            )}
                                        </div>
                                    </div>
                                    {canComment && currentUserId === comment.authorId && (
                                        <div className="flex items-center gap-1">
                                            {editingCommentId !== comment.id && (
                                                <>
                                                    <button
                                                        onClick={() => startEditing(comment)}
                                                        className="text-gray-400 hover:text-indigo-600 transition-colors p-1"
                                                        title="Edit"
                                                    >
                                                        <FiEdit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(comment.id)}
                                                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                                                        title="Delete"
                                                        disabled={isSubmitting}
                                                    >
                                                        {isSubmitting ? (
                                                            <FiLoader className="animate-spin" size={14} />
                                                        ) : (
                                                            <FiTrash2 size={14} />
                                                        )}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {editingCommentId === comment.id ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            onPaste={handleEditPaste}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                                            rows={3}
                                            placeholder="Edit your comment... (Markdown supported)"
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleUpdate(comment.id)}
                                                disabled={isSubmitting || !editText.trim()}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <FiCheck size={14} />
                                                Save
                                            </button>
                                            <button
                                                onClick={cancelEditing}
                                                disabled={isSubmitting}
                                                className="px-3 py-1.5 text-gray-600 rounded-lg text-xs hover:bg-gray-100 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-600 line-clamp-2">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ ...props }) => <span className="inline" {...props} />,
                                                strong: ({ ...props }) => <strong {...props} />,
                                                em: ({ ...props }) => <em {...props} />,
                                                code: ({ ...props }) => <code className="bg-gray-200 px-1 rounded text-xs" {...props} />,
                                                h1: ({ ...props }) => <strong {...props} />,
                                                h2: ({ ...props }) => <strong {...props} />,
                                                h3: ({ ...props }) => <strong {...props} />,
                                                ul: ({ ...props }) => <span {...props} />,
                                                ol: ({ ...props }) => <span {...props} />,
                                                li: ({ ...props }) => <span {...props} />,
                                                a: ({ ...props }) => <span className="text-indigo-600" {...props} />,
                                            }}
                                        >
                                            {comment.text.length > 100 ? `${comment.text.substring(0, 100)}...` : comment.text}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Add Comment Form */}
                {canComment && (
                    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
                        <textarea
                            ref={textareaRef}
                            value={newCommentText}
                            onChange={(e) => setNewCommentText(e.target.value)}
                            onPaste={handlePaste}
                            placeholder="Add a comment... (Markdown supported: **bold**, *italic*, # heading)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                            rows={3}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSubmit(e as any);
                                }
                            }}
                        />
                        <div className="flex items-center justify-between mt-2">
                            <p className="text-xs text-gray-500">
                                Cmd/Ctrl+Enter to submit
                            </p>
                            <button
                                type="submit"
                                disabled={isSubmitting || !newCommentText.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <FiSend size={14} />
                                {isSubmitting ? 'Sending...' : 'Comment'}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* Expanded Comment Panel (Right Side) */}
            {expandedComment && (
                <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-80 max-h-[32rem] flex flex-col" style={{ maxWidth: '40vw' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-yellow-50 to-amber-50">
                        <div className="flex items-center gap-2">
                            <FiMessageSquare className="text-amber-600" size={18} />
                            <h3 className="font-semibold text-gray-900">Full Comment</h3>
                        </div>
                        <button
                            onClick={() => setExpandedComment(null)}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                            title="Close"
                        >
                            <FiX size={18} />
                        </button>
                    </div>

                    {/* Comment Author & Time */}
                    <div className="px-4 py-3 border-b border-gray-100">
                        <div className="font-medium text-sm text-gray-900">
                            {expandedComment.authorName || 'Anonymous'}
                        </div>
                        <div className="text-xs text-gray-500">
                            {formatTimestamp(expandedComment.createdAt)}
                            {expandedComment.updatedAt && expandedComment.updatedAt !== expandedComment.createdAt && (
                                <span className="ml-1">(edited)</span>
                            )}
                        </div>
                    </div>

                    {/* Full Comment Content with Markdown */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="prose prose-sm max-w-none text-gray-800">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    h1: ({ ...props }) => (
                                        <h1 className="text-lg font-bold text-gray-900 mt-2 mb-1" {...props} />
                                    ),
                                    h2: ({ ...props }) => (
                                        <h2 className="text-base font-bold text-gray-900 mt-2 mb-1" {...props} />
                                    ),
                                    h3: ({ ...props }) => (
                                        <h3 className="text-sm font-bold text-gray-900 mt-1 mb-1" {...props} />
                                    ),
                                    p: ({ ...props }) => (
                                        <p className="text-sm text-gray-700 my-2 leading-relaxed" {...props} />
                                    ),
                                    ul: ({ ...props }) => (
                                        <ul className="text-sm text-gray-700 list-disc list-outside ml-5 my-2 space-y-1" {...props} />
                                    ),
                                    ol: ({ ...props }) => (
                                        <ol className="text-sm text-gray-700 list-decimal list-outside ml-5 my-2 space-y-1" {...props} />
                                    ),
                                    li: ({ ...props }) => (
                                        <li className="text-sm text-gray-700 leading-relaxed" {...props} />
                                    ),
                                    code: ({ className, children, ...props }: any) => {
                                        const inline = !className;
                                        return inline ? (
                                            <code className="bg-gray-200 px-1 py-0.5 rounded text-xs font-mono" {...props}>{children}</code>
                                        ) : (
                                            <code className="block bg-gray-200 p-2 rounded text-xs font-mono my-2" {...props}>{children}</code>
                                        );
                                    },
                                    blockquote: ({ ...props }) => (
                                        <blockquote className="border-l-4 border-amber-300 pl-3 text-sm text-gray-600 italic my-2" {...props} />
                                    ),
                                    strong: ({ ...props }) => (
                                        <strong className="font-bold text-gray-900" {...props} />
                                    ),
                                    em: ({ ...props }) => (
                                        <em className="italic text-gray-700" {...props} />
                                    ),
                                    a: ({ ...props }) => (
                                        <a className="text-indigo-600 hover:text-indigo-800 underline" target="_blank" rel="noopener noreferrer" {...props} />
                                    ),
                                }}
                            >
                                {expandedComment.text}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


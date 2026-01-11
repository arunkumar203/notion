import { Mark, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
    HTMLAttributes: Record<string, any>;
    onCommentClick?: (commentId: string) => void;
}

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        comment: {
            /**
             * Set a comment mark
             */
            setComment: (commentId: string) => ReturnType;
            /**
             * Toggle comment mark
             */
            toggleComment: (commentId: string) => ReturnType;
            /**
             * Unset comment mark
             */
            unsetComment: () => ReturnType;
        };
    }
}

/**
 * Comment Extension for TipTap
 * 
 * This extension allows users to add comments to selected text.
 * Comments are stored as marks with a unique ID that links to comment data.
 */
export const Comment = Mark.create<CommentOptions>({
    name: 'comment',

    addOptions() {
        return {
            HTMLAttributes: {},
            onCommentClick: undefined,
        };
    },

    addAttributes() {
        return {
            commentId: {
                default: null,
                parseHTML: element => element.getAttribute('data-comment-id'),
                renderHTML: attributes => {
                    if (!attributes.commentId) {
                        return {};
                    }
                    return {
                        'data-comment-id': attributes.commentId,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-comment-id]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(
                this.options.HTMLAttributes,
                HTMLAttributes,
                {
                    class: 'comment-mark',
                    style: 'background-color: rgba(255, 215, 0, 0.3); border-bottom: 2px solid rgba(255, 215, 0, 0.6); cursor: pointer; position: relative;',
                }
            ),
            0,
        ];
    },

    addCommands() {
        return {
            setComment:
                (commentId: string) =>
                    ({ commands }) => {
                        return commands.setMark(this.name, { commentId });
                    },
            toggleComment:
                (commentId: string) =>
                    ({ commands }) => {
                        return commands.toggleMark(this.name, { commentId });
                    },
            unsetComment:
                () =>
                    ({ commands }) => {
                        return commands.unsetMark(this.name);
                    },
        };
    },

    // Add click handler for commented text
    onCreate() {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const commentMark = target.closest('.comment-mark');

            if (commentMark) {
                const commentId = commentMark.getAttribute('data-comment-id');
                if (commentId && this.options.onCommentClick) {
                    this.options.onCommentClick(commentId);
                }
            }
        };

        // Add global click listener
        document.addEventListener('click', handleClick);

        // Store the handler for cleanup
        (this as any)._clickHandler = handleClick;
    },

    onDestroy() {
        // Remove click listener on destroy
        if ((this as any)._clickHandler) {
            document.removeEventListener('click', (this as any)._clickHandler);
        }
    },
});

export default Comment;

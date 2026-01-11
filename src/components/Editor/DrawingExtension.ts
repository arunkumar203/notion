import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import DrawingCanvas from './DrawingCanvas';

export const Drawing = Node.create({
    name: 'drawing',
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            strokes: {
                default: [],
                parseHTML: element => {
                    const data = element.getAttribute('data-strokes');
                    return data ? JSON.parse(data) : [];
                },
                renderHTML: attributes => {
                    return {
                        'data-strokes': JSON.stringify(attributes.strokes)
                    };
                }
            }
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="drawing"]'
            }
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', { 'data-type': 'drawing', ...HTMLAttributes }];
    },

    addNodeView() {
        return ReactNodeViewRenderer(DrawingCanvas);
    },

    addCommands() {
        return {
            insertDrawing: () => ({ commands }: any) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: {
                        strokes: []
                    }
                });
            }
        } as any;
    }
});

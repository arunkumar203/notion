import { Node, mergeAttributes, Extension } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useEffect, useRef } from 'react';
import { Plugin, PluginKey } from 'prosemirror-state';

// Simple LaTeX renderer without external dependencies
function renderLatex(latex: string): string {
    return latex
        .replace(/\^(\{[^}]+\}|\w)/g, '<sup>$1</sup>')
        .replace(/_(\{[^}]+\}|\w)/g, '<sub>$1</sub>')
        .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span style="display:inline-block;text-align:center;vertical-align:middle"><span style="display:block;border-bottom:1px solid;padding:0 4px">$1</span><span style="display:block;padding:0 4px">$2</span></span>')
        .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
        .replace(/\\sum/g, '∑')
        .replace(/\\int/g, '∫')
        .replace(/\\alpha/g, 'α')
        .replace(/\\beta/g, 'β')
        .replace(/\\gamma/g, 'γ')
        .replace(/\\delta/g, 'δ')
        .replace(/\\theta/g, 'θ')
        .replace(/\\lambda/g, 'λ')
        .replace(/\\mu/g, 'μ')
        .replace(/\\pi/g, 'π')
        .replace(/\\sigma/g, 'σ')
        .replace(/\\omega/g, 'ω')
        .replace(/\\infty/g, '∞')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\pm/g, '±')
        .replace(/\\leq/g, '≤')
        .replace(/\\geq/g, '≥')
        .replace(/\\neq/g, '≠')
        .replace(/\\approx/g, '≈')
        .replace(/\{/g, '')
        .replace(/\}/g, '');
}

export const MathInline = Node.create({
    name: 'mathInline',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: false,

    addAttributes() {
        return {
            latex: {
                default: '',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-type="math-inline"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' }), HTMLAttributes.latex || ''];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MathInlineComponent);
    },
});

export const MathBlock = Node.create({
    name: 'mathBlock',
    group: 'block',
    atom: true,
    selectable: false,

    addAttributes() {
        return {
            latex: {
                default: '',
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="math-block"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' }), HTMLAttributes.latex || ''];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MathBlockComponent);
    },
});

function MathInlineComponent({ node, updateAttributes }: any) {
    const [editing, setEditing] = useState(false);
    const [latex, setLatex] = useState(node.attrs.latex || '');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editing]);

    const handleSave = () => {
        updateAttributes({ latex });
        setEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setLatex(node.attrs.latex);
            setEditing(false);
        }
    };

    if (editing) {
        return (
            <NodeViewWrapper as="span" className="inline-block" contentEditable={false}>
                <input
                    ref={inputRef}
                    type="text"
                    value={latex}
                    onChange={(e) => setLatex(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={(e) => e.stopPropagation()}
                    className="px-3 py-1.5 border-2 border-blue-500 rounded bg-white font-mono text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Enter LaTeX..."
                    style={{ minWidth: '200px' }}
                />
            </NodeViewWrapper>
        );
    }

    const renderedLatex = node.attrs.latex ? renderLatex(node.attrs.latex) : 'LaTeX';

    return (
        <NodeViewWrapper
            as="span"
            className="inline-block px-3 py-1.5 mx-1 bg-gray-100 border border-gray-300 rounded cursor-pointer hover:bg-gray-200 transition-colors"
            onClick={() => setEditing(true)}
            title="Click to edit LaTeX"
        >
            <span
                className="text-gray-900 font-serif text-base"
                dangerouslySetInnerHTML={{ __html: renderedLatex }}
            />
        </NodeViewWrapper>
    );
}

function MathBlockComponent({ node, updateAttributes }: any) {
    const [editing, setEditing] = useState(false);
    const [latex, setLatex] = useState(node.attrs.latex || '');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (editing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [editing]);

    const handleSave = () => {
        updateAttributes({ latex });
        setEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
            e.preventDefault();
            setLatex(node.attrs.latex);
            setEditing(false);
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSave();
        }
    };

    if (editing) {
        return (
            <NodeViewWrapper className="my-4" contentEditable={false}>
                <div className="border-2 border-blue-500 rounded-lg p-4 bg-white shadow-lg">
                    <div className="text-xs text-gray-600 mb-2 font-medium">LaTeX Equation (Ctrl+Enter to save, Esc to cancel)</div>
                    <textarea
                        ref={textareaRef}
                        value={latex}
                        onChange={(e) => setLatex(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={handleKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => e.stopPropagation()}
                        className="w-full px-3 py-2 border border-gray-300 rounded font-mono text-sm resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Enter LaTeX equation..."
                    />
                </div>
            </NodeViewWrapper>
        );
    }

    const renderedLatex = node.attrs.latex ? renderLatex(node.attrs.latex) : 'Enter LaTeX equation...';

    return (
        <NodeViewWrapper className="my-4">
            <div
                className="border border-gray-300 rounded-lg p-6 bg-gray-800 cursor-pointer hover:bg-gray-700 transition-colors"
                onClick={() => setEditing(true)}
                title="Click to edit LaTeX"
            >
                <div
                    className="text-white font-serif text-xl text-center"
                    dangerouslySetInnerHTML={{ __html: renderedLatex }}
                />
            </div>
        </NodeViewWrapper>
    );
}

export const MathPasteHandler = Extension.create({
    name: 'mathPasteHandler',

    addProseMirrorPlugins() {
        const editor = this.editor;

        return [
            new Plugin({
                key: new PluginKey('mathPasteHandler'),
                props: {
                    handlePaste: (view, event) => {
                        const text = event.clipboardData?.getData('text/plain');
                        if (!text) return false;

                        const blockLatexMatch = text.match(/^\$\$([\s\S]+?)\$\$/);
                        if (blockLatexMatch) {
                            const latex = blockLatexMatch[1].trim();
                            editor.chain().focus().insertContent({
                                type: 'mathBlock',
                                attrs: { latex }
                            }).run();
                            return true;
                        }

                        const inlineLatexMatch = text.match(/^\$([^\$]+)\$/);
                        if (inlineLatexMatch) {
                            const latex = inlineLatexMatch[1].trim();
                            editor.chain().focus().insertContent({
                                type: 'mathInline',
                                attrs: { latex }
                            }).run();
                            return true;
                        }

                        if (text.includes('\\frac') || text.includes('\\sum') || text.includes('\\int') ||
                            text.includes('\\alpha') || text.includes('\\beta') || text.includes('\\sqrt') ||
                            text.match(/\\[a-zA-Z]+/)) {
                            editor.chain().focus().insertContent({
                                type: 'mathInline',
                                attrs: { latex: text.trim() }
                            }).run();
                            return true;
                        }

                        return false;
                    },
                },
            }),
        ];
    },
});

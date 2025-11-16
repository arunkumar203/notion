'use client';

import { useEditor, EditorContent, Editor as TiptapEditor } from '@tiptap/react';
import type { AnyExtension } from '@tiptap/core';
import { Mark, Extension } from '@tiptap/core';
import { useAuth } from '@/context/AuthContext';
import StarterKit from '@tiptap/starter-kit';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import React, { useEffect, useImperativeHandle, forwardRef, useState, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { TextSelection, NodeSelection } from 'prosemirror-state';
import { Fragment, DOMSerializer } from 'prosemirror-model';
import type { Selection } from 'prosemirror-state';
// Notion-like extras
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
// Default Image extension is replaced by custom ResizableImage
import ResizableImage from './extensions/ResizableImage';
import FileLink from './extensions/FileLink';
import PageLink from './extensions/PageLink';
import YouTube from './extensions/YouTube';
import KanbanExtensions from './extensions/Kanban';
import TableExtension from './extensions/Table';
import HtmlTableExtensions from './extensions/HtmlTable';
import { MathInline, MathBlock, MathPasteHandler } from './extensions/Math';

import CharacterCount from '@tiptap/extension-character-count';
import { FiBold, FiItalic, FiUnderline, FiLink, FiList, FiHash, FiCheckSquare, FiCode, FiAlignLeft, FiAlignCenter, FiAlignRight, FiAlignJustify, FiMinus, FiImage, FiTable, FiYoutube, FiFile, FiFileText, FiChevronDown, FiChevronUp, FiChevronLeft, FiChevronRight, FiX, FiMenu, FiPlus, FiSave, FiTrash2, FiEdit2, FiCopy } from 'react-icons/fi';
import { TbStrikethrough } from 'react-icons/tb';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { marked } from 'marked';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import java from 'highlight.js/lib/languages/java';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { auth, db } from '@/lib/firebase';
import { doc as fsDoc, getDoc as fsGetDoc } from 'firebase/firestore';
import { appwriteStorage, AppwriteID } from '@/lib/appwrite';
import { useNotebook } from '@/context/NotebookContext';

interface EditorProps {
  content: string;
  onUpdate?: (content: string) => void;
  resetKey?: string;
  className?: string;
  spellcheck?: boolean;
  lang?: string;
  // Optional: when provided, a slash command "Write with AI" appears and can be triggered with Space
  onRequestAI?: () => void;
  // narrow config to known subset of props we use; allow unknown keys via index signature
  config?: {
    editorProps?: { attributes?: Record<string, string> };
    autofocus?: boolean;
    immediatelyRender?: boolean;
    enableInputRules?: boolean;
    enablePasteRules?: boolean;
    extensions?: AnyExtension[]; // TipTap extensions list
    editable?: boolean;
  };
  onEditorReady?: (editor: TiptapEditor) => void;
}

type TableHandleState = {
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

// Simple error boundary to prevent the entire app from crashing if the editor hits a runtime error
class EditorErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_error: any) {
    // Swallow editor runtime errors to keep the app usable
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[200px] p-3 bg-white border border-red-200 rounded text-red-700 text-sm">
          Editor encountered an error rendering this content. You can try editing again or clearing problematic blocks.
        </div>
      );
    }
    return this.props.children as any;
  }
}

const Editor = forwardRef<TiptapEditor | null, EditorProps>(({
  content,
  onUpdate,
  className = '',
  config = {},
  onEditorReady,
  resetKey,
  spellcheck,
  lang,
  onRequestAI,
}, ref) => {
  // Access pages and actions for linking
  let pagesFromCtx: { id: string; name: string; parentPageId?: string }[] = [];
  let createPageFromCtx: ((name: string, parentPageId?: string) => Promise<string>) | null = null;
  let selectPageFromCtx: ((id: string | null) => void) | null = null;
  let gotoPageFromCtx: ((pageId: string) => Promise<void>) | null = null;
  let deletePageFromCtx: ((id: string) => Promise<void>) | null = null;
  let renamePageFromCtx: ((id: string, name: string) => Promise<void>) | null = null;
  let setPageParentFromCtx: ((id: string, parentPageId: string | null) => Promise<void>) | null = null;
  let selectedPageFromCtx: string | null = null;
  try {
    const nb = useNotebook() as any;
    pagesFromCtx = (nb?.pages as any[]) || [];
    createPageFromCtx = typeof nb?.createPage === 'function' ? nb.createPage : null;
    selectPageFromCtx = typeof nb?.selectPage === 'function' ? nb.selectPage : null;
    gotoPageFromCtx = typeof nb?.gotoPage === 'function' ? nb.gotoPage : null;
    deletePageFromCtx = typeof nb?.deletePage === 'function' ? nb.deletePage : null;
    renamePageFromCtx = typeof nb?.renamePage === 'function' ? nb.renamePage : null;
    setPageParentFromCtx = typeof nb?.setPageParent === 'function' ? nb.setPageParent : null;
    selectedPageFromCtx = nb?.selectedPage ?? null;
  } catch { }
  const [isMounted, setIsMounted] = useState(false);
  // Ensure we flip to mounted before paint to avoid lingering placeholder
  useLayoutEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Fallback if editor fails to initialize in time
  const [fallbackMode, setFallbackMode] = useState(false);

  // Track last applied resetKey/content and whether user has edited since then
  const lastAppliedResetKeyRef = useRef<string | undefined>(undefined);
  const dirtySinceProp = useRef(false);
  const pendingApplyRef = useRef<{ resetKey?: string; content: string } | null>(null);

  // Ensure base extensions are always included and append any extras from config.
  // We'll build the full list and then dedupe by extension.name to prevent warnings.
  const extraExtensions: AnyExtension[] = (config?.extensions ?? []) as AnyExtension[];
  // Configure syntax highlighting for code blocks
  const lowlight = createLowlight();
  lowlight.register('cpp', cpp);
  lowlight.register('c++', cpp);
  lowlight.register('c', c);
  lowlight.register('java', java);
  lowlight.register('py', python);
  lowlight.register('python', python);
  lowlight.register('ts', typescript);
  lowlight.register('typescript', typescript);
  lowlight.register('js', javascript);
  lowlight.register('javascript', javascript);
  lowlight.register('bash', bash);
  lowlight.register('sh', bash);
  lowlight.register('json', json);

  // Build base extensions list
  const baseExtensions: AnyExtension[] = [
    // Inline heading mark: visual-only heading for partial selections
    Mark.create({
      name: 'inlineHeading',
      addAttributes() {
        return {
          level: { default: 1, renderHTML: (attrs: any) => ({ 'data-inline-heading': attrs.level }) },
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style?.fontSize || null,
            renderHTML: (attrs: any) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
          },
        };
      },
      parseHTML() { return [{ tag: 'span[data-inline-heading]' }]; },
      renderHTML({ HTMLAttributes }) {
        const lvl = Number(HTMLAttributes['data-inline-heading']) || 1;
        const cl = lvl === 1 ? 'inline-h1' : lvl === 2 ? 'inline-h2' : 'inline-h3';
        return ['span', { ...HTMLAttributes, class: (HTMLAttributes.class || '') + ' ' + cl }, 0];
      },
    }),
    StarterKit.configure({
      codeBlock: false,
      code: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,      // keep autolink while typing
      linkOnPaste: false,  // let our YouTube embed handle paste instead of auto-linking
    }),
    Placeholder.configure({
      placeholder: ({ editor, node, pos }) => {
        const isEmpty = !node || node.content.size === 0;
        const name = node?.type?.name;
        if (!isEmpty) return '';
        let insideTable = false;
        if (typeof pos === 'number' && editor) {
          try {
            const resolved = editor.state.doc.resolve(pos);
            for (let depth = resolved.depth; depth > 0; depth--) {
              const parent = resolved.node(depth);
              const parentName = parent?.type?.name;
              if (parentName === 'tableCell' || parentName === 'tableHeader' || parentName === 'tableRow') {
                insideTable = true;
                break;
              }
            }
          } catch {
            insideTable = false;
          }
        }
        if (insideTable) return '';
        if (name === 'paragraph' || name === 'listItem') {
          return 'Press space for AI, / for commands';
        }
        return '';
      },
      showOnlyCurrent: true,
      includeChildren: true,
    }),
    Underline,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    // Replace default Image with resizable image node view
    (ResizableImage as unknown as AnyExtension),
    // Persisted inline nodes (file/page)
    (FileLink as unknown as AnyExtension),
    (PageLink as unknown as AnyExtension),
    CharacterCount,
    // YouTube embeds (paste a YouTube/Shorts URL, or use slash command)
    (YouTube as unknown as AnyExtension),
    ...KanbanExtensions,
    // Standard HTML table support
    ...HtmlTableExtensions,
    // Custom table extension with advanced features
    (TableExtension as unknown as AnyExtension),
    // Math/LaTeX support
    (MathInline as unknown as AnyExtension),
    (MathBlock as unknown as AnyExtension),
    (MathPasteHandler as unknown as AnyExtension),
    CodeBlockLowlight.configure({
      lowlight,
      HTMLAttributes: {
        class: 'hljs',
        spellcheck: 'false',
      },
    }),
    TextStyle,
    // Enable rendering of fontSize attribute on textStyle mark
    Extension.create({
      name: 'fontSize',
      addGlobalAttributes() {
        return [
          {
            types: ['textStyle'],
            attributes: {
              fontSize: {
                default: null,
                parseHTML: (element: HTMLElement) => element.style?.fontSize || null,
                renderHTML: (attrs: any) => (attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {}),
              },
            },
          },
        ];
      },
    }),
    // Allow optional fontWeight on textStyle so we can keep handwriting fonts at their native weight
    Extension.create({
      name: 'fontWeightAttr',
      addGlobalAttributes() {
        return [
          {
            types: ['textStyle'],
            attributes: {
              fontWeight: {
                default: null,
                parseHTML: (element: HTMLElement) => element.style?.fontWeight || null,
                renderHTML: (attrs: any) => (attrs.fontWeight ? { style: `font-weight: ${attrs.fontWeight}` } : {}),
              },
            },
          },
        ];
      },
    }),
    Color.configure({ types: ['textStyle'] }),
    // Allow font-family mark on text via TextStyle
    FontFamily,
    Code.configure({
      HTMLAttributes: {
        spellcheck: 'false'
      }
    }),
    // Custom: Backspace on empty list item should clear the bullet/number/checkbox and stay on the same line (paragraph)
    Extension.create({
      name: 'listBackspaceFix',
      priority: 1000,
      addKeyboardShortcuts() {
        return {
          Backspace: () => {
            const editor = this.editor;
            const state = editor.state;
            const sel = state.selection as Selection & { $from: any };
            if (!sel.empty) return false;
            const $from = sel.$from;
            const parent = $from.parent;
            if (!parent || !parent.isTextblock) return false;
            const isEmpty = parent.content.size === 0; // empty paragraph inside list item
            if (!isEmpty) return false;
            // Find nearest list item ancestor (bulleted/numbered/task)
            let itemDepth: number | null = null;
            for (let d = $from.depth; d > 0; d--) {
              const nm = $from.node(d)?.type?.name;
              if (nm === 'listItem' || nm === 'taskItem') { itemDepth = d; break; }
            }
            if (!itemDepth) return false;
            const listDepth = itemDepth - 1;
            if (listDepth < 0) return false;
            const listNode = $from.node(listDepth);
            const listStart = $from.before(listDepth);
            const listEnd = $from.after(listDepth);
            const itemIndex = $from.index(listDepth);
            if (!listNode || typeof itemIndex !== 'number') return false;

            return editor.commands.command(({ tr, state, dispatch }) => {
              const para = state.schema.nodes.paragraph.createAndFill();
              if (!para) return false;
              // Build before/after lists
              const beforeItems = [] as any[];
              for (let i = 0; i < itemIndex; i++) beforeItems.push(listNode.child(i));
              const afterItems = [] as any[];
              for (let i = itemIndex + 1; i < listNode.childCount; i++) afterItems.push(listNode.child(i));

              const nodes: any[] = [];
              if (beforeItems.length > 0) {
                nodes.push(listNode.type.create(listNode.attrs, Fragment.fromArray(beforeItems)));
              }
              nodes.push(para);
              if (afterItems.length > 0) {
                nodes.push(listNode.type.create(listNode.attrs, Fragment.fromArray(afterItems)));
              }

              // Replace the entire list with [beforeList?, paragraph, afterList?]
              tr.replaceWith(listStart, listEnd, Fragment.fromArray(nodes));
              // Caret into the new paragraph
              const paraPos = listStart + (nodes[0] && nodes[0].type === listNode.type ? nodes[0].nodeSize : 0) + 1;
              tr.setSelection(TextSelection.create(tr.doc, Math.min(paraPos, tr.doc.content.size)));
              if (dispatch) dispatch(tr);
              return true;
            });
          },
        };
      },
    }),
  ];

  // Combine and dedupe by extension.name (keep first occurrence)
  const allExtensionsRaw: AnyExtension[] = [...baseExtensions, ...extraExtensions];
  const extSeen = new Set<string>();
  const extensions: AnyExtension[] = allExtensionsRaw.filter((ext: any) => {
    const n: string | undefined = ext?.name;
    if (!n) return true;
    if (extSeen.has(n)) return false;
    extSeen.add(n);
    return true;
  });

  const editor = useEditor({
    extensions,
    content: isMounted ? content : '',
    // Explicitly disable immediate render to avoid SSR hydration mismatches (Tiptap requirement)
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: `${className} min-h-[200px]`,
        'data-editor-root': 'true',
        spellcheck: spellcheck !== false ? 'true' : 'false',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        autocorrect: spellcheck !== false ? 'on' : 'off',
        autocapitalize: spellcheck !== false ? 'sentences' : 'off',
        lang: lang || ((typeof navigator !== 'undefined' && typeof navigator.language === 'string')
          ? (navigator.language.startsWith('en') ? 'en-US' : navigator.language)
          : 'en-US'),
        ...(config?.editorProps?.attributes || {}),
      },
      ...(() => {
        const ep = { ...(config?.editorProps || {}) } as Record<string, unknown>;
        if (ep && 'attributes' in ep) delete (ep as { attributes?: unknown }).attributes;
        return ep;
      })(),
      handlePaste: (view, event) => {
        try {
          const e = event as ClipboardEvent;

          // Check for image files in clipboard first
          if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
            const files = Array.from(e.clipboardData.files);
            const imageFiles = files.filter(f => f.type.startsWith('image/'));

            if (imageFiles.length > 0) {
              e.preventDefault();
              e.stopPropagation();

              // Dispatch custom event to trigger upload from outside this scope
              const customEvent = new CustomEvent('editor-paste-images', {
                detail: { files: imageFiles }
              });
              document.dispatchEvent(customEvent);
              return true;
            }
          }

          let text = e.clipboardData?.getData('text/plain')?.trim() || '';
          // If not a direct URL, try to extract href from HTML clipboard (e.g., pasting from browsers)
          if ((!text || !/^https?:\/\//i.test(text)) && e.clipboardData) {
            const html = e.clipboardData.getData('text/html');
            if (html) {
              try {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const a = doc.querySelector('a[href]') as HTMLAnchorElement | null;
                if (a && a.href) text = a.href.trim();
              } catch { }
            }
          }
          if (!text || !/^https?:\/\/.+$/i.test(text) || /\s/.test(text)) return false;
          // Parse YouTube/Shorts URL -> id + optional start
          let id: string | null = null; let start: number | null = null;
          try {
            const u = new URL(text);
            const host = u.hostname.replace(/^www\./, '');
            if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
              id = u.searchParams.get('v');
              if (!id) {
                const m = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
                if (m) id = m[1];
              }
            } else if (host === 'youtu.be') {
              const m = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/);
              if (m) id = m[1];
            }
            const t = u.searchParams.get('t') || u.searchParams.get('start');
            if (t) {
              if (/^\d+$/.test(t)) start = parseInt(t, 10);
              else {
                const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
                if (m) {
                  const h = m[1] ? parseInt(m[1], 10) : 0;
                  const min = m[2] ? parseInt(m[2], 10) : 0;
                  const s = m[3] ? parseInt(m[3], 10) : 0;
                  start = h * 3600 + min * 60 + s;
                }
              }
            }
          } catch { }
          if (!id) return false;
          // Don't embed inside code blocks
          try {
            const sel = view.state.selection as Selection & { $from: any };
            let d = sel.$from.depth; while (d >= 0) { const nd = sel.$from.node(d); if (nd?.type?.name === 'codeBlock') return false; d--; }
          } catch { }
          e.preventDefault(); e.stopPropagation();
          const type = view.state.schema.nodes['youtube'];
          if (!type) return false;
          const node = type.create({ videoId: id, start });
          const tr = view.state.tr.replaceSelectionWith(node).scrollIntoView();
          view.dispatch(tr);
          return true;
        } catch { return false; }
      },
      handleKeyDown: (view, event) => {
        try {
          const key = (event as KeyboardEvent).key;
          // Don't let '/' cause IME issues or accidental browser find; let our selectionUpdate logic handle the menu
          if (key === '/') {
            // Defer to selectionUpdate effect; do not preventDefault so typing works
            return false;
          }
          // Press Space on an empty line -> open AI prompt at caret instead of inserting a space
          if (key === ' ' || (event as KeyboardEvent).code === 'Space') {
            const state = view.state;
            const sel = state.selection as Selection & { $from: any };
            if (!sel.empty) return false;
            const $from = sel.$from;
            // Don't trigger inside code blocks
            let d = $from.depth;
            let inCode = false;
            while (d >= 0) {
              const nd = $from.node(d);
              if (nd && nd.type && nd.type.name === 'codeBlock') { inCode = true; break; }
              d--;
            }
            if (inCode) return false;
            const before = $from.parent?.textBetween(0, $from.parentOffset, '\n', '\ufffc') || '';
            const after = $from.parent?.textBetween($from.parentOffset, $from.parent.content.size, '\n', '\ufffc') || '';
            const blockEmpty = before.trim().length === 0 && after.trim().length === 0;
            if (!blockEmpty) return false;
            // Open AI prompt near caret and prevent inserting a space
            event.preventDefault();
            event.stopPropagation();
            try {
              const coords = (view as any).coordsAtPos(state.selection.from);
              const rootRect = containerRef.current?.getBoundingClientRect();
              if (rootRect && coords && Number.isFinite((coords as any).left) && Number.isFinite((coords as any).bottom)) {
                setAiPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 12 });
              }
            } catch { }
            setAiOpen(true);
            setAiPrompt('');
            try { aiInsertPosRef.current = view.state.selection.to; } catch { aiInsertPosRef.current = null; }
            return true;
          }
          if (key !== 'Backspace') return false;
          const state = view.state;
          const sel = state.selection as Selection & { $from: any };
          if (!sel.empty) return false;
          const $from = sel.$from;
          const parent = $from.parent;
          if (!parent || !parent.isTextblock) return false;
          if (parent.content.size !== 0) return false; // not an empty paragraph
          // Find the nearest list item (bullet/ordered/task)
          let itemDepth: number | null = null;
          for (let d = $from.depth; d > 0; d--) {
            const nm = $from.node(d)?.type?.name;
            if (nm === 'listItem' || nm === 'taskItem') { itemDepth = d; break; }
          }
          if (!itemDepth) return false;
          const listDepth = itemDepth - 1;
          if (listDepth < 0) return false;
          const listNode = $from.node(listDepth);
          const listStart = $from.before(listDepth);
          const listEnd = $from.after(listDepth);
          const itemIndex = $from.index(listDepth);
          if (!listNode || typeof itemIndex !== 'number') return false;

          const tr = state.tr;
          const para = state.schema.nodes.paragraph.createAndFill();
          if (!para) return false;
          const beforeItems: any[] = [];
          for (let i = 0; i < itemIndex; i++) beforeItems.push(listNode.child(i));
          const afterItems: any[] = [];
          for (let i = itemIndex + 1; i < listNode.childCount; i++) afterItems.push(listNode.child(i));

          const nodes: any[] = [];
          if (beforeItems.length > 0) nodes.push(listNode.type.create(listNode.attrs, Fragment.fromArray(beforeItems)));
          nodes.push(para);
          if (afterItems.length > 0) nodes.push(listNode.type.create(listNode.attrs, Fragment.fromArray(afterItems)));

          tr.replaceWith(listStart, listEnd, Fragment.fromArray(nodes));
          // Caret into newly inserted paragraph
          const paraPos = listStart + (nodes[0] && nodes[0].type === listNode.type ? nodes[0].nodeSize : 0) + 1;
          tr.setSelection(TextSelection.create(tr.doc, Math.min(paraPos, tr.doc.content.size)));
          view.dispatch(tr);
          event.preventDefault();
          event.stopPropagation();
          return true;
        } catch {
          return false;
        }
      },
    },
    onUpdate: useCallback(({ editor: editorInstance }: { editor: TiptapEditor; transaction?: any }) => {
      // Ignore updates while not editable (view-only)
      if (!editorInstance.isEditable) return;
      // Ignore synthetic updates triggered while the slash menu is open to avoid save churn
      try { if (slashOpenRef.current) return; } catch { }

      if (!onUpdate) return;

      const currentHtml = editorInstance.getHTML();
      if (lastContentRef.current === currentHtml) return;

      dirtySinceProp.current = true;
      lastContentRef.current = currentHtml;
      // Schedule on next frame to avoid layout thrash, but no debounce delay
      requestAnimationFrame(() => {
        onUpdate(currentHtml);
      });
    }, [onUpdate]),
  });
  useEffect(() => {
    return () => {
      // Clear any pending update timeouts
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }
    };
  }, []);

  // If TipTap doesn't initialize within 1500ms, show a simple fallback instead of hanging
  useEffect(() => {
    if (editor) return;
    const t = setTimeout(() => { if (!editor) setFallbackMode(true); }, 1500);
    return () => clearTimeout(t);
  }, [editor]);

  // Prevent overlapping/rapid refreshes that can cause flicker or leave editor disabled
  const refreshInFlight = useRef(false);
  const lastRefreshAt = useRef(0);
  // After a content switch, we re-arm spellcheck on first real focus
  const needsFocusRefresh = useRef(false);
  // Track slash menu open state across stable callbacks (avoid stale closures)
  const slashOpenRef = useRef(false);
  // Track update timeout for debouncing
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastContentRef = useRef<string>('');

  // Keep TipTap's editability in sync with the view-only flag
  useEffect(() => {
    if (!editor) return;
    const desired = config?.editable ?? true;
    if (editor.isEditable !== desired) {
      editor.setEditable(desired);
    }
    // When switching to view-only, close any open UI surfaces
    if (!desired) {
      setBubblePos(null);
      setShowBlockMenu(false);
      setShowColorMenu(false);
      setShowSizeMenu(false);
      setSlashOpen(false);
    }
  }, [editor, config?.editable]);

  // Helper: find nearest scrollable ancestor
  const getScrollableAncestor = (el: HTMLElement): HTMLElement | null => {
    let node: HTMLElement | null = el;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      const canScroll = /(auto|scroll)/.test(style.overflowY || '') || /(auto|scroll)/.test(style.overflow || '');
      if (canScroll && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return null;
  };

  const { user } = useAuth();

  // Handle page link clicks with ownership verification
  useEffect(() => {
    const handlePageLinkClick = async (pageId: string) => {
      if (!gotoPageFromCtx) return;

      try {
        // Verify user is authenticated
        if (!user) {
          console.error('User not authenticated');
          return;
        }

        // Call the navigation function which includes ownership verification
        await gotoPageFromCtx(pageId);

        // Scroll to top of the editor after navigation
        const editorElement = editor?.view.dom.closest('.editor-container');
        if (editorElement) {
          editorElement.scrollTop = 0;
        }
      } catch (error) {
        console.error('Error navigating to page:', error);
      }
    };

    // Set up global handler for programmatic page link clicks
    // @ts-ignore
    window.__handlePageLinkClick = handlePageLinkClick;

    // Handle regular anchor clicks for page links
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href^="#page:"]') as HTMLAnchorElement;
      if (link) {
        e.preventDefault();
        const pageId = link.getAttribute('href')?.replace('#page:', '');
        if (pageId) {
          handlePageLinkClick(pageId);
        }
      }
    };

    document.addEventListener('click', handleAnchorClick);

    return () => {
      // @ts-ignore
      delete window.__handlePageLinkClick;
      document.removeEventListener('click', handleAnchorClick);
    };
  }, [gotoPageFromCtx, user, editor]);

  // Programmatically trigger the browser to re-run spellcheck
  const refreshSpellcheck = useCallback((ensureFocus = false) => {
    if (!editor) return;
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    if (!root) return;
    const now = Date.now();
    if (refreshInFlight.current || now - lastRefreshAt.current < 120) return;
    refreshInFlight.current = true;

    // Snapshot selection/focus
    const { from, to } = editor.state.selection as Selection;
    const hadFocus = editor.isFocused;
    const scrollEl = getScrollableAncestor(root);
    const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

    // Desired spellcheck state from prop
    const shouldSpellcheck = spellcheck !== false;
    const desired = shouldSpellcheck ? 'true' : 'false';
    const flip = desired === 'true' ? 'false' : 'true';
    // Remember whether editor was editable (view-only should remain off)
    const prevEditable = editor.isEditable;

    // Step 1: flip to the opposite once and briefly disable editability
    try { (root as HTMLElement).blur(); } catch { }
    editor.setEditable(false);

    // Apply flipped attributes to force browser re-evaluation
    root.setAttribute('spellcheck', flip);
    root.setAttribute('data-gramm', 'false');
    root.setAttribute('data-gramm_editor', 'false');
    root.setAttribute('data-enable-grammarly', 'false');
    root.setAttribute('contenteditable', 'true');
    root.setAttribute('autocorrect', shouldSpellcheck ? 'on' : 'off');
    root.setAttribute('autocapitalize', shouldSpellcheck ? 'sentences' : 'off');
    const prevLang = root.getAttribute('lang') || 'en-US';
    root.setAttribute('lang', prevLang === 'en-US' ? 'en' : 'en-US');

    // Next frame: restore desired attributes and re-enable editing
    requestAnimationFrame(() => {
      root.setAttribute('spellcheck', desired);
      root.setAttribute('lang', prevLang);
      editor.setEditable(prevEditable);
      // Reflect final editability in the DOM attribute as well
      root.setAttribute('contenteditable', prevEditable ? 'true' : 'false');

      // Next frame: restore selection/focus/scroll and poke input
      requestAnimationFrame(() => {
        try {
          editor.chain().setTextSelection({ from, to }).run();
          if (hadFocus || ensureFocus) {
            try {
              (root as HTMLElement).focus({ preventScroll: true });
            } catch {
              editor.commands.focus();
            }
          }
        } catch { /* no-op */ }
        try { root.dispatchEvent(new Event('input', { bubbles: true })); } catch { }
        if (scrollEl) {
          scrollEl.scrollTop = scrollTop;
          scrollEl.scrollLeft = scrollLeft;
        }
        refreshInFlight.current = false;
        lastRefreshAt.current = Date.now();
      });
    });
  }, [editor, spellcheck]);

  // Helper to safely set editor content
  const normalizeIncomingHTML = useCallback((raw: string) => {
    if (!raw) return raw;
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      let changed = false;
      const anchors = Array.from(doc.querySelectorAll('a')) as HTMLAnchorElement[];
      for (const a of anchors) {
        if (a.closest('span[data-file-link], span[data-page-link]')) continue;
        const href = a.getAttribute('href') || '';
        const text = (a.textContent || '').trim() || 'Untitled';
        const isFileProxy = /\/api\/files\/(view|download|preview)\//.test(href);
        const looksLikeFile = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|md|csv|png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(href);
        if (isFileProxy || looksLikeFile) {
          const span = doc.createElement('span');
          span.setAttribute('data-file-link', 'true');
          span.setAttribute('data-href', href);
          span.setAttribute('data-name', text);
          span.setAttribute('data-target', '_blank');
          span.setAttribute('style', 'display:inline-flex;align-items:center;gap:6px;');
          // icon is provided by node render, we only need attributes for parsing
          const link = doc.createElement('a');
          link.setAttribute('href', href || '#');
          link.setAttribute('target', '_blank');
          link.setAttribute('rel', 'noopener noreferrer');
          link.textContent = text;
          span.appendChild(link);
          a.replaceWith(span);
          changed = true;
          continue;
        }
        if (href.startsWith('#page:')) {
          const pageId = href.slice('#page:'.length);
          const span = doc.createElement('span');
          span.setAttribute('data-page-link', 'true');
          span.setAttribute('data-page-id', pageId);
          span.setAttribute('data-name', text);
          span.setAttribute('style', 'display:inline-flex;align-items:center;gap:6px;');
          const link = doc.createElement('a');
          link.setAttribute('href', href);
          link.setAttribute('data-page-id', pageId);
          link.setAttribute('title', `page:${pageId}`);
          link.textContent = text;
          span.appendChild(link);
          a.replaceWith(span);
          changed = true;
        }
      }
      return changed ? doc.body.innerHTML : raw;
    } catch {
      return raw;
    }
  }, []);

  const applyContentFromProps = useCallback((html: string) => {
    if (!editor) return;
    try {
      const normalized = normalizeIncomingHTML(html || '');
      editor.commands.setContent(normalized, { emitUpdate: false });
    } catch {
      // If bad HTML crashes setContent, drop to plain text paragraph
      try {
        editor.commands.setContent(`<p>${(html || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`, { emitUpdate: false });
      } catch { }
    }
    // Reset dirty flag only when content comes from props
    dirtySinceProp.current = false;
    // After content switch, nudge spellcheck once if enabled
    if (spellcheck !== false) {
      // Mark that we should refresh again on first user focus to arm native checker
      needsFocusRefresh.current = true;
      requestAnimationFrame(() => refreshSpellcheck(false));
    }
  }, [editor, refreshSpellcheck, spellcheck, normalizeIncomingHTML]);

  // One-time legacy migration: convert existing plain anchors to persisted nodes so icons persist without runtime scanning
  const legacyMigratedRef = useRef(false);
  const scheduleLegacyMigrationOnce = useCallback(() => {
    if (legacyMigratedRef.current || !editor) return;
    legacyMigratedRef.current = true;
    setTimeout(() => {
      try {
        const html = editor.getHTML();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        let changed = false;
        const anchors = Array.from(doc.querySelectorAll('a')) as HTMLAnchorElement[];
        for (const a of anchors) {
          if (a.closest('span[data-file-link], span[data-page-link]')) continue;
          const href = a.getAttribute('href') || '';
          const text = (a.textContent || '').trim() || 'Untitled';
          // File link?
          const isProxy = /\/api\/files\/(view|download|preview)\//.test(href);
          const looksLikeFile = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|md|csv|png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(href);
          if (isProxy || looksLikeFile) {
            const span = doc.createElement('span');
            span.setAttribute('data-file-link', 'true');
            span.setAttribute('data-href', href);
            span.setAttribute('data-name', text);
            span.setAttribute('data-target', '_blank');
            span.setAttribute('style', 'display:inline-flex;align-items:center;gap:6px;');
            span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:inline-flex;line-height:0;"><path d=\"M14 2H6a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 3.5L18.5 8H14V3.5z\"/></svg>`;
            const link = doc.createElement('a');
            link.setAttribute('href', href || '#');
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            link.textContent = text;
            span.appendChild(link);
            a.replaceWith(span);
            changed = true;
            continue;
          }
          // Page link?
          if (href.startsWith('#page:')) {
            const pageId = href.slice('#page:'.length);
            const span = doc.createElement('span');
            span.setAttribute('data-page-link', 'true');
            span.setAttribute('data-page-id', pageId);
            span.setAttribute('data-name', text || 'Untitled');
            span.setAttribute('style', 'display:inline-flex;align-items:center;gap:6px;');
            span.innerHTML = `<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" style=\"display:inline-flex;line-height:0;\"><path d=\"M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM8 11h8v1.5H8V11zm0 3h8v1.5H8V14zm0 3h5v1.5H8V17z\"/></svg>`;
            const link = doc.createElement('a');
            link.setAttribute('href', href);
            link.setAttribute('data-page-id', pageId);
            link.setAttribute('title', `page:${pageId}`);
            link.textContent = text || 'Untitled';
            span.appendChild(link);
            a.replaceWith(span);
            changed = true;
          }
        }
        if (changed) {
          const htmlNew = doc.body.innerHTML;
          editor.commands.setContent(htmlNew, { emitUpdate: true });
        }
      } catch { }
    }, 0);
  }, [editor]);

  // Replace content only when resetKey changes (e.g., switching page)
  useEffect(() => {
    if (!editor || !isMounted) return;

    // First-time initialization after mount: apply current props
    if (lastAppliedResetKeyRef.current === undefined) {
      applyContentFromProps(content || '');
      lastAppliedResetKeyRef.current = resetKey;
      return;
    }

    // No actual reset change
    if (resetKey === lastAppliedResetKeyRef.current) return;

    // If user is actively editing or editor is focused, defer applying remote content
    if (editor.isFocused || dirtySinceProp.current) {
      pendingApplyRef.current = { resetKey, content: content || '' };
      return;
    }

    // Safe to apply immediately (likely a real page switch)
    applyContentFromProps(content || '');
    lastAppliedResetKeyRef.current = resetKey;
  }, [resetKey, editor, isMounted, content, applyContentFromProps]);

  // When the editor loses focus, if we had a pending remote apply, do it now
  useEffect(() => {
    if (!editor) return;
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    if (!root) return;
    const onBlur = () => {
      const pending = pendingApplyRef.current;
      if (!pending) return;
      // If user has edited since queuing the pending apply, discard it to avoid clobbering
      if (dirtySinceProp.current) {
        pendingApplyRef.current = null;
        return;
      }
      applyContentFromProps(pending.content || '');
      lastAppliedResetKeyRef.current = pending.resetKey;
      pendingApplyRef.current = null;
    };
    root.addEventListener('blur', onBlur, true);
    return () => {
      root.removeEventListener('blur', onBlur, true);
    };
  }, [editor, applyContentFromProps]);

  // Apply spellcheck/lang changes immediately to the editor root and options
  useEffect(() => {
    if (!editor) return;
    const ep = (editor.options.editorProps ?? {}) as { attributes?: Record<string, string> };
    const attrs = (ep.attributes ?? {}) as Record<string, string>;
    const nextAttrs = {
      ...attrs,
      spellcheck: spellcheck === undefined ? (attrs.spellcheck ?? 'true') : (spellcheck ? 'true' : 'false'),
      autocorrect: spellcheck === false ? 'off' : 'on',
      autocapitalize: spellcheck === false ? 'off' : 'sentences',
      lang: lang || attrs.lang || ((typeof navigator !== 'undefined' && typeof navigator.language === 'string') ? (navigator.language.startsWith('en') ? 'en-US' : navigator.language) : 'en-US'),
    };
    editor.setOptions({
      editorProps: {
        ...(editor.options.editorProps || {}),
        attributes: nextAttrs,
      },
    });
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    if (root) {
      // Snapshot current selection and nearest scrollable ancestor
      const { from, to } = editor.state.selection as Selection;
      const hadFocus = editor.isFocused;

      const scrollEl = getScrollableAncestor(root);
      const scrollTop = scrollEl ? scrollEl.scrollTop : 0;
      const scrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

      // Update attributes on the contenteditable root
      const prevSpell = root.getAttribute('spellcheck');
      const prevAutoCorr = root.getAttribute('autocorrect');
      const prevAutoCap = root.getAttribute('autocapitalize');
      const prevLang = root.getAttribute('lang');

      if (prevSpell !== nextAttrs.spellcheck) {
        root.setAttribute('spellcheck', nextAttrs.spellcheck);
        (root as unknown as { spellcheck: boolean }).spellcheck = nextAttrs.spellcheck === 'true';
      }
      if (prevAutoCorr !== nextAttrs.autocorrect) root.setAttribute('autocorrect', nextAttrs.autocorrect);
      if (prevAutoCap !== nextAttrs.autocapitalize) root.setAttribute('autocapitalize', nextAttrs.autocapitalize);
      if (prevLang !== nextAttrs.lang) root.setAttribute('lang', nextAttrs.lang);
      root.setAttribute('data-gramm', 'false');
      root.setAttribute('data-lt-active', 'false');

      // Refresh only if something actually changed
      if (
        prevSpell !== nextAttrs.spellcheck ||
        prevAutoCorr !== nextAttrs.autocorrect ||
        prevAutoCap !== nextAttrs.autocapitalize ||
        prevLang !== nextAttrs.lang
      ) {
        refreshSpellcheck(false);
      }
    }
  }, [editor, spellcheck, lang, refreshSpellcheck]);
  // Minimal triggers only (no focus/visibility listeners to avoid flicker)

  // On first real focus after navigation/content switch, re-arm spellcheck once without scrolling
  useEffect(() => {
    if (!editor) return;
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    if (!root) return;

    const onFocus = () => {
      if (!needsFocusRefresh.current) return;
      needsFocusRefresh.current = false;
      // Run on next frame to ensure caret exists
      requestAnimationFrame(() => refreshSpellcheck(false));
    };

    // Capture to catch focus events from nested nodes
    root.addEventListener('focus', onFocus, true);
    return () => {
      root.removeEventListener('focus', onFocus, true);
    };
  }, [editor, refreshSpellcheck]);

  // Expose editor methods via ref
  useImperativeHandle(ref, () => editor as TiptapEditor);

  // Call onEditorReady when editor is ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor);
      // Arm spellcheck on initial ready if enabled
      if (spellcheck !== false) {
        requestAnimationFrame(() => refreshSpellcheck(false));
      }
    }
  }, [editor, onEditorReady, refreshSpellcheck, spellcheck]);

  const updateTableHandles = useCallback(() => {
    if (!editor || !containerRef.current) {
      setTableHandles(null);
      return;
    }
    const { state, view } = editor;
    let node: Node | null = null;
    try {
      const domAtPos = view.domAtPos(Math.max(0, state.selection.from));
      node = domAtPos.node;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
    } catch {
      node = null;
    }
    let cellEl: HTMLElement | null = node instanceof HTMLElement ? node : null;
    while (cellEl && cellEl !== containerRef.current && !(cellEl instanceof HTMLTableCellElement)) {
      cellEl = cellEl.parentElement;
    }
    if (!cellEl || !(cellEl instanceof HTMLTableCellElement)) {
      setTableHandles(null);
      return;
    }
    const tableEl = cellEl.closest('table');
    if (!tableEl) {
      setTableHandles(null);
      return;
    }
    const rootRect = containerRef.current.getBoundingClientRect();
    const tableRect = tableEl.getBoundingClientRect();
    setTableHandles({
      rect: {
        left: tableRect.left - rootRect.left,
        top: tableRect.top - rootRect.top,
        width: tableRect.width,
        height: tableRect.height,
      },
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const update = () => updateTableHandles();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    window.addEventListener('resize', update);
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      window.removeEventListener('resize', update);
    };
  }, [editor, updateTableHandles]);

  // Local UI state for custom menus (must be declared unconditionally)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
  const [tableHandles, setTableHandles] = useState<TableHandleState | null>(null);
  const [draggingSelection, setDraggingSelection] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [sizeInput, setSizeInput] = useState<string>('');
  const [fontQuery, setFontQuery] = useState('');
  const fontSearchRef = useRef<HTMLInputElement | null>(null);
  // Preserve current selection when interacting with toolbar menus so it doesn't collapse
  const preservedSelectionRef = useRef<{ from: number; to: number } | null>(null);
  // AI caret features menus
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showToneMenu, setShowToneMenu] = useState(false);
  const aiMenuAnchorRef = useRef<HTMLDivElement | null>(null);
  // Slash command menu state
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null);
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null);
  const slashRef = useRef<HTMLDivElement | null>(null);

  // Keep a ref mirror for use inside stable callbacks (e.g., onUpdate)
  useEffect(() => {
    try { slashOpenRef.current = slashOpen; } catch { }
  }, [slashOpen]);

  // Link Page popover state
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkIndex, setLinkIndex] = useState(0);
  const [linkPos, setLinkPos] = useState<{ left: number; top: number } | null>(null);
  const linkRef = useRef<HTMLDivElement | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkBusyItemId, setLinkBusyItemId] = useState<string | null>(null);
  const [linkCreatingName, setLinkCreatingName] = useState<string | null>(null);

  const normalizedQuery = (linkQuery || '').trim().toLowerCase();
  // Exclude current page and its ancestors from page suggestions
  const [excludePageIds, setExcludePageIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const s = new Set<string>();
    try {
      if (selectedPageFromCtx) {
        const pagesMap = new Map<string, { parentPageId?: string | null }>();
        (Array.isArray(pagesFromCtx) ? pagesFromCtx : []).forEach((p: any) => {
          pagesMap.set(p?.id, p || {});
        });
        let cur: string | null = selectedPageFromCtx;
        let hop = 0;
        while (cur && !s.has(cur) && hop < 50) {
          s.add(cur);
          // const parent = pagesMap.get(cur)?.parentPageId ?? null;
          const parent: string | null | undefined = pagesMap.get(cur)?.parentPageId;

          cur = parent ?? null;
          hop++;
        }
      }
    } catch { }
    setExcludePageIds(s);
  }, [selectedPageFromCtx, pagesFromCtx]);
  // Debounced query to prevent flickering while typing
  const [debouncedQuery, setDebouncedQuery] = useState(normalizedQuery);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, 150); // 150ms debounce delay
    return () => clearTimeout(timer);
  }, [normalizedQuery]);

  const { filteredLinkPages, ancestorNameConflict } = useMemo(() => {
    try {
      const base = (Array.isArray(pagesFromCtx) ? pagesFromCtx : []).filter((p: any) => {
        if (!p) return false;
        if (excludePageIds.has(p.id)) return false;
        return true;
      });

      const ancestorNames = new Set<string>();
      (Array.isArray(pagesFromCtx) ? pagesFromCtx : []).forEach((p: any) => {
        if (!p) return;
        if (!excludePageIds.has(p.id)) return;
        const name = (p.name || '').trim();
        if (name) ancestorNames.add(name.toLowerCase());
      });

      const normalizedInput = (linkQuery || '').trim().toLowerCase();
      const ancestorNameConflict = normalizedInput.length > 0 && ancestorNames.has(normalizedInput);
      if (ancestorNameConflict) {
        return { filteredLinkPages: [], ancestorNameConflict: true };
      }

      if (!debouncedQuery) {
        return { filteredLinkPages: base.slice(0, 20), ancestorNameConflict: false };
      }

      const list = base
        .filter((p: any) => (p?.name || '').toLowerCase().includes(debouncedQuery))
        .slice(0, 20);
      return { filteredLinkPages: list, ancestorNameConflict: false };
    } catch (error) {
      console.error('Error filtering link pages:', error);
      return { filteredLinkPages: [], ancestorNameConflict: false };
    }
  }, [pagesFromCtx, debouncedQuery, excludePageIds, linkQuery]);

  const canCreateLink = useMemo(() => {
    const name = (linkQuery || '').trim();
    if (!name || ancestorNameConflict) return false;
    return !filteredLinkPages.some(p => (p?.name || '').trim().toLowerCase() === name.toLowerCase());
  }, [linkQuery, filteredLinkPages, ancestorNameConflict]);

  const insertPageLinkAtCaret = useCallback((pageId: string, label: string) => {
    if (!editor) return;
    const name = label || 'Untitled';
    try {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'pageLink', attrs: { pageId, name } })
        .run();
    } catch { }
  }, [editor]);

  const handlePickLinkItem = useCallback(async () => {
    try {
      const idx = linkIndex;
      if (idx < filteredLinkPages.length) {
        const p = filteredLinkPages[idx];
        setLinkBusy(true);
        setLinkBusyItemId(p.id);

        // Insert the link immediately for better UX
        insertPageLinkAtCaret(p.id, p.name || 'Untitled');
        setLinkOpen(false);

        // Update parent relationship in the background without blocking
        if (setPageParentFromCtx && selectedPageFromCtx && selectedPageFromCtx !== p.id) {
          // Don't await - let it happen in the background
          setPageParentFromCtx(p.id, selectedPageFromCtx)
            .catch(error => console.error('Failed to update parent relationship:', error));
        }
        return;
      }
      // Create new
      if (canCreateLink && createPageFromCtx) {
        const name = (linkQuery || '').trim();
        if (!name) return;

        setLinkBusy(true);
        setLinkCreatingName(name);

        try {
          // Create the page first, then insert the link with the real ID
          const newId = await createPageFromCtx(name, selectedPageFromCtx || undefined);

          if (newId) {
            // Insert the link with the real page ID
            insertPageLinkAtCaret(newId, name);
          } else {
            console.error('Page creation returned no ID');
          }
        } catch (error) {

        }
      }
    } finally {
      setLinkBusy(false);
      setLinkCreatingName(null);
      setLinkBusyItemId(null);
      setLinkOpen(false);
    }
  }, [linkIndex, filteredLinkPages, canCreateLink, linkQuery, createPageFromCtx, insertPageLinkAtCaret]);

  // Close link popover on outside clicks
  useEffect(() => {
    if (!linkOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (linkRef.current && linkRef.current.contains(t)) return;
      if (slashRef.current && slashRef.current.contains(t)) return;
      setLinkOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [linkOpen]);
  // Inline AI prompt controls
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [aiPos, setAiPos] = useState<{ top: number; left: number } | null>(null);
  const aiRef = useRef<HTMLDivElement | null>(null);
  const aiInputRef = useRef<HTMLInputElement | null>(null);
  // Inline AI error (displayed under the Thinking/Generating bar instead of alerts)
  const [aiError, setAiError] = useState<string>('');
  // Inline file/page attachment menu (3-dots on hover)
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [fileMenuPos, setFileMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [fileMenuTarget, setFileMenuTarget] = useState<{ id: string; type: 'image' | 'file' | 'page'; name?: string } | null>(null);
  const fileMenuElRef = useRef<HTMLElement | null>(null);
  const [fileMenuDropdownOpen, setFileMenuDropdownOpen] = useState(false);
  const [fileDeleteLoading, setFileDeleteLoading] = useState(false);
  // Page link menu state
  const [pageLinkMenuOpen, setPageLinkMenuOpen] = useState(false);
  const [pageLinkMenuPos, setPageLinkMenuPos] = useState<{ left: number; top: number } | null>(null);
  const [pageLinkMenuTarget, setPageLinkMenuTarget] = useState<{ id: string; name?: string } | null>(null);
  const [pageLinkMenuDropdownOpen, setPageLinkMenuDropdownOpen] = useState(false);
  // Suppress hover-based file menu briefly after page switches to avoid opening on load
  const hoverSuppressUntilRef = useRef<number>(0);
  useEffect(() => {
    // When resetKey changes (page change), suppress for 800ms and force close
    hoverSuppressUntilRef.current = Date.now() + 800;
    setFileMenuOpen(false);
    setFileMenuDropdownOpen(false);
    setFileMenuTarget(null);
    setFileDeleteLoading(false);
  }, [resetKey]);
  // (Removed) File size metadata cache — no longer used; sizes are not shown anymore
  // Inline file upload at caret UI/state
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInsertPosRef = useRef<number | null>(null);
  const [uploadPos, setUploadPos] = useState<{ top: number; left: number } | null>(null);
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'preparing' | 'uploading' | 'done' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string>('');
  // Smooth fake progress animation for inline uploads
  const uploadRafRef = useRef<number | null>(null);
  const uploadStartRef = useRef<number | null>(null);
  const uploadDurationRef = useRef<number>(10000);
  const uploadAnimActiveRef = useRef<boolean>(false);
  const stopUploadAnim = useCallback(() => {
    uploadAnimActiveRef.current = false;
    if (uploadRafRef.current) cancelAnimationFrame(uploadRafRef.current);
    uploadRafRef.current = null;
    uploadStartRef.current = null;
  }, []);
  const startUploadAnim = useCallback((fileSizeBytes: number) => {
    // Duration scales with size: ~0.8s/MB, clamped 8s..45s
    const sizeMB = Math.max(1, fileSizeBytes / (1024 * 1024));
    uploadDurationRef.current = Math.min(45000, Math.max(8000, Math.round(sizeMB * 800)));
    uploadStartRef.current = null;
    uploadAnimActiveRef.current = true;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      if (uploadStartRef.current === null) uploadStartRef.current = now;
      const elapsed = now - (uploadStartRef.current || now);
      const t = Math.min(1, elapsed / uploadDurationRef.current);
      const eased = easeOutCubic(t);
      const target = 1 + eased * 98; // 1 -> 99
      setUploadProgress((prev) => Math.min(99, Math.max(prev, Math.round(target))));
      if (uploadAnimActiveRef.current && target < 99) {
        uploadRafRef.current = requestAnimationFrame(tick);
      }
    };
    uploadRafRef.current = requestAnimationFrame(tick);
  }, []);
  // Anchor where generated text should be inserted sequentially
  const aiInsertPosRef = useRef<number | null>(null);
  // Track current generation session for post-processing and confirmation
  const aiBufferRef = useRef<string>('');
  // Progressive rendering using a tracked range [start,end]
  const aiStartPosRef = useRef<number | null>(null);
  const aiEndPosRef = useRef<number | null>(null);
  const aiFirstChunkRef = useRef(false);
  const [aiHasFirstChunk, setAiHasFirstChunk] = useState(false);
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const [aiConfirmPos, setAiConfirmPos] = useState<{ top: number; left: number } | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  // Track if the last AI run failed before any content streamed, to keep the bar open and show error
  const aiFailedRef = useRef<boolean>(false);
  // Guard against state updates after unmount (e.g., slow uploads resolving late)
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // If set, runAIInline will treat the next generation as a rewrite of this selection
  const aiEditSelectionRef = useRef<{ from: number; to: number; text: string } | null>(null);
  // Explain side-popover state
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPos, setExplainPos] = useState<{ top: number; left: number } | null>(null);
  const [explainText, setExplainText] = useState('');
  const [explainRunning, setExplainRunning] = useState(false);
  const explainAbortRef = useRef<AbortController | null>(null);
  const explainHtml = React.useMemo(() => {
    if (!explainText) return '';
    try {
      return (marked.parse(explainText, { breaks: true, gfm: true }) as string) || '';
    } catch {
      return '';
    }
  }, [explainText]);
  // Session mode and original selection snapshot for Discard behavior
  const aiSessionModeRef = useRef<'insert' | 'replace'>('insert');
  const originalSelectionHTMLRef = useRef<string | null>(null);
  // Inline loader for transform actions (longer/shorter/tone)
  const [inlineLoaderOpen, setInlineLoaderOpen] = useState(false);
  const [inlineLoaderPos, setInlineLoaderPos] = useState<{ left: number; top: number } | null>(null);
  // Scroll the current end position into view to keep generation visible
  const scrollEndIntoView = useCallback(() => {
    if (!editor) return;
    try {
      const end = aiEndPosRef.current;
      if (typeof end !== 'number') return;
      let coords: any = null; try { coords = editor.view.coordsAtPos(Math.max(1, Math.min(end, editor.state.doc.content.size))); } catch { }
      const scrollEl = containerRef.current ? getScrollableAncestor(containerRef.current) : null;
      // Keep a 25% viewport spacer below the generated content while generating
      const bottomGapRatio = 0.25;
      if (scrollEl) {
        const pRect = scrollEl.getBoundingClientRect();
        const targetBottom = pRect.top + pRect.height * (1 - bottomGapRatio); // 75% down inside the scrollable area
        if (coords.bottom > targetBottom) {
          scrollEl.scrollTop += (coords.bottom - targetBottom);
        }
      } else {
        const vh = window.innerHeight;
        const targetBottom = vh * (1 - bottomGapRatio); // 75% down the window
        if (coords.bottom > targetBottom) {
          window.scrollBy({ top: coords.bottom - targetBottom, behavior: 'auto' });
        }
      }
    } catch { /* ignore */ }
  }, [editor, getScrollableAncestor]);
  const stopAIInline = useCallback(() => {
    // Abort the stream and immediately hide the bar
    try { aiAbortRef.current?.abort(); } catch { }
    aiAbortRef.current = null;
    setAiRunning(false);
    setAiOpen(false);
    setAiError('');
    // If we never received a content chunk, do not show Keep/Discard; just clear anchors
    if (!aiFirstChunkRef.current) {
      setAiConfirmOpen(false);
      setAiConfirmPos(null);
      aiStartPosRef.current = null;
      aiEndPosRef.current = null;
      aiInsertPosRef.current = null;
      return;
    }
    // Otherwise, show Keep/Discard positioned just under the generated content so far
    try {
      if (editor && aiEndPosRef.current !== null) {
        const end = Math.max(1, Math.min(aiEndPosRef.current as number, editor.state.doc.content.size));
        let coords: any = null; try { coords = editor.view.coordsAtPos(end); } catch { }
        const rootRect = containerRef.current?.getBoundingClientRect();
        if (rootRect) setAiConfirmPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 8 });
      }
    } catch { setAiConfirmPos(null); }
    setAiConfirmOpen(true);
  }, [editor]);



  const runAIInline = useCallback(async () => {
    if (aiRunning) return;
    const p = aiPrompt.trim();
    if (!p) return;
    // Reset any previous error
    setAiError('');
    aiFailedRef.current = false;
    // Determine session mode and snapshot selection when rewriting
    if (aiEditSelectionRef.current && editor) {
      aiSessionModeRef.current = 'replace';
      try {
        const { from, to } = aiEditSelectionRef.current;
        const { state } = editor;
        const slice = state.doc.slice(from, to);
        const serializer = DOMSerializer.fromSchema((editor as any).schema);
        const container = document.createElement('div');
        container.appendChild(serializer.serializeFragment(slice.content));
        originalSelectionHTMLRef.current = container.innerHTML || '';
      } catch { originalSelectionHTMLRef.current = null; }
    } else {
      aiSessionModeRef.current = 'insert';
      originalSelectionHTMLRef.current = null;
    }
    setAiRunning(true);
    setAiHasFirstChunk(false);
    aiFirstChunkRef.current = false;
    setAiConfirmOpen(false);
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    // Classy typewriter timer handle accessible across try/finally
    let pendingTypeTimeout: any = null;
    const clearPending = () => { if (pendingTypeTimeout) { clearTimeout(pendingTypeTimeout); pendingTypeTimeout = null; } };
    // Establish insertion and track range; we progressively replace [start,end] with rendered HTML
    try {
      const sel: any = editor?.state.selection as any;
      // If an edit selection is provided, replace that range; otherwise insert at caret/anchor
      if (aiEditSelectionRef.current) {
        aiStartPosRef.current = aiEditSelectionRef.current.from;
        aiEndPosRef.current = aiEditSelectionRef.current.to;
      } else {
        const startPos = (aiInsertPosRef.current ?? sel?.to ?? 0) as number;
        aiStartPosRef.current = startPos;
        aiEndPosRef.current = startPos;
      }
    } catch { aiStartPosRef.current = aiInsertPosRef.current ?? 0; aiEndPosRef.current = aiStartPosRef.current; }
    aiBufferRef.current = '';
    // Build final prompt; if editing selection, include the selected text and instructions
    const selectedForEdit = aiEditSelectionRef.current;
    const finalPrompt = selectedForEdit
      ? `Rewrite the following text according to these instructions: "${p}". Keep original meaning, preserve markdown formatting and code blocks, fix grammar and clarity. Output only the revised text as markdown without surrounding quotes or commentary.\n\nTEXT:\n"""\n${selectedForEdit.text}\n"""`
      : p;
    const callGenerate = async (): Promise<Response> => {
      return fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt }),
        signal: ctrl.signal,
        credentials: 'include',
      });
    };
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
    try {
      let res = await callGenerate();
      if (res.status === 401) {
        const ok = await refreshSession();
        if (ok) res = await callGenerate();
      }
      if (!res.ok) {
        try {
          const err = await res.json();
          setAiError((err?.error || 'Failed to start AI').toString());
        } catch {
          setAiError('Failed to start AI');
        }
        aiFailedRef.current = true;
        throw new Error('Failed');
      }
      if (!res.body) {
        setAiError('AI response stream is empty.');
        aiFailedRef.current = true;
        throw new Error('Failed');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Detect streaming mode from response header set by server
      const xMode = (res.headers.get('X-Mode') || 'normal').toLowerCase();
      const classy = xMode === 'classy';
      // Typewriter timings similar to the provided ChatTypewriter component
      // ChatGPT-like classy typing speeds (scaled ~3x faster)
      // Base very fast character delay with small natural jitter; pauses on punctuation/newlines
      const speedMultiplier = 1 / 3; // 3x faster than previous timings
      const baseDelay = 12 * speedMultiplier; // ms per normal character
      const jitter = () => 0.95 + Math.random() * 0.15; // +/- ~10%
      const delayForChar = (ch: string) => {
        if (ch === '\n') return 140 * speedMultiplier * jitter();
        if (/[.!?]/.test(ch)) return 120 * speedMultiplier * jitter();
        if (/[,:;]/.test(ch)) return 80 * speedMultiplier * jitter();
        if (ch === ' ') return 5 * speedMultiplier * jitter();
        return baseDelay * jitter();
      };
      // use outer pendingTypeTimeout / clearPending

      // Helper: render from aiBufferRef progressively (full HTML render of whole buffer)
      const renderBuffer = () => {
        if (!editor || aiStartPosRef.current === null || aiEndPosRef.current === null) return;
        const start = aiStartPosRef.current as number;
        const end = aiEndPosRef.current as number;
        const html = (marked.parse(aiBufferRef.current || '', { breaks: true, gfm: true }) as string) || '';
        editor.chain().setTextSelection({ from: start, to: end }).insertContent(html).run();
        try { aiEndPosRef.current = (editor.state.selection as any)?.to ?? start; } catch { aiEndPosRef.current = start; }
      };

      // Classy mode: maintain a queue so new chunks append without losing pending chars
      let classyQueue = '';
      let typing = false;
      let streamDone = false;
      let typingDoneResolve: (() => void) | null = null;
      const typingDonePromise: Promise<void> = new Promise((res) => { typingDoneResolve = res; });
      let typedCount = 0;
      const typeNext = () => {
        if (!classy) return;
        if (ctrl.signal.aborted) { typing = false; return; }
        if (!classyQueue.length) {
          typing = false;
          if (streamDone && typingDoneResolve) { typingDoneResolve(); typingDoneResolve = null; }
          return;
        }
        const nextChar = classyQueue[0];
        classyQueue = classyQueue.slice(1);
        aiBufferRef.current += nextChar;
        try { renderBuffer(); scrollEndIntoView(); } catch { }
        // Tiny ramp-up for the first few characters for snappier feel
        const delay = typedCount < 8 ? 0 : delayForChar(nextChar);
        typedCount++;
        pendingTypeTimeout = setTimeout(typeNext, Math.max(0, Math.round(delay)));
      };
      const enqueueTypewriter = (text: string) => {
        classyQueue += text;
        if (!typing) { typing = true; typeNext(); }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        if (chunk) {
          if (!aiFirstChunkRef.current) {
            aiFirstChunkRef.current = true;
            setAiHasFirstChunk(true);
          }
          if (classy) {
            // In classy mode, feed characters gradually (do not clear timers per chunk)
            enqueueTypewriter(chunk);
          } else {
            aiBufferRef.current += chunk;
            try { renderBuffer(); scrollEndIntoView(); } catch { }
          }
        }
      }
      // Mark stream as done and, in classy mode, wait for the typing queue to drain
      streamDone = true;
      if (classy && (typing || classyQueue.length > 0)) {
        try { await typingDonePromise; } catch { }
      }
    } catch { }
    finally {
      // Stop any pending typewriter timeouts only if aborted
      try { if (ctrl.signal.aborted) clearPending(); } catch { }
      setAiRunning(false);
      aiAbortRef.current = null;
      // Clear special edit context once finished
      aiEditSelectionRef.current = null;
      if (aiFirstChunkRef.current) {
        // Final progressive render already applied; open Keep/Discard just below generated content
        try {
          if (editor && aiEndPosRef.current !== null) {
            const end = Math.max(1, Math.min(aiEndPosRef.current as number, editor.state.doc.content.size));
            let coords: any = null; try { coords = editor.view.coordsAtPos(end); } catch { }
            const rootRect = containerRef.current?.getBoundingClientRect();
            if (rootRect) setAiConfirmPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 8 });
          }
        } catch { setAiConfirmPos(null); }
        setAiConfirmOpen(true);
        // Close the AI input bar so it doesn't float over content
        setAiOpen(false);
      } else {
        // No content produced; close the prompt/bar silently
        setAiConfirmOpen(false);
        setAiConfirmPos(null);
        // If there was a failure, keep the bar open to show the error message under the Thinking bar
        if (aiFailedRef.current) {
          setAiOpen(true);
        } else {
          setAiOpen(false);
        }
        // Reset session mode/snapshot as nothing changed
        aiSessionModeRef.current = 'insert';
        originalSelectionHTMLRef.current = null;
      }
      // Reset failure flag after handling
      aiFailedRef.current = false;
    }
  }, [aiPrompt, aiRunning, editor, scrollEndIntoView]);

  // Run a transform that replaces the current selection using a custom system prompt
  const runAITransformReplace = useCallback(async (finalPrompt: string) => {
    if (!editor || aiRunning) return;
    const sel = editor.state.selection as Selection;
    const from = (sel as any).from as number;
    const to = (sel as any).to as number;
    if (from === to) return;
    // Mark session as replace and capture original selection HTML to allow restoring on Discard
    aiSessionModeRef.current = 'replace';
    try {
      const slice = editor.state.doc.slice(from, to);
      const serializer = DOMSerializer.fromSchema((editor as any).schema);
      const container = document.createElement('div');
      container.appendChild(serializer.serializeFragment(slice.content));
      originalSelectionHTMLRef.current = container.innerHTML || '';
    } catch { originalSelectionHTMLRef.current = null; }
    // Position confirm below selection later
    setAiOpen(false);
    setAiHasFirstChunk(false);
    aiFirstChunkRef.current = false;
    setAiConfirmOpen(false);
    setAiRunning(true);
    aiStartPosRef.current = from;
    aiEndPosRef.current = to;
    aiBufferRef.current = '';
    // Show an inline loader near the selection while transforming
    try {
      let coords: any = null; try { coords = editor.view.coordsAtPos(to); } catch { }
      const rootRect = containerRef.current?.getBoundingClientRect();
      if (rootRect) setInlineLoaderPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 8 });
    } catch { setInlineLoaderPos(null); }
    setInlineLoaderOpen(true);
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    const callGenerate = async (): Promise<Response> => {
      return fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt }),
        signal: ctrl.signal,
        credentials: 'include',
      });
    };
    try {
      let res = await callGenerate();
      if (res.status === 401) {
        // refresh session via existing endpoint
        try {
          const u = auth.currentUser;
          if (u) {
            const idToken = await u.getIdToken(true);
            await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }), credentials: 'include' });
            res = await callGenerate();
          }
        } catch { }
      }
      if (!res.ok) {
        // Surface an inline error bubble near the loader position
        try {
          const err = await res.json();
          setUploadError((err?.error || 'Failed to start AI').toString());
        } catch {
          setUploadError('Failed to start AI');
        }
        throw new Error('Failed');
      }
      if (!res.body) {
        setUploadError('AI response stream is empty.');
        throw new Error('Failed');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const xMode = (res.headers.get('X-Mode') || 'normal').toLowerCase();
      const classy = xMode === 'classy';
      const speedMultiplier = 1 / 3;
      const baseDelay = 12 * speedMultiplier;
      const jitter = () => 0.95 + Math.random() * 0.15;
      const delayForChar = (ch: string) => {
        if (ch === '\n') return 140 * speedMultiplier * jitter();
        if (/[.!?]/.test(ch)) return 120 * speedMultiplier * jitter();
        if (/[,:;]/.test(ch)) return 80 * speedMultiplier * jitter();
        if (ch === ' ') return 5 * speedMultiplier * jitter();
        return baseDelay * jitter();
      };
      const renderBuffer = () => {
        if (!editor || aiStartPosRef.current === null || aiEndPosRef.current === null) return;
        const start = aiStartPosRef.current as number;
        const end = aiEndPosRef.current as number;
        const html = (marked.parse(aiBufferRef.current || '', { breaks: true, gfm: true }) as string) || '';
        editor.chain().setTextSelection({ from: start, to: end }).insertContent(html).run();
        try { aiEndPosRef.current = (editor.state.selection as any)?.to ?? start; } catch { aiEndPosRef.current = start; }
      };
      let classyQueue = '';
      let typing = false;
      let streamDone = false;
      let typingDoneResolve: (() => void) | null = null;
      const typingDonePromise: Promise<void> = new Promise((res) => { typingDoneResolve = res; });
      let typedCount = 0;
      let timeoutHandle: any = null;
      const typeNext = () => {
        if (!classy) return;
        if (ctrl.signal.aborted) { typing = false; return; }
        if (!classyQueue.length) {
          typing = false;
          if (streamDone && typingDoneResolve) { typingDoneResolve(); typingDoneResolve = null; }
          return;
        }
        const nextChar = classyQueue[0];
        classyQueue = classyQueue.slice(1);
        aiBufferRef.current += nextChar;
        try { renderBuffer(); scrollEndIntoView(); } catch { }
        const delay = typedCount < 8 ? 0 : delayForChar(nextChar);
        typedCount++;
        timeoutHandle = setTimeout(typeNext, Math.max(0, Math.round(delay)));
      };
      const enqueue = (t: string) => { classyQueue += t; if (!typing) { typing = true; typeNext(); } };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        if (chunk) {
          if (!aiFirstChunkRef.current) { aiFirstChunkRef.current = true; setAiHasFirstChunk(true); }
          if (classy) enqueue(chunk); else { aiBufferRef.current += chunk; try { renderBuffer(); scrollEndIntoView(); } catch { } }
        }
      }
      streamDone = true;
      if (classy && (typing || classyQueue.length > 0)) { try { await typingDonePromise; } catch { } }
      try { if (timeoutHandle) clearTimeout(timeoutHandle); } catch { }
    } catch { }
    finally {
      setInlineLoaderOpen(false);
      setAiRunning(false);
      aiAbortRef.current = null;
      if (aiFirstChunkRef.current) {
        try {
          if (editor && aiEndPosRef.current !== null) {
            const end = Math.max(1, Math.min(aiEndPosRef.current as number, editor.state.doc.content.size));
            let coords: any = null; try { coords = editor.view.coordsAtPos(end); } catch { }
            const rootRect = containerRef.current?.getBoundingClientRect();
            if (rootRect) setAiConfirmPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 8 });
          }
        } catch { setAiConfirmPos(null); }
        setAiConfirmOpen(true);
      } else {
        setAiConfirmOpen(false);
        setAiConfirmPos(null);
        // Reset session mode/snapshot as nothing changed
        aiSessionModeRef.current = 'insert';
        originalSelectionHTMLRef.current = null;
      }
    }
  }, [editor, aiRunning, scrollEndIntoView]);

  // Explain selected text in a side popover (does not modify editor content)
  const runExplainForSelection = useCallback(async () => {
    if (!editor || explainRunning) return;
    const sel = editor.state.selection as Selection & { $from: any };
    const from = (sel as any).from as number;
    const to = (sel as any).to as number;
    if (from === to) return;
    const text = editor.state.doc.textBetween(from, to, '\n', '\ufffc');
    // Position the explain box near the selection (to the right of bubble if available)
    try {
      let coords: any = null; try { coords = editor.view.coordsAtPos(to); } catch { }
      const rootRect = containerRef.current?.getBoundingClientRect();
      if (rootRect) setExplainPos({ left: Math.min(rootRect.width - 320, Math.max(8, coords.left - rootRect.left + 12)), top: coords.top - rootRect.top });
    } catch { setExplainPos({ left: 8, top: 8 }); }
    setExplainText('');
    setExplainOpen(true);
    setExplainRunning(true);
    const ctrl = new AbortController();
    explainAbortRef.current = ctrl;
    const prompt = `Explain the following text clearly and concisely. Prefer bullet points where helpful. Do not rewrite the text; just explain it.\n\nTEXT:\n"""\n${text}\n"""`;
    const callGenerate = async (): Promise<Response> => {
      return fetch('/api/ai/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }), signal: ctrl.signal, credentials: 'include'
      });
    };
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
    try {
      let res = await callGenerate();
      if (res.status === 401) {
        const ok = await refreshSession();
        if (ok) res = await callGenerate();
      }
      if (!res.ok || !res.body) throw new Error('Failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const xMode = (res.headers.get('X-Mode') || 'normal').toLowerCase();
      const classy = xMode === 'classy';
      const speedMultiplier = 1 / 3;
      const baseDelay = 12 * speedMultiplier;
      const jitter = () => 0.95 + Math.random() * 0.15;
      const delayForChar = (ch: string) => {
        if (ch === '\n') return 140 * speedMultiplier * jitter();
        if (/[.!?]/.test(ch)) return 120 * speedMultiplier * jitter();
        if (/[,:;]/.test(ch)) return 80 * speedMultiplier * jitter();
        if (ch === ' ') return 5 * speedMultiplier * jitter();
        return baseDelay * jitter();
      };
      let classyQueue = '';
      let typing = false;
      let streamDone = false;
      let typingDoneResolve: (() => void) | null = null;
      const typingDonePromise: Promise<void> = new Promise((res) => { typingDoneResolve = res; });
      let typedCount = 0;
      let timeoutHandle: any = null;
      const typeNext = () => {
        if (!classy) return;
        if (ctrl.signal.aborted) { typing = false; return; }
        if (!classyQueue.length) {
          typing = false;
          if (streamDone && typingDoneResolve) { typingDoneResolve(); typingDoneResolve = null; }
          return;
        }
        const nextChar = classyQueue[0];
        classyQueue = classyQueue.slice(1);
        setExplainText((prev) => prev + nextChar);
        const delay = typedCount < 8 ? 0 : delayForChar(nextChar);
        typedCount++;
        timeoutHandle = setTimeout(typeNext, Math.max(0, Math.round(delay)));
      };
      const enqueue = (t: string) => { classyQueue += t; if (!typing) { typing = true; typeNext(); } };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        if (chunk) {
          if (classy) enqueue(chunk); else setExplainText((prev) => prev + chunk);
        }
      }
      streamDone = true;
      if (classy && (typing || classyQueue.length > 0)) { try { await typingDonePromise; } catch { } }
      try { if (timeoutHandle) clearTimeout(timeoutHandle); } catch { }
    } catch {
      // If aborted by user, don't show a failure message
      if (!ctrl.signal.aborted) setExplainText('Failed to explain.');
    } finally {
      setExplainRunning(false);
      explainAbortRef.current = null;
    }
  }, [editor, explainRunning]);

  // When the AI prompt opens, auto-focus the input and select its contents
  useEffect(() => {
    if (!aiOpen) return;
    let tries = 0;
    const focusIt = () => {
      const el = aiInputRef.current;
      if (el) {
        try { el.focus({ preventScroll: true } as any); } catch { el.focus(); }
        try { el.select(); } catch { }
        // Make sure it's visible if placed near the bottom of a scrollable area
        try { el.scrollIntoView({ block: 'nearest' }); } catch { }
        return;
      }
      if (tries < 4) {
        tries++;
        setTimeout(focusIt, 50);
      }
    };
    // Next paint then a few retries in case the editor re-focuses itself
    requestAnimationFrame(focusIt);
  }, [aiOpen]);
  // Drag-and-drop overlay removed

  // Position and visibility logic
  useEffect(() => {
    if (!editor) return;
    // While user is dragging to select text, disable bubble pointer events so it doesn't intercept the mouse
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    if (!root) return;
    const onMouseDown = (e: MouseEvent) => {
      // Only react to primary button within the editor content
      if (e.button !== 0) return;
      setDraggingSelection(true);
    };
    const onMouseUp = () => setDraggingSelection(false);
    root.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    return () => {
      root.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      // In view-only mode, never show the formatting bubble
      if (!editor.isEditable) { setBubblePos(null); return; }
      const { state, view } = editor;
      const sel = state.selection as Selection;
      // Hide all suggestions/bubbles when a node (e.g., image) is selected
      if (sel instanceof NodeSelection) {
        const n: any = (sel as any).node;
        const nm = n?.type?.name;
        if (nm === 'image') { setBubblePos(null); return; }
      }
      const { from, to, empty } = sel;
      // Close any open dropdowns when selection changes to avoid auto-open behavior
      setShowColorMenu(false);
      setShowBlockMenu(false);
      setShowSizeMenu(false);
      setShowFontMenu(false);
      const root = containerRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      if (!empty) {
        try {
          // coordsAtPos can throw if the DOM isn't fully mapped for extreme content; guard it
          let start: any = null; let end: any = null;
          try { start = view.coordsAtPos(Math.max(1, Math.min(from, state.doc.content.size))); } catch { }
          try { end = view.coordsAtPos(Math.max(1, Math.min(to, state.doc.content.size))); } catch { }
          if (!start || !end) { setBubblePos(null); return; }
          setBubblePos({
            left: (start.left + end.left) / 2 - rect.left,
            top: Math.min(start.top, end.top) - rect.top - 42,
          });
        } catch {
          // If positioning fails, hide bubble to avoid crashes
          setBubblePos(null);
        }
        // Reflect current effective size for the selection in the input (inline to avoid early reference)
        try {
          const ts = editor.getAttributes('textStyle');
          const fs = ts?.fontSize ? parseInt(String(ts.fontSize), 10) : undefined;
          if (Number.isFinite(fs)) { setSizeInput(String(fs)); return; }
          const ihSize = editor.getAttributes('inlineHeading')?.fontSize;
          const fs2 = ihSize ? parseInt(String(ihSize), 10) : undefined;
          if (Number.isFinite(fs2)) { setSizeInput(String(fs2)); return; }
          // Fallback based on context
          const ih = editor.getAttributes('inlineHeading');
          if (ih?.level === 1) { setSizeInput('32'); return; }
          if (ih?.level === 2) { setSizeInput('24'); return; }
          if (ih?.level === 3) { setSizeInput('20'); return; }
          if (editor.isActive('heading', { level: 1 })) { setSizeInput('32'); return; }
          if (editor.isActive('heading', { level: 2 })) { setSizeInput('24'); return; }
          if (editor.isActive('heading', { level: 3 })) { setSizeInput('20'); return; }
          setSizeInput('16');
        } catch { }
      } else {
        setBubblePos(null);
        // Clear custom input so it falls back to effective size next time
        setSizeInput('');
      }

      // Disable floating menu when just placing the caret; only show when selection is non-empty
    };
    editor.on('selectionUpdate', onSelection);
    // Avoid re-running on every transaction to reduce reflows; selectionUpdate is enough for our UI
    return () => {
      editor.off('selectionUpdate', onSelection);
    };
  }, [editor]);

  // Also react to doc updates (format changes) so the size label reflects changes instantly
  useEffect(() => {
    if (!editor) return;
    // Keep size input in sync without touching slash menu here
    const syncSizeLabel = () => {
      // Don't override while the numeric size input is actively focused
      const active = document.activeElement as HTMLElement | null;
      if (active && bubbleRef.current && bubbleRef.current.contains(active) && (active as HTMLInputElement).type === 'number') {
        return;
      }
      try {
        const next = String(getEffectiveFontSize());
        setSizeInput((prev) => {
          if (prev === '') return prev; // respect empty state to fall back to computed value via prop
          return prev === next ? prev : next;
        });
      } catch { }
    };

  }, [editor]);

  // Close or refresh slash menu on selection changes
  useEffect(() => {
    if (!editor) return;
    // keep ref in sync for stable callbacks (e.g., onUpdate)
    slashOpenRef.current = slashOpen;
    const onSelUpdate = () => {
      // Close slash menu while read-only
      if (!editor.isEditable) { setSlashOpen(false); return; }
      try {
        const state = editor.state;
        const sel = state.selection as Selection & { $from: any };
        if (sel instanceof (NodeSelection as any)) { setSlashOpen(false); return; }
        if (!sel.empty || editor.isActive('codeBlock')) { setSlashOpen(false); return; }
        const $from = sel.$from;
        let parentText = '';
        try { parentText = $from.parent?.textBetween(0, $from.parentOffset, '\n', '\ufffc') || ''; } catch { parentText = ''; }
        const slashAt = parentText.lastIndexOf('/');
        const valid = slashAt >= 0 && (/\s/.test(parentText[slashAt - 1] || '') || slashAt === 0);
        if (!valid) { setSlashOpen(false); return; }
        const query = parentText.slice(slashAt + 1);
        if (/\s/.test(query) || query.length > 32) { setSlashOpen(false); return; }
        const toPos = state.selection.from;
        let fromPos = 0;
        try { fromPos = ($from.start() as number) + slashAt; } catch { fromPos = 0; }
        if (!Number.isFinite(fromPos) || !Number.isFinite(toPos) || !(fromPos < toPos)) { setSlashOpen(false); setSlashRange(null); return; }
        const { view } = (editor as any);
        let coords: { left: number; top: number } | null = null;
        try { coords = view.coordsAtPos(toPos); } catch { coords = null; }
        if (!coords || !Number.isFinite(coords.left) || !Number.isFinite(coords.top)) { setSlashOpen(false); return; }
        const rootRect = containerRef.current?.getBoundingClientRect();
        if (!rootRect) { setSlashOpen(false); return; }
        setSlashPos({ left: coords.left - rootRect.left, top: coords.top - rootRect.top + 18 });
        setSlashRange({ from: fromPos, to: toPos });
        setSlashQuery(query);
        setSlashIndex(0);
        setSlashOpen(true);
        // Anchor enhancement is handled separately on updates/mutations; keep selection handler focused on slash menu only
      } catch { setSlashOpen(false); }
    };
    editor.on('selectionUpdate', onSelUpdate);
    return () => { editor.off('selectionUpdate', onSelUpdate); };
  }, [editor]);

  // Close slash menu on outside clicks (outside editor content and outside menu)
  useEffect(() => {
    if (!slashOpen || !editor) return;
    const root = (editor as unknown as { view?: { dom: HTMLElement } }).view?.dom;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (slashRef.current && slashRef.current.contains(t)) return;
      if (root && root.contains(t)) return; // selectionUpdate will handle closings within editor
      setSlashOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [slashOpen, editor]);

  // Detect hover over images/links pointing to /api/files/view/:id or page links and show a 3-dots menu
  useEffect(() => {
    if (!editor) return;
    const root = (editor as unknown as { view?: { dom: HTMLElement; coordsAtPos: any } }).view?.dom;
    if (!root) return;
    const onMove = (e: MouseEvent) => {
      if (Date.now() < hoverSuppressUntilRef.current) return;
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // File menu logic
      const menuEl = document.getElementById('file-attachment-menu');
      if (menuEl && menuEl.contains(t)) return;
      if (fileMenuDropdownOpen) return;
      // Page link menu logic
      const pageMenuEl = document.getElementById('page-link-menu');
      if (pageMenuEl && pageMenuEl.contains(t)) return;
      if (pageLinkMenuDropdownOpen) return;
      const viewAny: any = (editor as any).view;
      const root = viewAny?.dom as HTMLElement | null;
      if (!root) { setFileMenuOpen(false); setFileMenuTarget(null); setPageLinkMenuOpen(false); setPageLinkMenuTarget(null); return; }
      // Find block with attachments or page links
      let block = t.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th') as HTMLElement | null;
      const y = (e as MouseEvent).clientY;
      const hasAttachment = (el: Element | null) => !!el && (
        el.querySelector('img[src*="/api/files/view/"]') ||
        el.querySelector('a[href*="/api/files/view/"]')
      );
      const hasPageLink = (el: Element | null) => !!el && (
        el.querySelector('a[data-page-id]') || el.querySelector('a[title^="page:"]') || el.querySelector('a[href^="#page:"]')
      );
      if (!block || (!hasAttachment(block) && !hasPageLink(block))) {
        // Fallback: scan visible blocks at this Y for one with an attachment or page link
        const blocks = Array.from(root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th')) as HTMLElement[];
        let chosen: HTMLElement | null = null;
        let bestDy = Number.POSITIVE_INFINITY;
        for (const b of blocks) {
          if (!hasAttachment(b) && !hasPageLink(b)) continue;
          const r = b.getBoundingClientRect();
          if (y >= r.top && y <= r.bottom) {
            const dy = Math.abs((r.top + r.bottom) / 2 - y);
            if (dy < bestDy) { bestDy = dy; chosen = b; }
          }
        }
        block = chosen;
      }
      if (!block) { setFileMenuOpen(false); setFileMenuTarget(null); setPageLinkMenuOpen(false); setPageLinkMenuTarget(null); return; }
      // File attachments
      const fileCandidates: HTMLElement[] = [
        ...Array.from(block.querySelectorAll('img[src*="/api/files/view/"]')) as HTMLElement[],
        ...Array.from(block.querySelectorAll('a[href*="/api/files/view/"]')) as HTMLElement[],
      ];
      // Page links
      const pageCandidates: HTMLElement[] = [
        ...Array.from(block.querySelectorAll('a[data-page-id]')) as HTMLElement[],
        ...Array.from(block.querySelectorAll('a[title^="page:"]')) as HTMLElement[],
        ...Array.from(block.querySelectorAll('a[href^="#page:"]')) as HTMLElement[],
      ];
      // File menu
      if (fileCandidates.length) {
        let el: HTMLElement | null = null;
        let best = Number.POSITIVE_INFINITY;
        for (const c of fileCandidates) {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs((e as MouseEvent).clientX - cx);
          if (d < best) { best = d; el = c as HTMLElement; }
        }
        if (!el) { setFileMenuOpen(false); setFileMenuTarget(null); } else {
          let id: string | null = null;
          let type: 'image' | 'file' | null = null;
          let name: string | undefined = undefined;
          if (el instanceof HTMLImageElement) {
            const m = el.src.match(/\/api\/files\/view\/([^?/#]+)/);
            id = m ? decodeURIComponent(m[1]) : null;
            type = 'image';
            name = el.alt || undefined;
          } else if (el instanceof HTMLAnchorElement) {
            const m = el.href.match(/\/api\/files\/view\/([^?/#]+)/);
            id = m ? decodeURIComponent(m[1]) : null;
            type = id ? 'file' : null;
            name = (el.textContent || '').trim() || undefined;
          }
          if (!id || !type) { setFileMenuOpen(false); setFileMenuTarget(null); } else {
            fileMenuElRef.current = el;
            try {
              const rootRect = containerRef.current?.getBoundingClientRect();
              if (rootRect) {
                const buttonWidth = 32;
                const inset = 8;
                const left = Math.max(0, rootRect.width - buttonWidth - inset);
                const lineRect = (block as HTMLElement).getBoundingClientRect();
                const top = lineRect.top - rootRect.top + Math.max(0, Math.round((lineRect.height - buttonWidth) / 2));
                setFileMenuPos({ left, top });
                setFileMenuTarget({ id, type, name });
                setFileMenuOpen(true);
                setFileMenuDropdownOpen(false);
              }
            } catch { setFileMenuOpen(false); setFileMenuTarget(null); }
          }
        }
      } else {
        setFileMenuOpen(false); setFileMenuTarget(null);
      }
      // Page link menu
      if (pageCandidates.length) {
        let el: HTMLElement | null = null;
        let best = Number.POSITIVE_INFINITY;
        for (const c of pageCandidates) {
          const r = c.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const d = Math.abs((e as MouseEvent).clientX - cx);
          if (d < best) { best = d; el = c as HTMLElement; }
        }
        if (!el) { setPageLinkMenuOpen(false); setPageLinkMenuTarget(null); } else {
          let id: string | null = null;
          let name: string | undefined = undefined;
          if (el instanceof HTMLAnchorElement) {
            id = el.getAttribute('data-page-id');
            if (!id) {
              const href = el.getAttribute('href') || '';
              if (href.startsWith('#page:')) id = href.slice('#page:'.length);
            }
            name = (el.textContent || '').trim() || undefined;
          }
          if (!id) { setPageLinkMenuOpen(false); setPageLinkMenuTarget(null); } else {
            try {
              const rootRect = containerRef.current?.getBoundingClientRect();
              if (rootRect) {
                const buttonWidth = 32;
                const inset = 8;
                const left = Math.max(0, rootRect.width - buttonWidth - inset);
                const lineRect = (block as HTMLElement).getBoundingClientRect();
                const top = lineRect.top - rootRect.top + Math.max(0, Math.round((lineRect.height - buttonWidth) / 2));
                setPageLinkMenuPos({ left, top });
                setPageLinkMenuTarget({ id, name });
                setPageLinkMenuOpen(true);
                setPageLinkMenuDropdownOpen(false);
              }
            } catch { setPageLinkMenuOpen(false); setPageLinkMenuTarget(null); }
          }
        }
      } else {
        setPageLinkMenuOpen(false); setPageLinkMenuTarget(null);
      }
    };
    const onLeave = (e: MouseEvent) => {
      const t = e.relatedTarget as Node | null;
      if (!t) { if (!fileMenuDropdownOpen) setFileMenuOpen(false); if (!pageLinkMenuDropdownOpen) setPageLinkMenuOpen(false); return; }
      if ((document.getElementById('file-attachment-menu') as HTMLElement | null)?.contains(t)) return;
      if ((document.getElementById('page-link-menu') as HTMLElement | null)?.contains(t)) return;
      if (!fileMenuDropdownOpen) setFileMenuOpen(false);
      if (!pageLinkMenuDropdownOpen) setPageLinkMenuOpen(false);
    };
    root.addEventListener('mousemove', onMove, true);
    root.addEventListener('mouseleave', onLeave, true);
    return () => {
      root.removeEventListener('mousemove', onMove, true);
      root.removeEventListener('mouseleave', onLeave, true);
    };
  }, [editor, fileMenuDropdownOpen, pageLinkMenuDropdownOpen]);
  // Page link rename
  const renameCurrentPageLink = useCallback(async () => {
    if (!pageLinkMenuTarget || !editor) return;
    const next = prompt('New page name', pageLinkMenuTarget.name || '');
    if (!next || !next.trim()) return;
    try {
      // First, rename the actual page entity via context if available
      try { if (renamePageFromCtx) await renamePageFromCtx(pageLinkMenuTarget.id, next.trim()); } catch { }
      // Update document text for page link
      const root = (editor as any).view.dom;
      const anchors = Array.from(root.querySelectorAll(`a[data-page-id="${pageLinkMenuTarget.id}"] , a[href="#page:${pageLinkMenuTarget.id}"] , a[title="page:${pageLinkMenuTarget.id}"]`)) as HTMLAnchorElement[];
      for (const a of anchors) {
        const text = a.textContent || '';
        const view: any = (editor as any).view;
        const from = view.posAtDOM(a, 0);
        const to = from + text.length;
        const href = a.getAttribute('href') || a.href || `#page:${pageLinkMenuTarget.id}`;
        editor.chain().focus().setTextSelection({ from, to }).insertContent([{ type: 'text', text: next.trim(), marks: [{ type: 'link', attrs: { href } }] }]).run();
      }
    } catch { }
  }, [pageLinkMenuTarget, editor]);

  // Page link delete (delete page and all child pages)
  const deleteCurrentPageLink = useCallback(async () => {
    if (!pageLinkMenuTarget || !editor) return;
    const ok = confirm('Delete this page and all of its child pages?');
    if (!ok) return;
    try {
      if (deletePageFromCtx) await deletePageFromCtx(pageLinkMenuTarget.id);
      // Remove all page links from editor content
      const root = (editor as any).view.dom;
      const anchors = Array.from(root.querySelectorAll(`a[data-page-id="${pageLinkMenuTarget.id}"] , a[href="#page:${pageLinkMenuTarget.id}"] , a[title="page:${pageLinkMenuTarget.id}"]`)) as HTMLAnchorElement[];
      for (const a of anchors) {
        const text = a.textContent || '';
        const view: any = (editor as any).view;
        const from = view.posAtDOM(a, 0);
        const to = from + text.length;
        const { state, dispatch } = view;
        const tr = state.tr.delete(from, to);
        dispatch(tr);
      }
    } catch { }
    setPageLinkMenuOpen(false);
    setPageLinkMenuTarget(null);
    setPageLinkMenuDropdownOpen(false);
  }, [pageLinkMenuTarget, editor, deletePageFromCtx]);

  // ========== Bi-directional sync: page link labels <-> context page names ==========
  // Track last known page names from context to detect changes and avoid loops
  const pageNameByIdRef = useRef<Record<string, string>>({});
  // Debounce timers and pending names for editor->context renames
  const renameTimersRef = useRef<Record<string, any>>({});
  const pendingRenameNameRef = useRef<Record<string, string>>({});

  // Helper: extract page id from an anchor element
  const getPageIdFromAnchor = useCallback((a: HTMLAnchorElement): string | null => {
    try {
      const data = a.getAttribute('data-page-id');
      if (data && data.trim()) return data.trim();
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#page:')) return href.slice('#page:'.length).trim() || null;
      const title = a.getAttribute('title') || '';
      if (title.startsWith('page:')) return title.slice('page:'.length).trim() || null;
      return null;
    } catch { return null; }
  }, []);

  // Context -> Editor: when a page name changes in context, update all link labels in the editor
  useEffect(() => {
    if (!editor) return;
    try {
      // Build latest name map from context
      const nextMap: Record<string, string> = {};
      for (const p of (Array.isArray(pagesFromCtx) ? pagesFromCtx : [])) {
        if (p && typeof p.id === 'string') nextMap[p.id] = (p.name || 'Untitled');
      }
      const prevMap = pageNameByIdRef.current;
      // Determine which ids changed
      const changedIds: string[] = [];
      for (const id of Object.keys(nextMap)) {
        if ((prevMap[id] || '') !== (nextMap[id] || '')) changedIds.push(id);
      }
      if (changedIds.length === 0) {
        // Still update cached map (handles initial mount and deletions)
        pageNameByIdRef.current = nextMap;
        return;
      }
      const root = (editor as any).view?.dom as HTMLElement | null;
      if (!root) { pageNameByIdRef.current = nextMap; return; }
      for (const id of changedIds) {
        const want = (nextMap[id] || '').trim();
        if (!want) continue;
        const anchors = Array.from(root.querySelectorAll(
          `a[data-page-id="${id}"] , a[href="#page:${id}"] , a[title="page:${id}"]`
        )) as HTMLAnchorElement[];
        for (const a of anchors) {
          try {
            const current = (a.textContent || '').trim();
            if (current === want) continue; // already up-to-date
            // Replace the link text via ProseMirror transaction, preserving href
            const viewAny: any = (editor as any).view;
            const from = viewAny.posAtDOM(a, 0);
            const to = from + (a.textContent || '').length;
            const href = a.getAttribute('href') || a.href || `#page:${id}`;
            if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
              editor
                .chain()
                .focus()
                .setTextSelection({ from, to })
                .insertContent([{ type: 'text', text: want, marks: [{ type: 'link', attrs: { href } }] }])
                .run();
            }
          } catch { /* ignore per-anchor */ }
        }
      }
      // Update cache after applying
      pageNameByIdRef.current = nextMap;
    } catch {
      // If anything goes wrong, just refresh cache to avoid loops
      const nextMap: Record<string, string> = {};
      for (const p of (Array.isArray(pagesFromCtx) ? pagesFromCtx : [])) {
        if (p && typeof p.id === 'string') nextMap[p.id] = (p.name || 'Untitled');
      }
      pageNameByIdRef.current = nextMap;
    }
  }, [editor, pagesFromCtx]);

  // Editor -> Context: when user edits a page link's text, debounce renamePage(id, newText)
  useEffect(() => {
    if (!editor) return;
    const viewAny: any = (editor as any).view;
    const root: HTMLElement | null = viewAny?.dom as HTMLElement | null;
    if (!root) return;

    const scheduleMaybe = (a: HTMLAnchorElement) => {
      try {
        if (!editor.isEditable) return;
        const id = getPageIdFromAnchor(a);
        if (!id) return;
        const text = (a.textContent || '').trim();
        if (!text) return;
        const ctxName = (pageNameByIdRef.current[id] || '').trim();
        if (ctxName === text) return; // already matching
        // Debounce per id
        pendingRenameNameRef.current[id] = text;
        if (renameTimersRef.current[id]) {
          try { clearTimeout(renameTimersRef.current[id]); } catch { }
        }
        renameTimersRef.current[id] = setTimeout(async () => {
          try {
            const pending = (pendingRenameNameRef.current[id] || '').trim();
            if (!pending) return;
            // If context already matches, skip
            const latestCtx = (pageNameByIdRef.current[id] || '').trim();
            if (latestCtx === pending) return;
            if (renamePageFromCtx) await renamePageFromCtx(id, pending);
          } catch { /* ignore */ }
          finally {
            try { clearTimeout(renameTimersRef.current[id]); } catch { }
            delete renameTimersRef.current[id];
          }
        }, 200);
      } catch { /* ignore */ }
    };

    const observer = new MutationObserver((mutations) => {
      try {
        for (const m of mutations) {
          if (m.type === 'characterData') {
            const node = m.target as Node;
            const el = (node.parentElement || (node as any).parentNode) as HTMLElement | null;
            const a = el?.closest('a');
            if (a && a instanceof HTMLAnchorElement) {
              const isPage = a.hasAttribute('data-page-id') ||
                ((a.getAttribute('href') || '').startsWith('#page:')) ||
                ((a.getAttribute('title') || '').startsWith('page:'));
              if (isPage) scheduleMaybe(a);
            }
          } else if (m.type === 'childList' || m.type === 'attributes') {
            const nodes = [
              ...Array.from(m.addedNodes).filter((n): n is HTMLElement => n instanceof HTMLElement),
            ];
            for (const n of nodes) {
              const anchors: HTMLAnchorElement[] = (n.matches && n.matches('a') ? [n as unknown as HTMLAnchorElement] : Array.from(n.querySelectorAll('a')) as HTMLAnchorElement[]);
              for (const a of anchors) {
                const isPage = a.hasAttribute('data-page-id') ||
                  ((a.getAttribute('href') || '').startsWith('#page:')) ||
                  ((a.getAttribute('title') || '').startsWith('page:'));
                if (isPage) scheduleMaybe(a);
              }
            }
          }
        }
      } catch { /* ignore batch */ }
    });

    try {
      observer.observe(root, { subtree: true, characterData: true, childList: true, attributes: true });
    } catch { }
    return () => {
      try { observer.disconnect(); } catch { }
      const timers = renameTimersRef.current;
      for (const id of Object.keys(timers)) {
        try { clearTimeout(timers[id]); } catch { }
        delete timers[id];
      }
    };
  }, [editor, getPageIdFromAnchor, renamePageFromCtx]);

  // Immediate flush: when caret moves away from a page link that has a pending rename, apply it right away
  const currentCaretPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      try {
        const viewAny: any = (editor as any).view;
        const stateAny: any = editor.state as any;
        const pos: number = stateAny.selection?.from ?? 0;
        const docSize: number = stateAny.doc?.content?.size ?? 1;
        const safePos = Math.max(1, Math.min(Number(pos || 1), Number(docSize || 1)));
        let node: Node | null = null;
        try { node = viewAny.domAtPos(safePos)?.node as Node | null; } catch { node = null; }
        let a: HTMLAnchorElement | null = null;
        if (node) {
          const el = (node.nodeType === 1 ? (node as Element) : (node.parentElement as Element | null)) as Element | null;
          a = (el?.closest ? (el.closest('a') as HTMLAnchorElement | null) : null) || null;
        }
        const newId = a ? getPageIdFromAnchor(a) : null;
        const prevId = currentCaretPageIdRef.current;
        if (prevId && prevId !== newId) {
          const pending = (pendingRenameNameRef.current[prevId] || '').trim();
          if (pending && renamePageFromCtx) {
            // Clear any timer and flush immediately
            try {
              if (renameTimersRef.current[prevId]) { clearTimeout(renameTimersRef.current[prevId]); delete renameTimersRef.current[prevId]; }
            } catch { }
            renamePageFromCtx(prevId, pending).catch(() => { });
            delete pendingRenameNameRef.current[prevId];
          }
        }
        currentCaretPageIdRef.current = newId;
      } catch { /* ignore */ }
    };
    editor.on('selectionUpdate', onSel);
    return () => { editor.off('selectionUpdate', onSel); };
  }, [editor, getPageIdFromAnchor, renamePageFromCtx]);

  // Immediate flush: when editor root blurs, apply any pending renames
  useEffect(() => {
    if (!editor) return;
    const root: HTMLElement | null = (editor as any).view?.dom as HTMLElement | null;
    if (!root) return;
    const onBlur = () => {
      try {
        const timers = renameTimersRef.current;
        for (const id of Object.keys(pendingRenameNameRef.current)) {
          const name = (pendingRenameNameRef.current[id] || '').trim();
          if (!name) continue;
          try { if (timers[id]) { clearTimeout(timers[id]); delete timers[id]; } } catch { }
          if (renamePageFromCtx) { renamePageFromCtx(id, name).catch(() => { }); }
          delete pendingRenameNameRef.current[id];
        }
      } catch { /* ignore */ }
    };
    root.addEventListener('blur', onBlur, true);
    return () => { root.removeEventListener('blur', onBlur, true); };
  }, [editor, renamePageFromCtx]);

  // Close the dropdown on outside clicks only
  useEffect(() => {
    if (!fileMenuDropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const menuEl = document.getElementById('file-attachment-menu');
      if (menuEl && menuEl.contains(t)) return;
      setFileMenuDropdownOpen(false);
      setFileMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [fileMenuDropdownOpen]);

  const renameCurrentAttachment = useCallback(async () => {
    if (!fileMenuTarget) return;
    const next = prompt('New name', fileMenuTarget.name || '');
    if (!next || !next.trim()) return;
    try {
      // Update document text for link, not just DOM; no server metadata calls
      if (editor && fileMenuTarget.type === 'file' && fileMenuElRef.current instanceof HTMLAnchorElement) {
        const a = fileMenuElRef.current as HTMLAnchorElement;
        const href = a.getAttribute('href') || a.href;
        const text = a.textContent || '';
        try {
          const view: any = (editor as any).view;
          const from = view.posAtDOM(a, 0);
          const to = from + text.length;
          editor
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .insertContent([{ type: 'text', text: next.trim(), marks: [{ type: 'link', attrs: { href } }] }])
            .run();
        } catch { }
      }
    } catch { }
  }, [fileMenuTarget, editor]);

  const deleteCurrentAttachment = useCallback(async () => {
    if (!fileMenuTarget || !editor || fileDeleteLoading) return;

    try {
      const ok = fileMenuTarget.type === 'page'
        ? confirm('Delete this page and all of its child pages?')
        : confirm('Delete this file from storage?');
      if (!ok) return;

      setFileDeleteLoading(true);

      if (fileMenuTarget.type === 'file') {
        console.log('Deleting file:', fileMenuTarget.id);
        const res = await fetch(`/api/files/${encodeURIComponent(fileMenuTarget.id)}`, { method: 'DELETE' });
        if (!res.ok) {
          console.error('Failed to delete file from server:', res.status, res.statusText);
          setFileDeleteLoading(false);
          return;
        }
        console.log('File deleted from server successfully');
      } else if (fileMenuTarget.type === 'page') {
        try {
          if (deletePageFromCtx) await deletePageFromCtx(fileMenuTarget.id);
        } catch (error) {
          console.error('Failed to delete page:', error);
          setFileDeleteLoading(false);
          return;
        }
      }

      // Remove node/link from editor content
      const view: any = (editor as any).view;
      const el = fileMenuElRef.current;

      if (fileMenuTarget.type === 'image' && el) {
        // For images, find and delete the image node
        try {
          const rect = el.getBoundingClientRect();
          const center = { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 };
          let pos = 0;
          try { pos = view.posAtCoords({ left: center.left, top: center.top })?.pos ?? 0; } catch { pos = 0; }

          const { state, dispatch } = view;
          const $pos = state.doc.resolve(pos);
          const node = $pos.nodeAfter || $pos.nodeBefore;
          if (node && node.type.name === 'image') {
            const tr = state.tr;
            const from = pos;
            const to = pos + node.nodeSize;
            dispatch(tr.delete(from, to));
          }
        } catch (error) {
          console.error('Failed to remove image from editor:', error);
        }
      } else if (el instanceof HTMLAnchorElement) {
        // For file links, target the fileLink node wrapper instead of just the <a> tag
        try {
          // Get the current HTML content
          const currentContent = editor.getHTML();

          // Create patterns to match the entire fileLink span wrapper
          const fileId = fileMenuTarget.id;
          const patterns = [
            // Match the entire fileLink span that contains the file ID in href
            new RegExp(`<span[^>]*data-file-link="true"[^>]*data-href="[^"]*${fileId}[^"]*"[^>]*>.*?</span>`, 'gi'),
            // Alternative pattern for different attribute order
            new RegExp(`<span[^>]*data-href="[^"]*${fileId}[^"]*"[^>]*data-file-link="true"[^>]*>.*?</span>`, 'gi'),
            // Match span containing an anchor with the file ID
            new RegExp(`<span[^>]*data-file-link="true"[^>]*>.*?<a[^>]*href="[^"]*${fileId}[^"]*"[^>]*>.*?</a>.*?</span>`, 'gi'),
            // Fallback: match any span with data-file-link containing the file ID anywhere
            new RegExp(`<span[^>]*data-file-link="true"[^>]*>[^<]*<img[^>]*>[^<]*<a[^>]*${fileId}[^>]*>.*?</a>[^<]*</span>`, 'gi')
          ];

          let newContent = currentContent;
          let found = false;

          // Try each pattern
          for (let i = 0; i < patterns.length; i++) {
            const pattern = patterns[i];
            const replaced = newContent.replace(pattern, '');
            if (replaced !== newContent) {
              newContent = replaced;
              found = true;
              break;
            }
          }

          // If fileLink patterns didn't work, try the old anchor-only patterns as fallback
          if (!found) {
            const fallbackPatterns = [
              // Match full anchor tag with file ID in href
              new RegExp(`<a[^>]*href="[^"]*${fileId}[^"]*"[^>]*>.*?</a>`, 'gi'),
              // Match anchor with download or view endpoints
              new RegExp(`<a[^>]*href="[^"]*/api/files/(?:view|download|preview)/${fileId}[^"]*"[^>]*>.*?</a>`, 'gi')
            ];

            for (let i = 0; i < fallbackPatterns.length; i++) {
              const pattern = fallbackPatterns[i];
              const replaced = newContent.replace(pattern, '');
              if (replaced !== newContent) {
                newContent = replaced;
                found = true;
                break;
              }
            }
          }

          // If patterns didn't work, try to find and remove by text content
          if (!found && el.textContent) {
            const linkText = el.textContent.trim();
            if (linkText) {
              // Try to find and replace the specific link text within a fileLink span
              const textPattern = new RegExp(`<span[^>]*data-file-link="true"[^>]*>.*?<a[^>]*>${linkText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</a>.*?</span>`, 'gi');
              const textReplaced = newContent.replace(textPattern, '');
              if (textReplaced !== newContent) {
                newContent = textReplaced;
                found = true;
              }
            }
          }

          if (found) {
            // Update the editor content
            editor.commands.setContent(newContent);

            // Trigger the onUpdate callback to save the changes
            if (onUpdate) {
              setTimeout(() => {
                onUpdate(newContent);
              }, 100);
            }
          } else {
            // As a last resort, try to select and delete the current selection
            try {
              editor.chain().focus().deleteSelection().run();
            } catch { }
          }
        } catch (error) {
          console.error('Failed to remove link from editor:', error);
        }
      }

      // Close menu
      setFileMenuOpen(false);
      setFileMenuTarget(null);
      setFileMenuDropdownOpen(false);
      setFileDeleteLoading(false);
    } catch (error) {
      console.error('Error deleting attachment:', error);
      setFileDeleteLoading(false);
    }
  }, [fileMenuTarget, editor, fileDeleteLoading, deletePageFromCtx]);

  // Slash command items and filtering
  const slashItems = useCallback(() => {
    const base = [
      { key: 'text', label: 'Text', hint: 'Paragraph', run: () => editor?.chain().focus().setParagraph().run() },
      { key: 'h1', label: 'Heading 1', hint: 'Big section heading', run: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
      { key: 'h2', label: 'Heading 2', hint: 'Medium heading', run: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
      { key: 'h3', label: 'Heading 3', hint: 'Small heading', run: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
      { key: 'bulleted', label: 'Bulleted list', hint: 'List with bullets', run: () => editor?.chain().focus().toggleBulletList().run() },
      { key: 'numbered', label: 'Numbered list', hint: 'List with numbers', run: () => editor?.chain().focus().toggleOrderedList().run() },
      { key: 'todo', label: 'To-do list', hint: 'Tasks with checkboxes', run: () => editor?.chain().focus().toggleTaskList().run() },
      { key: 'table', label: 'Table', hint: 'Advanced table with custom columns', run: () => editor?.chain().focus().insertTable().run() },
      { key: 'kanban', label: 'Kanban board', hint: 'Status-driven columns', run: () => editor?.chain().focus().insertKanbanTable().run() },
      { key: 'code', label: 'Code block', hint: 'Monospaced code', run: () => editor?.chain().focus().toggleCodeBlock().run() },
      { key: 'latex', label: 'LaTeX', hint: 'Mathematical equation', run: () => { if (!editor) return; editor.chain().focus().insertContent({ type: 'mathInline', attrs: { latex: '' } }).run(); } },
      {
        key: 'linkpage', label: 'Link page', hint: 'Link existing or new page', run: () => {
          if (!editor) return;
          // Position popover near caret
          try {
            const { state, view } = editor as any;
            let coords: any = null; try { coords = view.coordsAtPos(state.selection.from); } catch { }
            const rootRect = containerRef.current?.getBoundingClientRect();
            if (rootRect && coords && Number.isFinite(coords.left) && Number.isFinite(coords.bottom)) {
              setLinkPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 12 });
            } else {
              setLinkPos(null);
            }
          } catch { setLinkPos(null); }
          setLinkQuery('');
          setLinkIndex(0);
          setLinkOpen(true);
        }
      },
      {
        key: 'youtube', label: 'YouTube', hint: 'Embed a YouTube video', run: () => {
          if (!editor) return;
          const url = prompt('Paste a YouTube or Shorts URL');
          if (!url) return;
          try {
            // Reuse helper regex and logic in extension by dispatching a paste-like insert
            const m = url.match(/^(https?:\/\/[^\s]+)$/);
            if (!m) return;
            // Best-effort local parse mirroring the extension
            const parse = (href: string) => {
              try {
                const u = new URL(href);
                const host = u.hostname.replace(/^www\./, '');
                let id: string | null = null;
                if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
                  id = u.searchParams.get('v');
                  if (!id) {
                    const mm = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
                    if (mm) id = mm[1];
                  }
                } else if (host === 'youtu.be') {
                  const mm = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/);
                  if (mm) id = mm[1];
                }
                let start: number | null = null;
                const t = u.searchParams.get('t') || u.searchParams.get('start');
                if (t) {
                  if (/^\d+$/.test(t)) start = parseInt(t, 10);
                  else {
                    const mm = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
                    if (mm) {
                      const h = mm[1] ? parseInt(mm[1], 10) : 0;
                      const min = mm[2] ? parseInt(mm[2], 10) : 0;
                      const s = mm[3] ? parseInt(mm[3], 10) : 0;
                      start = h * 3600 + min * 60 + s;
                    }
                  }
                }
                return { id, start };
              } catch { return { id: null, start: null }; }
            };
            const { id, start } = parse(url);
            if (!id) return;
            editor.chain().focus().insertContent({ type: 'youtube', attrs: { videoId: id, start } }).run();
          } catch { }
        }
      },
      { key: 'upload', label: 'Upload file', hint: 'Attach a file', run: () => pickAndUploadAtCaret() },
    ];
    const q = slashQuery.trim().toLowerCase();
    const list = !q ? base : base.filter(it => it.label.toLowerCase().includes(q) || it.key.includes(q));
    return list;
  }, [editor, slashQuery, onRequestAI]);

  // Safely compute slash items; never throw during render
  const safeSlashItems = useMemo((): { key: string; label: string; hint: string; run: () => void }[] => {
    try {
      return slashItems();
    } catch {
      return [];
    }
  }, [slashItems, slashOpen, slashQuery]);

  // Global key handler while the slash menu is open
  useEffect(() => {
    if (!slashOpen) return;
    let items: ReturnType<typeof slashItems> = [];
    try { items = slashItems(); } catch { items = []; }
    const onKey = (e: KeyboardEvent) => {
      if (!slashOpen) return;
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        setSlashIndex((i) => (i + 1) % Math.max(1, items.length));
      } else if (e.key === 'ArrowUp') {
        setSlashIndex((i) => (i - 1 + Math.max(1, items.length)) % Math.max(1, items.length));
      } else if (e.key === 'Enter') {
        const chosen = items[Math.max(0, Math.min(slashIndex, items.length - 1))];
        if (chosen && editor && slashRange && Number.isFinite(slashRange.from) && Number.isFinite(slashRange.to) && slashRange.from < slashRange.to) {
          // Remove the "/query" text then run/open
          if (slashRange && Number.isFinite(slashRange.from) && Number.isFinite(slashRange.to) && slashRange.from < slashRange.to) {
            try { editor.chain().focus().deleteRange(slashRange).run(); } catch { }
          }
          chosen.run();
        }
        setSlashOpen(false);
      } else if (e.key === 'Escape') {
        setSlashOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [slashOpen, slashIndex, slashItems, editor, slashRange]);

  // Close AI prompt popover on outside click when NOT generating (keep the Stop bar open)
  useEffect(() => {
    if (!aiOpen) return;
    const onDown = (e: MouseEvent) => {
      if (aiRunning) return; // do not close while generating
      const t = e.target as Node;
      if (aiRef.current && aiRef.current.contains(t)) return;
      if (slashRef.current && slashRef.current.contains(t)) return;
      setAiOpen(false);
      aiInsertPosRef.current = null;
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [aiOpen, aiRunning]);

  // Ensure AI popover closes when editor becomes read-only or selection becomes a node selection
  useEffect(() => {
    if (!editor) return;
    const onSel = () => {
      if (aiRunning) return; // keep bar open while generating
      if (!editor.isEditable) { if (aiOpen) setAiOpen(false); return; }
      const sel = editor.state.selection as Selection;
      if (sel instanceof NodeSelection) { if (aiOpen) setAiOpen(false); }
    };
    editor.on('selectionUpdate', onSel);
    return () => { editor.off('selectionUpdate', onSel); };
  }, [editor, aiOpen, aiRunning]);

  // Pick a file and upload it, inserting at caret when complete
  const pickAndUploadAtCaret = useCallback(() => {
    if (!editor) return;
    try { uploadInsertPosRef.current = editor.state.selection.to; } catch { uploadInsertPosRef.current = null; }
    // Position bubble near current caret
    try {
      const { state, view } = editor as any;
      let coords: any = null; try { coords = view.coordsAtPos(state.selection.from); } catch { }
      const rootRect = containerRef.current?.getBoundingClientRect();
      if (rootRect && coords && Number.isFinite(coords.left) && Number.isFinite(coords.bottom)) {
        setUploadPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 12 });
      } else {
        setUploadPos(null);
      }
    } catch { setUploadPos(null); }
    setUploadPhase('preparing');
    setUploadProgress(0);
    setUploadError('');
    // Trigger hidden file input
    const el = uploadInputRef.current;
    if (el) {
      el.value = '';
      el.click();
    }
  }, [editor]);

  // Upload dropped files at caret with inline progress, using server route
  const uploadFilesAtCaret = useCallback(async (files: File[]) => {
    if (!editor || !files || files.length === 0) return;
    try { uploadInsertPosRef.current = editor.state.selection.to; } catch { uploadInsertPosRef.current = null; }
    // Position bubble near caret
    try {
      const { state, view } = editor as any;
      let coords: any = null; try { coords = view.coordsAtPos(state.selection.from); } catch { }
      const rootRect = containerRef.current?.getBoundingClientRect();
      if (rootRect && coords && Number.isFinite(coords.left) && Number.isFinite(coords.bottom)) {
        setUploadPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 12 });
      } else {
        setUploadPos(null);
      }
    } catch { setUploadPos(null); }
    setUploadError('');
    for (const file of files) {
      if (!mountedRef.current) break;
      setUploadPhase('uploading');
      setUploadProgress(1);
      startUploadAnim(file.size);
      try {
        const fd = new FormData();
        fd.set('file', file, file.name);
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          let msg = 'Upload failed';
          try { const j = await res.json(); msg = j?.error || msg; } catch { }
          throw new Error(msg);
        }
        const data = await res.json().catch(() => ({ file: null }));
        const created: any = data?.file || null;
        const id = (created && (created.$id || created.id)) as string | undefined;
        const name = (created && (created.name || file.name)) as string;
        const mime = (created && (created.mimeType || file.type || '')) as string;
        const url = id ? `/api/files/view/${encodeURIComponent(id)}` : '';
        // Insert at caret: image for images, else a link with the filename
        try {
          const docSize = editor.state.doc.content.size;
          const posRaw = uploadInsertPosRef.current ?? editor.state.selection.to;
          const pos = Math.max(1, Math.min(Number(posRaw || 1), docSize));
          const chain = editor.chain().focus().setTextSelection({ from: pos, to: pos });
          if (mime.startsWith('image/') && url) {
            chain.setImage({ src: url, alt: name }).run();
          } else if (url) {
            // Insert a persisted inline fileLink node so the icon+name is saved
            chain.insertContent({ type: 'fileLink', attrs: { href: url, name, target: '_blank' } }).run();
          }
          try { uploadInsertPosRef.current = (editor.state.selection as any)?.to ?? null; } catch { }
        } catch { }
        stopUploadAnim();
        if (!mountedRef.current) break;
        setUploadProgress(100);
        setUploadPhase('done');
        await new Promise((r) => setTimeout(r, 600));
      } catch (e: any) {
        stopUploadAnim();
        if (!mountedRef.current) break;
        setUploadPhase('error');
        setUploadError(e?.message || 'Upload failed');
        await new Promise((r) => setTimeout(r, 1200));
      } finally {
        if (!mountedRef.current) break;
        setUploadPhase('idle');
        setUploadError('');
      }
    }
    if (mountedRef.current) setUploadPos(null);
  }, [editor, startUploadAnim, stopUploadAnim]);

  // Listen for paste image events from handlePaste
  useEffect(() => {
    const handlePasteImages = (e: Event) => {
      const customEvent = e as CustomEvent;
      const files = customEvent.detail?.files;
      if (files && Array.isArray(files) && files.length > 0) {
        uploadFilesAtCaret(files);
      }
    };

    document.addEventListener('editor-paste-images', handlePasteImages);
    return () => {
      document.removeEventListener('editor-paste-images', handlePasteImages);
    };
  }, [uploadFilesAtCaret]);

  // Accept OS file drops directly into the editor to upload at caret
  useEffect(() => {
    if (!editor) return;
    const viewAny: any = (editor as any).view;
    const root: HTMLElement | null = viewAny?.dom as HTMLElement | null;
    if (!root) return;
    const onDragOver = (e: DragEvent) => {
      try {
        // Ignore internal UI drags (pages/sections/topics reorder)
        if (document.documentElement.getAttribute('data-ui-dnd') === '1') return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl && targetEl.closest('[data-dnd-scope="ui"]')) return;
        const dt = e.dataTransfer as DataTransfer | null;
        const hasFilesType = !!dt && Array.from(dt.types || []).includes('Files');
        if (!hasFilesType) return;
        e.preventDefault();
        try { (e.dataTransfer as DataTransfer).dropEffect = 'copy'; } catch { }
      } catch { }
    };
    const onDrop = (e: DragEvent) => {
      try {
        if (document.documentElement.getAttribute('data-ui-dnd') === '1') return;
        const targetEl = e.target as HTMLElement | null;
        if (targetEl && targetEl.closest('[data-dnd-scope="ui"]')) return;
        const dt = e.dataTransfer as DataTransfer | null;
        const hasFilesType = !!dt && Array.from(dt.types || []).includes('Files');
        if (!hasFilesType) return; // ignore non-file drops entirely
        const items = Array.from(dt?.items || []);
        const onlyFiles = (dt?.files && dt.files.length > 0) && (items.length === 0 || items.every(it => it.kind === 'file'));
        const files: File[] = [];
        if (onlyFiles && dt?.files && dt.files.length > 0) {
          e.preventDefault();
          uploadFilesAtCaret(Array.from(dt.files));
          return;
        }
        // Ignore mixed drags (e.g., internal DnD for pages/sections/topics)
      } catch { }
    };
    root.addEventListener('dragover', onDragOver, true);
    root.addEventListener('drop', onDrop, true);
    return () => {
      root.removeEventListener('dragover', onDragOver, true);
      root.removeEventListener('drop', onDrop, true);
    };
  }, [editor, uploadFilesAtCaret]);

  // Insert files uploaded elsewhere (global overlay) at caret when editor is focused
  useEffect(() => {
    if (!editor) return;
    const onInsert = (e: any) => {
      if (!editor.isEditable || !editor.isFocused) return;
      const list: Array<{ id: string; name: string; mimeType?: string }> = e?.detail?.files || [];
      if (!list.length) return;
      try { uploadInsertPosRef.current = editor.state.selection.to; } catch { uploadInsertPosRef.current = null; }
      for (const f of list) {
        const url = f.id ? `/api/files/view/${encodeURIComponent(f.id)}` : '';
        const name = f.name || 'file';
        const mime = f.mimeType || '';
        const docSize = editor.state.doc.content.size;
        const posRaw = uploadInsertPosRef.current ?? editor.state.selection.to;
        const pos = Math.max(1, Math.min(Number(posRaw || 1), docSize));
        const chain = editor.chain().focus().setTextSelection({ from: pos, to: pos });
        if (mime.startsWith('image/') && url) {
          chain.setImage({ src: url, alt: name }).run();
        } else if (url) {
          chain.insertContent({ type: 'fileLink', attrs: { href: url, name, target: '_blank' } }).run();
        }
        try { uploadInsertPosRef.current = (editor.state.selection as any)?.to ?? null; } catch { }
      }
    };
    window.addEventListener('editor:insert-files', onInsert as any);
    return () => window.removeEventListener('editor:insert-files', onInsert as any);
  }, [editor]);

  // Handle hidden input change -> upload directly to Appwrite (bypasses server size limits)
  const onHiddenFilePicked = useCallback(async () => {
    const el = uploadInputRef.current;
    if (!editor || !el || !el.files || el.files.length === 0) { setUploadPhase('idle'); return; }
    const file = el.files[0];
    const MAX = 25 * 1024 * 1024; // soft cap to avoid very large client uploads
    if (file.size > MAX) {
      setUploadPhase('error');
      setUploadError('File too large (max 25 MB)');
      return;
    }
    if (mountedRef.current) { setUploadPhase('uploading'); setUploadProgress(1); startUploadAnim(file.size); }
    try {
      const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID as string | undefined;
      if (!bucketId) throw new Error('Bucket not configured (NEXT_PUBLIC_APPWRITE_BUCKET_ID)');
      // Upload directly to Appwrite from the browser. Chunking is handled by the SDK.
      const created: any = await appwriteStorage.createFile(bucketId, AppwriteID.unique(), file);
      const id = (created && (created.$id || created.id)) as string | undefined;
      const name = (created && (created.name || file.name)) as string;
      const mime = (created && (created.mimeType || file.type || '')) as string;
      const url = id ? `/api/files/view/${encodeURIComponent(id)}` : '';
      // Insert at caret: image for images, else a link with the filename
      try {
        const docSize = editor.state.doc.content.size;
        const posRaw = uploadInsertPosRef.current ?? editor.state.selection.to;
        const pos = Math.max(1, Math.min(Number(posRaw || 1), docSize));
        const chain = editor.chain().focus().setTextSelection({ from: pos, to: pos });
        if (mime.startsWith('image/') && url) {
          chain.setImage({ src: url, alt: name }).run();
        } else if (url) {
          chain.insertContent({ type: 'fileLink', attrs: { href: url, name, target: '_blank' } }).run();
        }
        try { uploadInsertPosRef.current = null; } catch { }
      } catch { }
      if (mountedRef.current) {
        stopUploadAnim();
        setUploadProgress(100);
        setUploadPhase('done');
        setTimeout(() => {
          if (!mountedRef.current) return;
          setUploadPhase('idle');
          setUploadPos(null);
          setUploadError('');
          try { if (uploadInputRef.current) uploadInputRef.current.value = ''; } catch { }
        }, 800);
      }
    } catch (e: any) {
      stopUploadAnim();
      if (mountedRef.current) {
        setUploadPhase('error');
        setUploadError(e?.message || 'Upload failed');
        setTimeout(() => {
          if (!mountedRef.current) return;
          setUploadPhase('idle'); setUploadPos(null);
        }, 1500);
      }
    }
  }, [editor]);

  // Cleanup animation on unmount
  useEffect(() => () => { try { stopUploadAnim(); } catch { } }, [stopUploadAnim]);

  // Close bubble on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        bubbleRef.current && !bubbleRef.current.contains(e.target as Node)
      ) {
        setBubblePos(null);
        setShowSizeMenu(false);
        setShowColorMenu(false);
        setShowBlockMenu(false);
        setShowFontMenu(false);
        setSizeInput('');
        setShowAiMenu(false);
        setShowToneMenu(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Helper: label for current block type
  const currentBlockLabel = () => {
    if (!editor) return 'Text';
    // If an inline heading mark is active, reflect it
    const ih = editor.getAttributes('inlineHeading');
    if (ih && ih.level === 1) return 'Heading 1';
    if (ih && ih.level === 2) return 'Heading 2';
    if (ih && ih.level === 3) return 'Heading 3';
    if (editor.isActive('heading', { level: 1 })) return 'Heading 1';
    if (editor.isActive('heading', { level: 2 })) return 'Heading 2';
    if (editor.isActive('heading', { level: 3 })) return 'Heading 3';
    if (editor.isActive('bulletList')) return 'Bulleted list';
    if (editor.isActive('orderedList')) return 'Numbered list';
    if (editor.isActive('taskList')) return 'To-do list';
    if (editor.isActive('codeBlock')) return 'Code';
    return 'Text';
  };

  // Effective default sizes per block/mark context
  const defaultSizes = { paragraph: 16, h1: 32, h2: 24, h3: 20 } as const;
  const getEffectiveFontSize = () => {
    if (!editor) return defaultSizes.paragraph;
    const ts = editor.getAttributes('textStyle');
    const fs = ts?.fontSize ? parseInt(String(ts.fontSize), 10) : undefined;
    if (Number.isFinite(fs)) return fs as number;
    const ihSize = editor.getAttributes('inlineHeading')?.fontSize;
    const fs2 = ihSize ? parseInt(String(ihSize), 10) : undefined;
    if (Number.isFinite(fs2)) return fs2 as number;
    const ih = editor.getAttributes('inlineHeading');
    if (ih?.level === 1) return defaultSizes.h1;
    if (ih?.level === 2) return defaultSizes.h2;
    if (ih?.level === 3) return defaultSizes.h3;
    if (editor.isActive('heading', { level: 1 })) return defaultSizes.h1;
    if (editor.isActive('heading', { level: 2 })) return defaultSizes.h2;
    if (editor.isActive('heading', { level: 3 })) return defaultSizes.h3;
    return defaultSizes.paragraph;
  };

  const colorPalette = [
    // Grays
    '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#000000', '#ffffff',
    // Reds
    '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c',
    // Yellows
    '#fde68a', '#fbbf24', '#f59e0b', '#d97706',
    // Greens
    '#86efac', '#4ade80', '#22c55e', '#16a34a', '#10b981',
    // Blues
    '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
    // Violets/Purples
    '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9',
    // Pinks
    '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d',
  ];

  // Ensure we don't render duplicate keys/colors
  const uniquePalette = Array.from(new Set(colorPalette));

  // Font catalog (20 fonts) and dynamic loader
  type FontGroup = 'clean' | 'minimal' | 'serif' | 'handwriting';
  const FONT_CATALOG: { name: string; css: string; google?: boolean; group: FontGroup }[] = [
    // Modern & highly readable
    { name: 'Inter', css: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif', google: true, group: 'clean' },
    { name: 'Roboto', css: 'Roboto, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'clean' },
    { name: 'Open Sans', css: 'Open Sans, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'clean' },
    { name: 'Lato', css: 'Lato, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'clean' },
    { name: 'Noto Sans', css: 'Noto Sans, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'clean' },
    // Elegant & Minimal
    { name: 'Source Sans Pro', css: 'Source Sans Pro, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'minimal' },
    { name: 'Work Sans', css: 'Work Sans, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'minimal' },
    { name: 'Manrope', css: 'Manrope, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'minimal' },
    { name: 'Mulish', css: 'Mulish, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'minimal' },
    { name: 'Poppins', css: 'Poppins, system-ui, -apple-system, Segoe UI, Arial, sans-serif', google: true, group: 'minimal' },
    // Serif (reading)
    { name: 'Merriweather', css: 'Merriweather, Georgia, Cambria, Times New Roman, serif', google: true, group: 'serif' },
    { name: 'PT Serif', css: 'PT Serif, Georgia, Cambria, Times New Roman, serif', google: true, group: 'serif' },
    { name: 'Charter', css: 'Charter, Georgia, Cambria, Times New Roman, serif', google: false, group: 'serif' },
    { name: 'Crimson Pro', css: 'Crimson Pro, Georgia, Cambria, Times New Roman, serif', google: true, group: 'serif' },
    { name: 'IBM Plex Serif', css: 'IBM Plex Serif, Georgia, Cambria, Times New Roman, serif', google: true, group: 'serif' },
    // Handwriting / Sketch
    { name: 'Caveat', css: 'Caveat, "Comic Sans MS", "Comic Sans", system-ui, cursive', google: true, group: 'handwriting' },
    { name: 'Patrick Hand', css: 'Patrick Hand, "Comic Sans MS", "Comic Sans", system-ui, cursive', google: true, group: 'handwriting' },
    { name: 'Gloria Hallelujah', css: 'Gloria Hallelujah, "Comic Sans MS", "Comic Sans", system-ui, cursive', google: true, group: 'handwriting' },
    { name: "Architect's Daughter", css: "Architect's Daughter, 'Comic Sans MS', 'Comic Sans', system-ui, cursive", google: true, group: 'handwriting' },
    { name: 'Virgil (Excalidraw)', css: 'Virgil, "Patrick Hand", "Gloria Hallelujah", cursive', google: false, group: 'handwriting' },
  ];

  const ensureFontLoaded = useCallback(async (familyName: string): Promise<boolean> => {
    try {
      if (typeof document === 'undefined') return false;
      const entry = FONT_CATALOG.find(f => f.name === familyName);
      const simple = (entry?.name || familyName || '').replace(/['"]/g, '');

      // Already available?
      try {
        if ((document as any).fonts?.check && document.fonts.check(`12px "${simple}"`)) {
          console.info('[Editor] Font already available:', simple);
          return true;
        }
      } catch { }

      // Inject Google Fonts stylesheet if needed
      if (entry?.google) {
        // Preconnects to speed up & improve reliability
        const addPreconnect = (href: string, cross: boolean) => {
          const id = `preconnect-${href.replace(/[^a-z0-9]/gi, '-')}`;
          if (document.getElementById(id)) return;
          const ln = document.createElement('link');
          ln.id = id;
          ln.rel = 'preconnect';
          ln.href = href;
          if (cross) ln.crossOrigin = 'anonymous';
          document.head.appendChild(ln);
        };
        addPreconnect('https://fonts.googleapis.com', false);
        addPreconnect('https://fonts.gstatic.com', true);
        const id = `gf-${simple.replace(/\s+/g, '-')}`;
        if (!document.getElementById(id)) {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          const gf = simple.replace(/\s+/g, '+');
          // Handwriting fonts often only ship 400; request minimal weights to avoid odd fallbacks
          const weights = entry.group === 'handwriting' ? 'wght@400' : 'wght@400;600;700';
          link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(gf)}:${weights}&display=swap`;
          document.head.appendChild(link);
          console.info('[Editor] Injected Google Fonts stylesheet for', simple, link.href);
        }
      }

      // Wait for the font to load (best effort)
      const fontAPI: any = (document as any).fonts;
      if (fontAPI?.load) {
        const weights = entry?.group === 'handwriting' ? ['400'] : ['400', '600', '700'];
        const loads = weights.map(w => fontAPI.load(`${w} 14px "${simple}"`));
        // Race with a short timeout so UI doesn't hang if the network is slow
        const timeout = new Promise<boolean>(res => setTimeout(() => res(false), 3000));
        const all = Promise.allSettled(loads).then(() => true);
        const ok = await Promise.race([all, timeout]);
        console.info('[Editor] Font load result:', simple, ok ? 'loaded' : 'timeout/fallback');
        return ok;
      }
      // Minimal delay to allow stylesheet to apply if Font Loading API isn't present
      await new Promise(res => setTimeout(res, 200));
      console.info('[Editor] Font load (no Font Loading API): assumed after delay for', simple);
      return true;
    } catch {
      console.warn('[Editor] Font load error for', familyName);
      return false;
    }
  }, []);

  const [recentColors, setRecentColors] = useState<string[]>([]);
  const applyColor = (c: string) => {
    editor?.chain().focus().setColor(c).run();
    setShowColorMenu(false);
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((x) => x !== c)];
      return next.slice(0, 8);
    });
  };

  const currentFontLabel = () => {
    if (!editor) return 'Font';
    const fam = (editor.getAttributes('textStyle')?.fontFamily || '').toString();
    if (!fam) return 'Font';
    // Try to map to known label
    const hit = FONT_CATALOG.find(f => fam.includes(f.name));
    return hit ? hit.name : fam.replace(/['"]/g, '').split(',')[0];
  };

  const applyFontFamily = async (name: string) => {
    if (!editor) return;
    const item = FONT_CATALOG.find(f => f.name === name);
    const css = item ? item.css : name;
    const isHand = (item?.group === 'handwriting');

    // Wait for the chosen font to be available to avoid rendering with the fallback
    let loaded = false;
    try { loaded = await ensureFontLoaded(name); } catch { loaded = false; }

    const sel = preservedSelectionRef.current;
    const chain = editor.chain().focus();
    if (sel && Number.isFinite(sel.from) && Number.isFinite(sel.to) && sel.from <= sel.to) {
      chain.setTextSelection({ from: sel.from, to: sel.to });
    }
    chain.setFontFamily(css);
    // If handwriting font, keep weight at 400 to avoid synthetic bold/fallback in headings
    try {
      if (isHand) {
        chain.updateAttributes('textStyle', { fontWeight: '400' });
      } else {
        chain.updateAttributes('textStyle', { fontWeight: null as any });
      }
    } catch { }
    chain.run();
    // Debug: log computed font actually rendered at selection start
    try {
      const viewAny: any = (editor as any).view;
      const pos = (editor.state.selection as any)?.from ?? 0;
      const domAt = viewAny?.domAtPos ? viewAny.domAtPos(Math.max(1, Math.min(pos, editor.state.doc.content.size))) : null;
      const node = (domAt && (domAt.node instanceof Element ? domAt.node : (domAt.node?.parentElement || null))) as HTMLElement | null;
      const el = node?.closest && node.closest('span, p, h1, h2, h3, h4, h5, h6');
      if (el) {
        const cs = window.getComputedStyle(el as Element);
        const fam = cs.fontFamily;
        const wt = cs.fontWeight;
        const font = cs.font;
        const simple = (item?.name || name).replace(/['"]/g, '');
        let chk400 = false, chk700 = false;
        try {
          if ((document as any).fonts?.check) {
            chk400 = (document as any).fonts.check(`400 14px "${simple}"`);
            chk700 = (document as any).fonts.check(`700 14px "${simple}"`);
          }
        } catch { }
        console.info('[Editor] Rendered font after apply:', { requested: name, css, fam, wt, font, available: { w400: chk400, w700: chk700 } });
      }
    } catch { }
    if (!loaded) {
      // Attempt a post-load refresh if the font finishes a bit later
      try {
        if ((document as any).fonts?.ready) {
          (document as any).fonts.ready.then(() => {
            try {
              const s = preservedSelectionRef.current;
              const ch = editor.chain().focus();
              if (s && Number.isFinite(s.from) && Number.isFinite(s.to) && s.from <= s.to) {
                ch.setTextSelection({ from: s.from, to: s.to });
              }
              ch.setFontFamily(css);
              if (isHand) { try { ch.updateAttributes('textStyle', { fontWeight: '400' }); } catch { } }
              ch.run();
            } catch { }
          });
        }
      } catch { }
    }
    setShowFontMenu(false);
  };

  // Apply heading only to the current selection. If the selection is non-empty,
  // replace just that range with a standalone heading block (splitting the
  // surrounding paragraph automatically). If the selection is empty, fall back
  // to the regular toggleHeading behavior on the current block.
  const setHeadingSmart = (level: 1 | 2 | 3) => {
    if (!editor) return;
    const { state } = editor;
    const sel = state.selection as Selection & { $from: any; $to: any };
    const { from, to, empty, $from, $to } = sel;

    // Caret only: toggle heading on the current block
    if (empty) {
      editor.chain().focus().toggleHeading({ level }).run();
      // Nudge size UI to reflect new block
      requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize())));
      return;
    }

    // If selection spans the entire current text block (ignoring surrounding whitespace),
    // convert the block to a heading. Otherwise, apply inline heading-like styles to avoid
    // breaking the paragraph into multiple lines.
    const sameParent = $from.parent === $to.parent && $from.parent?.isTextblock;
    let coversEntireBlock = false;
    if (sameParent) {
      const blockStart = $from.start();
      const blockEnd = $from.end();
      const left = state.doc.textBetween(blockStart, from, '\n');
      const right = state.doc.textBetween(to, blockEnd, '\n');
      coversEntireBlock = left.trim().length === 0 && right.trim().length === 0;
    }

    if (coversEntireBlock) {
      editor.chain().focus().toggleHeading({ level }).run();
      requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize())));
      return;
    }

    // Inline fallback: emulate a heading visually without changing block structure.
    // Toggle if the same level is already applied.
    const activeLevel = editor.getAttributes('inlineHeading')?.level;
    const chain = editor.chain().focus();
    if (activeLevel === level) {
      chain.unsetMark('inlineHeading').run();
    } else {
      chain.unsetMark('inlineHeading').setMark('inlineHeading', { level }).run();
    }
    requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize())));
  };

  // Convert current block to plain paragraph, unwrapping lists/tasks/code if active
  const convertToParagraph = () => {
    if (!editor) return;
    const { state } = editor;
    const sel = state.selection as Selection & { $from: any; $to: any };
    const { from, to, empty, $from, $to } = sel;

    const chain = editor.chain().focus();
    // Always clear inline heading styling on selection
    chain.unsetMark('inlineHeading');

    // If selection is within a heading and only covers part of that block, split the heading
    // at the selection boundaries and convert only the middle piece to a paragraph.
    const sameParent = $from.parent === $to.parent && $from.parent?.isTextblock;
    const inHeading = $from.parent?.type?.name === 'heading' && $to.parent?.type?.name === 'heading';
    if (!empty && sameParent && inHeading) {
      // Check whether selection already covers the entire block
      const blockStart = $from.start();
      const blockEnd = $from.end();
      const left = state.doc.textBetween(blockStart, from, '\n');
      const mid = state.doc.textBetween(from, to, '\n');
      const right = state.doc.textBetween(to, blockEnd, '\n');
      const coversEntireBlock = left.trim().length === 0 && right.trim().length === 0;
      if (!coversEntireBlock) {
        const level = editor.getAttributes('heading')?.level ?? 1;
        const content: any[] = [];
        if (left) content.push({ type: 'text', text: left, marks: [{ type: 'inlineHeading', attrs: { level } }] });
        if (mid) content.push({ type: 'text', text: mid });
        if (right) content.push({ type: 'text', text: right, marks: [{ type: 'inlineHeading', attrs: { level } }] });
        const paragraphNode = { type: 'paragraph', content } as any;
        editor
          .chain()
          .focus()
          .setTextSelection({ from: blockStart, to: blockEnd })
          .insertContent(paragraphNode)
          .run();
        return;
      }
    }

    // Block-level conversions for whole block or when not in heading
    if (editor.isActive('taskList')) { chain.toggleTaskList().run(); requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize()))); return; }
    if (editor.isActive('bulletList')) { chain.toggleBulletList().run(); requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize()))); return; }
    if (editor.isActive('orderedList')) { chain.toggleOrderedList().run(); requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize()))); return; }
    if (editor.isActive('codeBlock')) { chain.toggleCodeBlock().run(); requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize()))); return; }
    chain.setParagraph().run();
    requestAnimationFrame(() => setSizeInput(String(getEffectiveFontSize())));
  };

  // Preprocess markdown before parsing:
  // - Remap ATX heading markers so more #'s means bigger heading (### => H1, ## => H2, # => H3)
  // - Do NOT touch content inside fenced code blocks (``` or ~~~) or inline code (`...`).
  const preprocessMarkdownForPaste = (src: string) => {
    // Normalize newlines to simplify regex processing
    let text = src.replace(/(\r\n|\r)/g, '\n');

    // Protect fenced code blocks first (```lang ... ``` or ~~~ ... ~~~)
    // We replace them with unique placeholders and restore later.
    const placeholders: string[] = [];
    const makeToken = (i: number) => `\u0000MD_BLK_${i}_\u0000`;
    const protect = (pattern: RegExp) => {
      text = text.replace(pattern, (m) => {
        const idx = placeholders.length;
        placeholders.push(m);
        return makeToken(idx);
      });
    };

    // Fenced blocks: use backreferences to ensure same fence is closed
    protect(/(```|~~~)[\s\S]*?\1/g);

    // Protect inline code spans (single backticks without newline)
    protect(/`[^`\n]*`/g);

    // Now safely remap headings in the remaining (non-code) text
    text = text.replace(/^(\s{0,3})(#{1,6})(\s+)/gm, (_m, lead: string, hashes: string, space: string) => {
      const n = hashes.length;
      const level = n >= 3 ? 1 : n === 2 ? 2 : 3;
      return `${lead}${'#'.repeat(level)}${space}`;
    });

    // Heuristic: language hint line (e.g., 'cpp' or 'c++') followed by code without fences.
    // Wrap that block into a fenced code block so angle brackets render and get highlighted.
    // We capture until the next blank line (two newlines) or end of text.
    text = text.replace(/(?:^|\n)(cpp|c\+\+)\n([\s\S]*?)(?=\n{2,}|$)/g, (_m, _lang: string, body: string) => {
      const code = (body || '').replace(/\s+$/, '');
      if (!code.trim()) return _m; // nothing to wrap
      return `\n\u0060\u0060\u0060cpp\n${code}\n\u0060\u0060\u0060\n`;
    });

    // Restore placeholders in order
    placeholders.forEach((original, i) => {
      text = text.replace(makeToken(i), original);
    });

    return text;
  };

  // Heuristic: detect plain-code (especially C/C++) pasted without Markdown fences
  const detectLanguageFromText = (t: string): string | undefined => {
    const text = t.toString();
    if (/#include\s*<[^>]+>/.test(text) || /\bstd::/.test(text) || /using\s+namespace\s+std\b/.test(text) || /template\s*<[^>]+>/.test(text)) return 'cpp';
    if (/\bSystem\.out\.println\b|public\s+class\s+\w+/.test(text)) return 'java';
    if (/^\s*def\s+\w+\(.*\):/m.test(text)) return 'python';
    if (/\bconsole\.log\b|\bfunction\b/.test(text)) return 'javascript';
    if (/#include\s+"[^"]+"/.test(text)) return 'c';
    return undefined;
  };

  const isLikelyCodeBlock = (t: string): boolean => {
    const s = t.replace(/\r\n?/g, '\n');
    const lines = s.split('\n');
    if (lines.length < 3) return false;
    const codeLine = /(;\s*$)|(^\s*#include\b)|([{}]\s*$)|(^\s*(class|struct|template|public:|private:|protected:)\b)/;
    let hits = 0;
    for (const l of lines) {
      if (codeLine.test(l)) hits++;
    }
    return hits / lines.length >= 0.35;
  };

  // Extract a direct image URL from common wrapper links (e.g., Google Images imgres?).
  // Returns a validated image URL or null when none is found.
  const extractDirectImageUrl = (raw: string): string | null => {
    if (!raw) return null;
    const s = raw.trim();
    const directRe = /^(https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg))(?:\?[^\s]*)?$/i;
    if (directRe.test(s)) return s;
    // Try parsing the URL and look for query params that hold the real image URL
    try {
      const u = new URL(s);
      const keys = ['imgurl', 'url', 'mediaurl', 'image', 'img', 'src', 'u'];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (!v) continue;
        try {
          const dec = decodeURIComponent(v);
          if (directRe.test(dec)) return dec;
        } catch {
          if (directRe.test(v)) return v;
        }
      }
      // Fallback: scan the whole string for a direct image URL
      const m = s.match(/https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s]*)?/i);
      if (m && m[0]) return m[0];
    } catch {
      // Not a proper URL; still try regex fallback
      const m = s.match(/https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s]*)?/i);
      if (m && m[0]) return m[0];
    }
    return null;
  };

  // Collect possible image URL candidates from a wrapper URL, even if they lack extensions.
  const getCandidateImageUrls = (raw: string): string[] => {
    const out: string[] = [];
    if (!raw) return out;
    const s = raw.trim();
    try {
      const u = new URL(s);
      const keys = ['imgurl', 'url', 'mediaurl', 'image', 'img', 'src', 'u'];
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (!v) continue;
        try { out.push(decodeURIComponent(v)); } catch { out.push(v); }
      }
    } catch { /* not a URL */ }
    // Also scan entire string for embedded URLs
    const matches = s.match(/https?:\/\/\S+/g) || [];
    for (const m of matches) out.push(m);
    // Always include the original last
    out.push(s);
    // Dedupe while preserving order
    return Array.from(new Set(out));
  };

  // Quick probe to see if a URL actually loads as an <img> within a short timeout
  const quickLoadImage = (url: string, timeoutMs = 1600): Promise<boolean> => {
    return new Promise((resolve) => {
      let settled = false;
      const img = new (globalThis as any).Image();
      const done = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
      img.onload = () => done(true);
      img.onerror = () => done(false);
      try { img.referrerPolicy = 'no-referrer'; } catch { }
      img.src = url;
      setTimeout(() => done(false), timeoutMs);
    });
  };

  if (!isMounted) {
    return (
      <div className={`${className} min-h-[200px] bg-gray-50 rounded animate-pulse`}>
        Loading editor...
      </div>
    );
  }

  if (!editor) {
    if (fallbackMode) {
      return (
        <div className={`${className} editor-container relative`}>
          <div className="mb-2 text-sm text-gray-600">Editor failed to initialize. Using basic input.</div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="min-h-[200px] p-3 bg-white border border-gray-200 rounded outline-none focus:ring-2 focus:ring-indigo-200 whitespace-pre-wrap"
            onInput={(e) => {
              const text = (e.target as HTMLElement).innerText || '';
              onUpdate?.(text);
            }}
          >{content}</div>
        </div>
      );
    }
    return null;
  }

  // Calculate word count from editor content
  const getWordCount = () => {
    if (!editor) return 0;
    const text = editor.getText();
    return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  };

  // Get character count from editor
  const getCharacterCount = () => {
    return editor ? editor.storage.characterCount?.characters() || 0 : 0;
  };

  return (
    <EditorErrorBoundary>
      <div ref={containerRef} className={`${className} editor-container relative`}>
        {/* Removed the floating word count display */}
        {/* drag-guide overlay removed */}
        {editor.isEditable && bubblePos && (
          <div
            ref={bubbleRef}
            className={`absolute z-50 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-md rounded-md p-1 cursor-default select-none ${draggingSelection ? 'pointer-events-none' : ''}`}
            style={{ top: bubblePos.top, left: bubblePos.left, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => {
              const t = e.target as HTMLElement;
              // Allow focusing inputs/selects inside the bubble (e.g., size field, color picker)
              if (t.closest('input, textarea, select')) return;
              // Snapshot current selection so menu clicks don't collapse it
              try {
                if (editor) {
                  const sel = editor.state.selection as any;
                  preservedSelectionRef.current = { from: sel.from, to: sel.to };
                }
              } catch { }
              e.preventDefault();
            }}
          >
            <div className="flex items-center gap-1" onMouseEnter={() => setSizeInput(String(getEffectiveFontSize()))}>
              {/* Block type dropdown */}
              <div className="relative">
                <button
                  onClick={() => { setShowBlockMenu((v) => !v); setShowColorMenu(false); }}
                  className="px-2 py-1 rounded text-sm border border-gray-200 bg-white hover:bg-gray-50 inline-flex items-center gap-1 whitespace-nowrap"
                  title="Block type"
                >
                  <span>{currentBlockLabel()}</span>
                  <span className="ml-1">▾</span>
                </button>
                {showBlockMenu && (
                  <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg p-1 z-50">
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => { convertToParagraph(); setShowBlockMenu(false); }}>Text</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => { setHeadingSmart(1); setShowBlockMenu(false); }}>Heading 1</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => { setHeadingSmart(2); setShowBlockMenu(false); }}>Heading 2</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => { setHeadingSmart(3); setShowBlockMenu(false); }}>Heading 3</button>
                    <div className="h-px bg-gray-200 my-1" />
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2" onClick={() => { editor.chain().focus().toggleBulletList().run(); setShowBlockMenu(false); }}><FiList /> Bulleted list</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2" onClick={() => { editor.chain().focus().toggleOrderedList().run(); setShowBlockMenu(false); }}><FiHash /> Numbered list</button>
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2" onClick={() => { editor.chain().focus().toggleTaskList().run(); setShowBlockMenu(false); }}><FiCheckSquare /> To-do list</button>
                    <div className="h-px bg-gray-200 my-1" />
                    <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center gap-2" onClick={() => { editor.chain().focus().toggleCodeBlock().run(); setShowBlockMenu(false); }}><FiCode /> Code</button>
                  </div>
                )}
              </div>

              {/* Text size control: inline editable + presets dropdown in a single box */}
              <div className="relative">
                <div className="flex items-center rounded border border-gray-200 bg-white">
                  <input
                    type="number"
                    min={2}
                    max={50}
                    step={2}
                    value={sizeInput || String(getEffectiveFontSize())}
                    onFocus={() => setSizeInput(String(getEffectiveFontSize()))}
                    onChange={(e) => setSizeInput(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const n = Math.max(2, Math.min(50, parseInt((sizeInput || '0'), 10)));
                        if (!Number.isFinite(n)) return;
                        const ch = editor.chain().focus();
                        ch.unsetMark('textStyle').setMark('textStyle', { fontSize: `${n}px` });
                        if (editor.isActive('inlineHeading')) {
                          try { ch.updateAttributes('inlineHeading', { fontSize: `${n}px` }); } catch { }
                        }
                        ch.run();
                        setShowSizeMenu(false);
                        // Keep the input reflecting what was applied
                        setSizeInput(String(n));
                      }
                    }}
                    onBlur={() => {
                      if (!sizeInput) return;
                      const n = Math.max(2, Math.min(50, parseInt((sizeInput || '0'), 10)));
                      if (!Number.isFinite(n)) return;
                      const ch = editor.chain().focus();
                      ch.unsetMark('textStyle').setMark('textStyle', { fontSize: `${n}px` });
                      if (editor.isActive('inlineHeading')) {
                        try { ch.updateAttributes('inlineHeading', { fontSize: `${n}px` }); } catch { }
                      }
                      ch.run();
                      setSizeInput(String(n));
                    }}
                    className="w-[4ch] pl-2.5 pr-1 py-1.5 text-sm bg-transparent focus:outline-none input-number-nospin"
                    title="Text size"
                  />
                  <button
                    onClick={() => {
                      const opening = !showSizeMenu;
                      setShowSizeMenu(opening);
                      setShowBlockMenu(false);
                      setShowColorMenu(false);
                      if (opening) setSizeInput(String(getEffectiveFontSize()));
                    }}
                    className="px-2 py-1.5 text-sm bg-transparent hover:bg-gray-50"
                    title="Text size presets"
                    aria-label="Open size presets"
                  >
                    ▾
                  </button>
                </div>
                {showSizeMenu && (
                  <div className="absolute left-0 mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                    <div className="max-h-64 overflow-auto p-1">
                      <button
                        className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-xs"
                        onClick={() => {
                          const ch = editor.chain().focus();
                          // Clear textStyle fontSize for the current selection only
                          try { ch.updateAttributes('textStyle', { fontSize: null as any }); } catch { }
                          // Also clear inlineHeading fontSize if present
                          if (editor.isActive('inlineHeading')) {
                            try { ch.updateAttributes('inlineHeading', { fontSize: null as any }); } catch { }
                          }
                          ch.run();
                          setShowSizeMenu(false);
                        }}
                      >Default</button>
                      <div className="h-px bg-gray-200 my-1" />
                      {Array.from({ length: 25 }, (_, i) => (i + 1) * 2).map((n) => (
                        <button
                          key={`sz-${n}`}
                          className="w-full text-left px-2 py-0.5 rounded hover:bg-gray-100 text-xs"
                          onClick={() => {
                            const ch = editor.chain().focus();
                            // Apply a textStyle fontSize to the current selection only
                            ch.unsetMark('textStyle').setMark('textStyle', { fontSize: `${n}px` });
                            // If inlineHeading is present, sync its fontSize too so inline headings reflect size
                            if (editor.isActive('inlineHeading')) {
                              try { ch.updateAttributes('inlineHeading', { fontSize: `${n}px` }); } catch { }
                            }
                            ch.run();
                            setShowSizeMenu(false);
                          }}
                        >{n}</button>
                      ))}
                      {/* Note: custom value now editable in the inline field; presets remain here */}
                    </div>
                  </div>
                )}
              </div>

              {/* Font family picker with search */}
              <div className="relative">
                <button
                  onMouseDown={() => {
                    try {
                      if (editor) {
                        const sel = editor.state.selection as any;
                        preservedSelectionRef.current = { from: sel.from, to: sel.to };
                      }
                    } catch { }
                  }}
                  onClick={() => {
                    const opening = !showFontMenu;
                    setShowFontMenu(opening);
                    setShowBlockMenu(false);
                    setShowColorMenu(false);
                    setShowSizeMenu(false);
                    setFontQuery('');
                    if (opening) setTimeout(() => fontSearchRef.current?.focus(), 0);
                  }}
                  className="px-2 py-1 rounded text-sm border border-gray-200 bg-white hover:bg-gray-50 inline-flex items-center gap-1 whitespace-nowrap max-w-48"
                  title="Font family"
                >
                  <span className="truncate max-w-36">{currentFontLabel()}</span>
                  <span className="ml-1">▾</span>
                </button>
                {showFontMenu && (
                  <div
                    className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-md shadow-lg p-1 z-50"
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                      const t = e.target as HTMLElement;
                      // Keep ability to focus the search input; otherwise prevent blur
                      if (!t.closest('input, textarea, select')) {
                        e.preventDefault();
                      }
                      e.stopPropagation();
                    }}
                  >
                    <div className="px-1 pb-1">
                      <input
                        ref={fontSearchRef}
                        type="text"
                        value={fontQuery}
                        onChange={(e) => setFontQuery(e.target.value)}
                        placeholder="Search fonts…"
                        className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {/* Recent section removed as requested */}
                    <div className="max-h-64 overflow-auto">
                      {(() => {
                        const q = fontQuery.trim().toLowerCase();
                        const list = FONT_CATALOG.filter(f => f.name.toLowerCase().includes(q));
                        const groups: Record<FontGroup, string> = { clean: 'Clean', minimal: 'Minimal', serif: 'Serif', handwriting: 'Handwriting' };
                        (['clean', 'minimal', 'serif', 'handwriting'] as FontGroup[]).forEach(() => { }); // type keepalive
                        const order: FontGroup[] = ['clean', 'minimal', 'serif', 'handwriting'];
                        return (
                          <div key="font-groups">
                            {order.map((g) => {
                              const items = list.filter(f => f.group === g);
                              if (items.length === 0) return null;
                              return (
                                <div key={`grp-${g}`} className="mb-1">
                                  <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-gray-500">{groups[g]}</div>
                                  {items.map((f) => (
                                    <button
                                      key={f.name}
                                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 flex items-center justify-between"
                                      onClick={() => applyFontFamily(f.name)}
                                      title={f.name}
                                    >
                                      <span style={{ fontFamily: f.css }} className="truncate">{f.name}</span>
                                      {f.google ? <span className="text-[10px] text-gray-400">Google</span> : null}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center justify-between mt-1 px-1">
                      <button
                        onClick={() => { editor.chain().focus().unsetFontFamily().run(); setShowFontMenu(false); }}
                        className="text-xs text-gray-700 hover:underline"
                      >Reset</button>
                      <button
                        onClick={() => setShowFontMenu(false)}
                        className="text-xs text-gray-700 hover:underline"
                      >Close</button>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-5 w-px bg-gray-300 mx-1" />

              {/* Inline formatting */}
              <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1 rounded ${editor.isActive('bold') ? 'bg-gray-200' : 'hover:bg-gray-100'}`} title="Bold"><FiBold /></button>
              <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1 rounded ${editor.isActive('italic') ? 'bg-gray-200' : 'hover:bg-gray-100'}`} title="Italic"><FiItalic /></button>
              <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1 rounded ${editor.isActive('underline') ? 'bg-gray-200' : 'hover:bg-gray-100'}`} title="Underline"><FiUnderline /></button>
              <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-1 rounded ${editor.isActive('strike') ? 'bg-gray-200' : 'hover:bg-gray-100'}`} title="Strikethrough"><TbStrikethrough /></button>
              <button onClick={() => {
                const prev = editor.getAttributes('link').href;
                const url = window.prompt('URL', prev || '');
                if (url === null) return;
                if (url === '') {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                } else {
                  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
                }
              }} className={`p-1 rounded ${editor.isActive('link') ? 'bg-gray-200' : 'hover:bg-gray-100'}`} title="Link"><FiLink /></button>

              {/* Text color */}
              <div className="relative">
                <button
                  onClick={() => { setShowColorMenu((v) => !v); setShowBlockMenu(false); }}
                  className="px-2 py-1 rounded text-sm border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  title="Text color"
                >
                  <span className="font-semibold" style={{ color: editor.getAttributes('textStyle')?.color || '#111827' }}>A</span>
                  <span className="ml-1">▾</span>
                </button>
                {showColorMenu && (
                  <div className="absolute left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-2 z-50 w-64">
                    {/* Recent */}
                    {recentColors.length > 0 && (
                      <div className="mb-2">
                        <div className="text-[11px] text-gray-500 mb-1">Recent</div>
                        <div className="grid grid-cols-8 gap-2">
                          {recentColors.map((c) => (
                            <button key={c} onClick={() => applyColor(c)} className="w-5 h-5 rounded cursor-pointer" style={{ backgroundColor: c }} title={c} />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* All colors */}
                    <div className="text-[11px] text-gray-500 mb-1">Colors</div>
                    <div className="grid grid-cols-10 gap-2 max-h-40 overflow-auto pr-1">
                      {uniquePalette.map((c, i) => (
                        <button key={`${c}-${i}`} onClick={() => applyColor(c)} className="w-5 h-5 rounded border border-gray-100 cursor-pointer" style={{ backgroundColor: c }} title={c} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <button
                        onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorMenu(false); }}
                        className="text-xs text-gray-700 hover:underline cursor-pointer"
                        title="Reset color"
                      >Reset</button>
                      <input
                        type="color"
                        className="w-6 h-6 p-0 border border-gray-200 rounded cursor-pointer"
                        onChange={(e) => applyColor(e.target.value)}
                        title="Custom color"
                      />
                    </div>
                  </div>
                )}
              </div>


              {/* AI caret actions */}
              <div className="relative" ref={aiMenuAnchorRef}>
                <button
                  onClick={() => { setShowAiMenu((v) => !v); setShowToneMenu(false); setShowBlockMenu(false); setShowColorMenu(false); }}
                  className="px-2 py-1 rounded text-sm border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer inline-flex items-center gap-1 whitespace-nowrap"
                  title="AI actions"
                >
                  <span>AI</span>
                  <span className="ml-1">▾</span>
                </button>
                {showAiMenu && (
                  <div
                    className="absolute left-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg p-1 z-50"
                    onMouseLeave={() => setShowToneMenu(false)}
                  >
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
                      onMouseEnter={() => setShowToneMenu(false)}
                      onClick={() => {
                        if (!editor) return; const sel = editor.state.selection as Selection; const from = (sel as any).from; const to = (sel as any).to; if (from === to) return; const text = editor.state.doc.textBetween(from, to, '\n', '\ufffc');
                        const prompt = `Rewrite the following text to be longer, more detailed, and clearer. Retain original meaning and keep markdown structure. Output only the rewritten text as markdown.\n\nTEXT:\n"""\n${text}\n"""`;
                        runAITransformReplace(prompt);
                        setShowAiMenu(false);
                      }}>Make longer</button>
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
                      onMouseEnter={() => setShowToneMenu(false)}
                      onClick={() => {
                        if (!editor) return; const sel = editor.state.selection as Selection; const from = (sel as any).from; const to = (sel as any).to; if (from === to) return; const text = editor.state.doc.textBetween(from, to, '\n', '\ufffc');
                        const prompt = `Rewrite the following text to be shorter and more concise while preserving meaning. Keep essential information and markdown structure. Output only the rewritten text as markdown.\n\nTEXT:\n"""\n${text}\n"""`;
                        runAITransformReplace(prompt);
                        setShowAiMenu(false);
                      }}>Make shorter</button>
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
                      onMouseEnter={() => setShowToneMenu(false)}
                      onClick={() => { runExplainForSelection(); setShowAiMenu(false); }}
                    >Explain</button>
                    <div className="relative">
                      <button className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onMouseEnter={() => setShowToneMenu(true)} onClick={() => setShowToneMenu((v) => !v)}>Change tone ▸</button>
                      {showToneMenu && (
                        <div className="absolute top-0 left-full ml-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg p-1 z-50">
                          {['professional', 'casual', 'friendly'].map((tone) => (
                            <button key={tone} className="w-full text-left px-2 py-1 rounded hover:bg-gray-100" onClick={() => {
                              if (!editor) return; const sel = editor.state.selection as Selection; const from = (sel as any).from; const to = (sel as any).to; if (from === to) return; const text = editor.state.doc.textBetween(from, to, '\n', '\ufffc');
                              const prompt = `Rewrite the following text in a ${tone} tone. Preserve meaning and keep markdown formatting. Output only the rewritten text as markdown.\n\nTEXT:\n"""\n${text}\n"""`;
                              runAITransformReplace(prompt);
                              setShowAiMenu(false); setShowToneMenu(false);
                            }}>{tone[0].toUpperCase() + tone.slice(1)}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="h-px bg-gray-200 my-1" />
                    <button
                      className="w-full text-left px-2 py-1 rounded hover:bg-gray-100"
                      onMouseEnter={() => setShowToneMenu(false)}
                      onClick={() => {
                        if (!editor) return; const sel = editor.state.selection as Selection; const from = (sel as any).from; const to = (sel as any).to; if (from === to) return; const text = editor.state.doc.textBetween(from, to, '\n', '\ufffc');
                        aiEditSelectionRef.current = { from, to, text };
                        // Open the existing AI prompt bar near the bubble position
                        const rootRect = containerRef.current?.getBoundingClientRect();
                        try {
                          let coords: any = null; try { coords = editor.view.coordsAtPos(to); } catch { }
                          if (rootRect) setAiPos({ left: coords.left - rootRect.left, top: coords.bottom - rootRect.top + 12 });
                        } catch { }
                        setAiOpen(true);
                        setAiPrompt('');
                        setShowAiMenu(false);
                        setTimeout(() => aiInputRef.current?.focus(), 0);
                      }}>Edit…</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Floating menu disabled: only show bubble menu when text is selected */}

        <div
          onPasteCapture={(e) => {
            if (!editor) return;
            if (!editor.isEditable) return; // block paste in view-only
            const data = (e as React.ClipboardEvent<HTMLDivElement>).clipboardData;
            if (!data) return;
            const types = Array.from(data.types || []);
            const md = data.getData('text/markdown');
            const plain = data.getData('text/plain');
            const source = md || plain || '';
            // If the clipboard contains a single URL, try to extract and insert an image first
            const maybeUrl = (source || '').trim();
            if (/^https?:\/\/\S+$/i.test(maybeUrl)) {
              const direct = extractDirectImageUrl(maybeUrl);
              if (direct) {
                e.preventDefault();
                editor.chain().focus().setImage({ src: direct }).run();
                return;
              }
              // YouTube: embed video instead of plain link
              try {
                const u = new URL(maybeUrl);
                const host = u.hostname.replace(/^www\./, '');
                let ytId: string | null = null; let start: number | null = null;
                if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
                  ytId = u.searchParams.get('v');
                  if (!ytId) {
                    const m = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
                    if (m) ytId = m[1];
                  }
                } else if (host === 'youtu.be') {
                  const m = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/);
                  if (m) ytId = m[1];
                }
                const t = u.searchParams.get('t') || u.searchParams.get('start');
                if (t) {
                  if (/^\d+$/.test(t)) start = parseInt(t, 10);
                  else {
                    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
                    if (m) {
                      const h = m[1] ? parseInt(m[1], 10) : 0;
                      const min = m[2] ? parseInt(m[2], 10) : 0;
                      const s = m[3] ? parseInt(m[3], 10) : 0;
                      start = h * 3600 + min * 60 + s;
                    }
                  }
                }
                if (ytId) {
                  e.preventDefault();
                  const type = (editor as any)?.schema?.nodes?.['youtube'];
                  if (type) editor.chain().focus().insertContent({ type: 'youtube', attrs: { videoId: ytId, start } }).run();
                  else editor.chain().focus().insertContent(maybeUrl).run();
                  return;
                }
              } catch { }
              // Try probing likely candidates without file extensions (e.g., googleusercontent)
              const candidates = getCandidateImageUrls(maybeUrl);
              if (candidates.length > 0) {
                e.preventDefault();
                // Limit to the first 3 candidates to avoid long delays
                const limited = candidates.slice(0, 3);
                (async () => {
                  for (const c of limited) {
                    const ok = await quickLoadImage(c);
                    if (ok) {
                      editor.chain().focus().setImage({ src: c }).run();
                      return;
                    }
                  }
                  // Fallback: insert as a clickable link
                  editor
                    .chain()
                    .focus()
                    .insertContent({ type: 'text', text: maybeUrl, marks: [{ type: 'link', attrs: { href: maybeUrl } }] })
                    .run();
                })();
                return;
              }
            }
            // If rich HTML is available and we didn't detect a direct image URL, let Tiptap handle it
            if (types.includes('text/html')) {
              return;
            }
            // Direct image URL paste -> insert as image
            const url = (source || '').trim();
            if (/^(https?:\/\/[^\s]+\.(png|jpe?g|gif|webp|svg))(\?[^\s]*)?$/i.test(url)) {
              e.preventDefault();
              editor.chain().focus().setImage({ src: url }).run();
              return;
            }
            const seemsMarkdown = /(\n|^)(\s{0,3}#{1,6}\s)|(^|\n)[-*_]{3,}\s*$|(```[\s\S]*?```)|(^|\n)[0-9]+\.\s|(^|\n)[-+*]\s|(^|\n)>\s/.test(source);
            if (seemsMarkdown) {
              e.preventDefault();
              const preprocessed = preprocessMarkdownForPaste(source);
              const rendered = marked.parse(preprocessed, { breaks: true, gfm: true }) as string;
              editor.chain().focus().insertContent(rendered).run();
              return;
            }
            // If not markdown but looks like code (e.g., C++), insert as a codeBlock with detected language
            const trimmed = (plain || '').trim();
            if (trimmed && isLikelyCodeBlock(trimmed)) {
              e.preventDefault();
              const langGuess = detectLanguageFromText(trimmed) || 'cpp';
              const text = trimmed.replace(/\r\n?/g, '\n');
              editor
                .chain()
                .focus()
                .insertContent({
                  type: 'codeBlock',
                  attrs: { language: langGuess },
                  content: [{ type: 'text', text }],
                })
                .run();
            }
          }}
        >
          <EditorContent editor={editor}
            onClickCapture={(e) => {
              // Intercept internal page links with href like "#page:<id>"
              const t = e.target as HTMLElement;
              const a = t.closest('a') as HTMLAnchorElement | null;
              if (!a) return;
              const href = a.getAttribute('href') || '';
              if (href.startsWith('#page:')) {
                const pageId = href.slice('#page:'.length);
                const evt = e as unknown as MouseEvent;
                const isNewTab = (evt.ctrlKey || (evt as any).metaKey || evt.button === 1 || a.target === '_blank');
                if (isNewTab) {
                  try { setFileMenuOpen(false); setFileMenuDropdownOpen(false); setFileMenuTarget(null); } catch { }
                  try { window.sessionStorage.setItem('onenot:pendingPageId', pageId); } catch { }
                  try { window.open('/notebooks', '_blank'); } catch { }
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                e.preventDefault();
                try { setFileMenuOpen(false); setFileMenuDropdownOpen(false); setFileMenuTarget(null); } catch { }
                try {
                  if (gotoPageFromCtx) {
                    gotoPageFromCtx(pageId);
                  } else if (selectPageFromCtx) {
                    selectPageFromCtx(pageId || null);
                  }
                  try { window.history.replaceState(null, '', '/notebooks'); } catch { }
                } catch { }
              }
            }}
            onAuxClickCapture={(e) => {
              // Middle-click new-tab handler for internal page links
              const t = e.target as unknown as HTMLElement;
              const a = t && (t.closest ? (t.closest('a') as HTMLAnchorElement | null) : null);
              if (!a) return;
              const href = a.getAttribute('href') || '';
              if (!href.startsWith('#page:')) return;
              const pageId = href.slice('#page:'.length);
              try { setFileMenuOpen(false); setFileMenuDropdownOpen(false); setFileMenuTarget(null); } catch { }
              try { window.sessionStorage.setItem('onenot:pendingPageId', pageId); } catch { }
              try { window.open('/notebooks', '_blank'); } catch { }
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          {/* Hidden input moved below; keep a single instance to avoid duplicate events */}
        </div>
        {/* Upload bubble at caret */}
        {editor.isEditable && uploadPos && uploadPhase !== 'idle' && (
          <div
            className="absolute z-40 bg-white border border-gray-200 shadow-sm rounded-md px-2 py-1 text-xs flex items-center gap-2 not-prose"
            style={{ left: uploadPos.left, top: uploadPos.top }}
          >
            {uploadPhase === 'preparing' && (
              <>
                <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700">Preparing…</span>
              </>
            )}
            {uploadPhase === 'uploading' && (
              <>
                <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700">Uploading {uploadProgress}%</span>
              </>
            )}
            {uploadPhase === 'done' && (
              <span className="text-green-700">Uploaded</span>
            )}
            {uploadPhase === 'error' && (
              <span className="text-red-700">{uploadError || 'Upload failed'}</span>
            )}
          </div>
        )}
        {/* Link Page popover */}
        {editor.isEditable && linkOpen && (linkPos || slashPos) && (
          <div
            ref={linkRef}
            className="absolute z-50 bg-white border border-gray-200 shadow-lg rounded-md overflow-hidden not-prose"
            style={{ left: (linkPos || slashPos)!.left, top: (linkPos || slashPos)!.top }}
            onMouseDown={(e) => { e.preventDefault(); }}
          >
            <div className="p-2 w-72">
              <input
                type="text"
                className="border rounded px-2 py-1 text-sm w-full disabled:opacity-60"
                placeholder={debouncedQuery !== normalizedQuery ? "Filtering..." : "Search or create page"}
                value={linkQuery}
                onChange={(e) => {
                  if (!linkBusy) {
                    setLinkQuery(e.target.value);
                    setLinkIndex(0);
                  }
                }}
                onKeyDown={(e) => {
                  const list = filteredLinkPages;
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const maxIndex = canCreateLink ? list.length : Math.max(list.length - 1, 0);
                    setLinkIndex((i) => Math.min(i + 1, Math.max(maxIndex, 0)));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setLinkIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (!linkBusy) handlePickLinkItem();
                  } else if (e.key === 'Escape') {
                    if (!linkBusy) setLinkOpen(false);
                  }
                }}
                autoFocus
                disabled={linkBusy}
              />
              <div className="mt-2 max-h-60 overflow-auto">
                {debouncedQuery !== normalizedQuery ? (
                  <div className="text-sm text-gray-500 px-1 py-1">Filtering...</div>
                ) : ancestorNameConflict ? (
                  <div className="text-sm text-red-600 px-1 py-1">"{(linkQuery || '').trim()}" is an ancestor of this page and cannot be linked.</div>
                ) : filteredLinkPages.length === 0 && !canCreateLink ? (
                  <div className="text-sm text-gray-500 px-1 py-1">No matches</div>
                ) : (
                  <ul className="list-none m-0 p-0">
                    {filteredLinkPages.map((p, i) => (
                      <li key={p.id}>
                        <button
                          className={`w-full text-left px-2 py-1 text-sm rounded ${i === linkIndex ? 'bg-gray-100' : ''} ${linkBusy ? 'opacity-60 pointer-events-none' : ''}`}
                          onMouseEnter={() => setLinkIndex(i)}
                          onClick={() => { if (!linkBusy) { setLinkIndex(i); handlePickLinkItem(); } }}
                        >
                          <span className="inline-flex items-center">
                            {p.name || 'Untitled'}
                            {linkBusy && (linkBusyItemId === p.id || (linkCreatingName && ((p.name || 'Untitled').trim().toLowerCase() === linkCreatingName.trim().toLowerCase()))) ? (
                              <span className="inline-block w-3 h-3 ml-2 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                    {canCreateLink && (
                      <li>
                        <button
                          className={`w-full text-left px-2 py-1 text-sm rounded flex items-center ${linkIndex === filteredLinkPages.length ? 'bg-gray-100' : ''} ${linkBusy ? 'pointer-events-none' : ''}`}
                          onMouseEnter={() => setLinkIndex(filteredLinkPages.length)}
                          onClick={() => { if (!linkBusy) { setLinkIndex(filteredLinkPages.length); handlePickLinkItem(); } }}
                        >
                          {linkBusy ? (
                            <>
                              Creating "{linkCreatingName || (linkQuery || '').trim()}"…
                              <span className="inline-block w-3 h-3 ml-2 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </>
                          ) : (
                            <>Create new page “{(linkQuery || '').trim()}”</>
                          )}
                          {/* Spinner already shown next to the text above while busy */}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Slash command menu */}
        {editor.isEditable && slashOpen && slashPos && Number.isFinite(slashPos.left as any) && Number.isFinite(slashPos.top as any) && (
          <div
            className="absolute z-50 bg-white border border-gray-200 shadow-lg rounded-md overflow-hidden min-w-56 not-prose"
            style={{ left: slashPos.left, top: slashPos.top }}
            onMouseDown={(e) => e.preventDefault()}
            ref={slashRef}
          >
            {safeSlashItems.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
            ) : (
              <ul className="max-h-64 overflow-auto list-none m-0 p-0" style={{ listStyle: 'none' }} role="listbox" aria-label="Insert block">
                {safeSlashItems.map((it: { key: string; label: string; hint: string; run: () => void }, i: number) => (
                  <li key={it.key} role="option" aria-selected={i === slashIndex} className="m-0 p-0">
                    <button
                      className={`w-full text-left px-0 pr-3 py-2 text-sm flex items-center justify-between ${i === slashIndex ? 'bg-gray-100' : 'bg-white'} hover:bg-gray-50`}
                      onMouseEnter={() => setSlashIndex(i)}
                      onClick={() => {
                        if (!editor) return;
                        if (slashRange && Number.isFinite(slashRange.from) && Number.isFinite(slashRange.to) && slashRange.from < slashRange.to) {
                          try { editor.chain().focus().deleteRange(slashRange).run(); } catch { }
                        }
                        if (it.key === 'upload') {
                          // Trigger caret upload
                          pickAndUploadAtCaret();
                        } else {
                          it.run();
                        }
                        setSlashOpen(false);
                      }}
                    >
                      <span className="font-medium text-gray-800">{it.label}</span>
                      <span className="ml-4 text-xs text-gray-500">{it.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {/* AI prompt popover (separate from suggestions) */}
        {editor.isEditable && aiOpen && (aiPos || slashPos) && (
          <div
            ref={aiRef}
            className="absolute z-50 bg-white border border-gray-200 shadow-lg rounded-md overflow-hidden not-prose"
            style={
              aiRunning
                ? { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 24 }
                : { left: (aiPos || slashPos)!.left, top: (aiPos || slashPos)!.top }
            }
            onMouseDown={(e) => {
              const t = e.target as HTMLElement;
              // Allow focusing the text input; prevent default elsewhere to avoid editor focus churn
              if (t.closest('input, textarea, select')) return;
              e.preventDefault();
            }}
            onMouseLeave={() => { if (!aiRunning && !aiConfirmOpen && !aiError) setAiOpen(false); }}
          >
            <div className="p-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <input
                  ref={aiInputRef}
                  type="text"
                  className="border rounded px-2 py-1 text-sm flex-1"
                  placeholder="Describe what to write…"
                  value={aiPrompt}
                  onChange={(e) => { setAiPrompt(e.target.value); if (aiError) setAiError(''); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runAIInline();
                    if (e.key === 'Escape') { if (!aiRunning) { setAiOpen(false); setAiPrompt(''); } }
                  }}
                  spellCheck={false}
                  disabled={aiRunning}
                  onFocus={() => { if (aiError) setAiError(''); }}
                />
                <div className="flex flex-col items-start gap-1">
                  {!aiRunning ? (
                    <button
                      type="button"
                      onClick={() => runAIInline()}
                      className="px-2.5 py-1.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                      disabled={!aiPrompt.trim()}
                    >
                      Generate
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center text-xs text-gray-600">
                        <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        {aiHasFirstChunk ? 'Generating…' : 'Thinking…'}
                      </div>
                      <button
                        type="button"
                        onClick={() => stopAIInline()}
                        className="px-2.5 py-1.5 text-xs rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        Stop
                      </button>
                    </div>
                  )}
                  {aiError ? (
                    <div className="text-[11px] text-red-600 leading-snug">
                      {aiError}
                    </div>
                  ) : null}
                </div>
              </div>


            </div>
          </div>
        )}

        {/* Reserve a bottom spacer during generation to keep ~25% viewport blank for aesthetics */}
        {aiRunning && (
          <div aria-hidden className="pointer-events-none" style={{ height: '25vh' }} />
        )}

        {/* Inline Keep/Discard confirmation below generated content */}
        {editor.isEditable && aiConfirmOpen && !aiRunning && aiConfirmPos && (
          <div
            className="absolute z-40 bg-white border border-gray-200 shadow-sm rounded-md px-2 py-1 text-xs flex items-center gap-2"
            style={{ left: aiConfirmPos.left, top: aiConfirmPos.top }}
          >
            <span className="text-gray-600">Keep generated content?</span>
            <button
              type="button"
              onClick={() => {
                try {
                  if (editor && aiStartPosRef.current !== null && aiEndPosRef.current !== null) {
                    const s = aiStartPosRef.current as number;
                    const e = aiEndPosRef.current as number;
                    const chain = editor.chain().focus().setTextSelection({ from: s, to: e });
                    if (aiSessionModeRef.current === 'replace' && originalSelectionHTMLRef.current !== null) {
                      chain.insertContent(originalSelectionHTMLRef.current);
                    } else {
                      chain.deleteSelection();
                    }
                    chain.run();
                  }
                } catch { }
                setAiConfirmOpen(false);
                setAiConfirmPos(null);
                setAiOpen(false);
                // Reset session state
                aiSessionModeRef.current = 'insert';
                originalSelectionHTMLRef.current = null;
              }}
              className="px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => {
                setAiConfirmOpen(false);
                setAiConfirmPos(null);
                setAiOpen(false);
                // On keep, clear snapshot since we won't restore
                aiSessionModeRef.current = 'insert';
                originalSelectionHTMLRef.current = null;
              }}
              className="px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Keep
            </button>
          </div>
        )}

        {/* Inline loader for transform actions */}
        {editor.isEditable && inlineLoaderOpen && inlineLoaderPos && (
          <div
            className="absolute z-40 bg-white/95 backdrop-blur-sm border border-gray-200 shadow-sm rounded-md px-2 py-1 text-xs flex items-center gap-2"
            style={{ left: inlineLoaderPos.left, top: inlineLoaderPos.top }}
          >
            <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-700">{aiHasFirstChunk ? 'Generating…' : 'Thinking…'}</span>
            <button
              type="button"
              onClick={() => { try { stopAIInline(); } catch { } }}
              className="px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700"
            >
              Stop
            </button>
          </div>
        )}

        {/* Hidden input for caret upload */}
        <input
          ref={uploadInputRef}
          type="file"
          className="hidden"
          onChange={onHiddenFilePicked}
        />

        {/* Upload bubble near caret */}
        {editor.isEditable && uploadPos && uploadPhase !== 'idle' && (
          <div
            className="absolute z-40 bg-white border border-gray-200 shadow-sm rounded-md px-2 py-1 text-xs flex items-center gap-2 not-prose"
            style={{ left: uploadPos.left, top: uploadPos.top }}
          >
            {uploadPhase === 'preparing' ? (
              <>
                <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700">Preparing…</span>
              </>
            ) : uploadPhase === 'uploading' ? (
              <>
                <span className="inline-block w-3 h-3 mr-1 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-700">Uploading {uploadProgress}%</span>
              </>
            ) : uploadPhase === 'done' ? (
              <span className="text-green-700">Uploaded</span>
            ) : (
              <span className="text-red-600">{uploadError || 'Upload failed'}</span>
            )}
          </div>
        )}

        {/* Explain side popover */}
        {editor.isEditable && explainOpen && explainPos && (
          <div
            className="absolute z-40 bg-white border border-gray-200 shadow-lg rounded-md p-3 text-sm max-w-md"
            style={{ left: explainPos.left, top: explainPos.top }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium text-gray-800">Explanation</div>
              <div className="flex items-center gap-2">
                {explainRunning ? (
                  <button type="button" className="px-2 py-1 text-xs rounded bg-red-600 text-white" onClick={() => { try { explainAbortRef.current?.abort(); } catch { }; setExplainRunning(false); }}>
                    Stop
                  </button>
                ) : null}
                <div className="flex items-center gap-2">
                  <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-gray-50" onClick={() => { try { navigator.clipboard.writeText(explainText); } catch { } }}>
                    <div className="flex items-center gap-1">
                      <FiCopy className="w-3 h-3" />
                      <span>Copy</span>
                    </div>
                  </button>
                  <button type="button" className="px-2 py-1 text-xs rounded border hover:bg-gray-50" onClick={() => { setExplainOpen(false); setExplainText(''); }}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            {explainText ? (
              <div className="prose prose-sm text-gray-800 max-h-80 overflow-auto"
                dangerouslySetInnerHTML={{ __html: explainHtml }} />
            ) : (
              <div className="text-gray-700">
                {explainRunning ? (aiHasFirstChunk ? 'Loading…' : 'Thinking…') : 'No content'}
              </div>
            )}
          </div>
        )}

        {/* Inline attachment 3-dots menu */}
        {editor.isEditable && fileMenuOpen && fileMenuPos && fileMenuTarget && (
          <div
            id="file-attachment-menu"
            className="absolute z-40"
            style={{ left: fileMenuPos.left, top: fileMenuPos.top }}
          >
            <div className="relative">
              <button
                type="button"
                aria-label="More"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-600"
                onClick={() => setFileMenuDropdownOpen(!fileMenuDropdownOpen)}
              >
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <span className="block w-1 h-1 bg-current rounded-full" />
                  <span className="block w-1 h-1 bg-current rounded-full" />
                  <span className="block w-1 h-1 bg-current rounded-full" />
                </div>
              </button>
              {fileMenuDropdownOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={renameCurrentAttachment}
                    disabled={fileDeleteLoading}
                  >
                    Rename
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    onClick={deleteCurrentAttachment}
                    disabled={fileDeleteLoading}
                  >
                    {fileDeleteLoading ? (
                      <>
                        <span className="inline-block w-3 h-3 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete'
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Inline page link 3-dots menu */}
        {editor.isEditable && pageLinkMenuOpen && pageLinkMenuPos && pageLinkMenuTarget && (
          <div
            id="page-link-menu"
            className="absolute z-40"
            style={{ left: pageLinkMenuPos.left, top: pageLinkMenuPos.top }}
          >
            <div className="relative">
              <button
                type="button"
                aria-label="More"
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-600"
                onClick={() => setPageLinkMenuDropdownOpen(!pageLinkMenuDropdownOpen)}
              >
                <div className="flex flex-col items-center justify-center gap-0.5">
                  <span className="block w-1 h-1 bg-current rounded-full" />
                  <span className="block w-1 h-1 bg-current rounded-full" />
                  <span className="block w-1 h-1 bg-current rounded-full" />
                </div>
              </button>
              {pageLinkMenuDropdownOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden">
                  <button className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50" onClick={renameCurrentPageLink}>Rename</button>
                  <button className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={deleteCurrentPageLink}>Delete</button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </EditorErrorBoundary>
  );
});


Editor.displayName = 'Editor';
export default Editor;





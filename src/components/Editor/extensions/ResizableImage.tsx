import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import Image from '@tiptap/extension-image';

type ResizableImageAttrs = {
  src: string;
  alt?: string | null;
  title?: string | null;
  width?: number | null; // px
};

function ResizableImageComponent(props: any) {
  const { node, editor, updateAttributes, selected, getPos } = props as {
    node: { attrs: ResizableImageAttrs };
    editor: { isEditable: boolean; commands: any; chain: () => any };
    updateAttributes: (attrs: Partial<ResizableImageAttrs>) => void;
    selected: boolean;
    getPos: () => number;
  };
  const { src, alt, title, width } = node.attrs;
  const [hover, setHover] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const startX = useRef(0);
  const startW = useRef<number>(width || 0);
  const dragging = useRef(false);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startX.current;
    const next = Math.max(50, Math.min(1600, Math.round((startW.current || (imgRef.current?.getBoundingClientRect().width || 300)) + dx)));
    updateAttributes({ width: next });
    e.preventDefault();
  }, [updateAttributes]);

  const onMouseUp = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove]);

  const beginDrag = (e: React.MouseEvent) => {
    if (!editor.isEditable) return;
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = width || (imgRef.current?.getBoundingClientRect().width || 300);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const wrapperStyle: React.CSSProperties = {
    display: 'inline-block',
    position: 'relative',
    lineHeight: 0,
    maxWidth: '100%',
    border: editor.isEditable && (hover || selected) ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
    borderRadius: 6,
  };

  const imgStyle: React.CSSProperties = {
    display: 'block',
    width: width ? `${width}px` : 'auto',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: 6,
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    background: '#4f46e5',
    borderRadius: 3,
    cursor: editor.isEditable ? 'nwse-resize' as const : 'default',
    opacity: editor.isEditable && (hover || selected) ? 1 : 0,
    transition: 'opacity 120ms',
    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
  };

  return (
    <NodeViewWrapper as="span" contentEditable={false} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <span
        style={wrapperStyle}
        onClick={(e) => {
          if (editor.isEditable) {
            e.stopPropagation();
            // Use setTimeout to avoid flushSync conflicts during render cycles
            setTimeout(() => {
              editor.chain().focus().setNodeSelection(getPos()).run();
            }, 0);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={src} alt={alt || ''} title={title || ''} style={imgStyle} draggable={false} />
        <span role="button" aria-label="Resize image" onMouseDown={beginDrag} style={handleStyle} />
      </span>
    </NodeViewWrapper>
  );
}

const ResizableImage = Image.extend({
  inline: true,
  group: 'inline',
  addAttributes() {
    const base = (this as any).parent?.() || {};
    return {
      ...base,
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const w = (element.getAttribute('data-width') || '').toString();
          if (w && /^\d+$/.test(w)) return parseInt(w, 10);
          const styleW = (element.getAttribute('style') || '').match(/width:\s*(\d+)px/);
          if (styleW) return parseInt(styleW[1], 10);
          return null;
        },
        renderHTML: (attrs: ResizableImageAttrs) => {
          const out: Record<string, string> = {};
          if (attrs.width) {
            out['data-width'] = String(attrs.width);
            out['style'] = `width:${attrs.width}px;`;
          }
          return out;
        },
      },
    } as any;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

export default ResizableImage;

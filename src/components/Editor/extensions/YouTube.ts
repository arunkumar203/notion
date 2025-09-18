import { Node, mergeAttributes, PasteRule } from '@tiptap/core';

// Minimal YouTube embed node that supports standard videos and Shorts.
// It detects pasted URLs and replaces them with an iframe block.
// The node is stored/rendered as <iframe data-youtube="true" ... /> so it round-trips via HTML.

export interface YouTubeOptions {
  HTMLAttributes: Record<string, any>;
}

function parseStartSeconds(url: string): number | null {
  try {
    const u = new URL(url);
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (!t) return null;
    // Supports forms like "90", "90s", "1m30s"
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    let total = 0;
    const m = t.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!m) return null;
    const h = m[1] ? parseInt(m[1], 10) : 0;
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const s = m[3] ? parseInt(m[3], 10) : 0;
    total = h * 3600 + min * 60 + s;
    return total || null;
  } catch {
    return null;
  }
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v');
      if (v) return v;
      const shorts = u.pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
      if (shorts) return shorts[1];
    }
    if (host === 'youtu.be') {
      const m = u.pathname.match(/^\/([A-Za-z0-9_-]{6,})/);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

const YOUTUBE_URL_RE = /(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)[^\s]+|youtu\.be\/[^\s]+))/gi;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtube: {
      setYouTubeVideo: (options: { videoId: string; start?: number | null }) => ReturnType;
    }
  }
}

const YouTube = Node.create<YouTubeOptions>({
  name: 'youtube',
  group: 'block',
  atom: true,
  selectable: true,
  isolating: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'yt-embed',
        style: 'width: 100%; aspect-ratio: 16 / 9; border: 0;'
      },
    };
  },

  addAttributes() {
    return {
      videoId: { default: null },
      start: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[data-youtube="true"]',
        getAttrs: (el) => {
          const e = el as HTMLIFrameElement;
          const id = e.getAttribute('data-video-id') || null;
          const startAttr = e.getAttribute('data-start');
          const start = startAttr ? parseInt(startAttr, 10) : null;
          if (!id) return false;
          return { videoId: id, start: Number.isFinite(start) ? start : null };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const id = node.attrs.videoId as string | null;
    const start = (node.attrs.start ?? null) as number | null;
    if (!id) return ['div', {}, 0];
    const src = `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}`;
    return [
      'iframe',
      mergeAttributes(
        { 'data-youtube': 'true', 'data-video-id': id, 'data-start': start ?? undefined, allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share', allowfullscreen: 'true', src },
        this.options.HTMLAttributes,
        HTMLAttributes,
      ),
    ];
  },

  addNodeView() {
    return ({ editor, node, getPos }) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'relative';
      wrapper.style.width = '100%';
      wrapper.style.margin = '8px 0';

      const iframe = document.createElement('iframe');
      iframe.setAttribute('data-youtube', 'true');
      const id = node.attrs.videoId as string | null;
      const start = (node.attrs.start ?? null) as number | null;
      const src = id ? `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}` : '';
      iframe.src = src;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.style.width = '100%';
      iframe.style.aspectRatio = '16 / 9';
      iframe.style.border = '0';
      iframe.setAttribute('data-video-id', id || '');
      if (start != null) iframe.setAttribute('data-start', String(start));

      const del = document.createElement('button');
      del.type = 'button';
      del.title = 'Delete video';
      del.textContent = '×';
      del.style.position = 'absolute';
      del.style.top = '6px';
      del.style.right = '6px';
      del.style.width = '28px';
      del.style.height = '28px';
      del.style.borderRadius = '14px';
      del.style.border = '1px solid rgba(0,0,0,0.15)';
      del.style.background = 'rgba(255,255,255,0.9)';
      del.style.cursor = 'pointer';
      del.style.lineHeight = '24px';
      del.style.textAlign = 'center';
      del.style.fontSize = '18px';
      del.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)';
      del.style.display = 'none';

      wrapper.addEventListener('mouseenter', () => { del.style.display = 'block'; });
      wrapper.addEventListener('mouseleave', () => { del.style.display = 'none'; });

      del.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      del.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const pos = typeof getPos === 'function' ? (getPos() as number) : null;
          if (typeof pos === 'number') {
            const tr = editor.state.tr.delete(pos, pos + (node as any).nodeSize);
            editor.view.dispatch(tr);
            editor.view.focus();
          } else {
            editor.commands.deleteSelection();
          }
        } catch {}
      });

      wrapper.appendChild(iframe);
      wrapper.appendChild(del);

      return {
        dom: wrapper,
        selectNode: () => { try { wrapper.classList.add('ProseMirror-selectednode'); } catch {} },
        deselectNode: () => { try { wrapper.classList.remove('ProseMirror-selectednode'); } catch {} },
        update: (n: any) => {
          if (n.type.name !== 'youtube') return false;
          const id = n.attrs.videoId as string | null;
          const start = (n.attrs.start ?? null) as number | null;
          const src = id ? `https://www.youtube.com/embed/${id}${start ? `?start=${start}` : ''}` : '';
          if (iframe.src !== src) iframe.src = src;
          if (id) iframe.setAttribute('data-video-id', id); else iframe.removeAttribute('data-video-id');
          if (start != null) iframe.setAttribute('data-start', String(start)); else iframe.removeAttribute('data-start');
          return true;
        },
      } as any;
    };
  },

  addCommands() {
    return {
      setYouTubeVideo:
        (opts) => ({ chain }) => {
          if (!opts.videoId) return false;
          return chain().insertContent({ type: this.name, attrs: { videoId: opts.videoId, start: opts.start ?? null } }).run();
        },
    };
  },

  addPasteRules() {
    return [
      new PasteRule({
        find: YOUTUBE_URL_RE,
        handler: ({ chain, range, match }) => {
          const url = match[0];
          const id = extractYouTubeId(url);
          if (!id) return;
          const start = parseStartSeconds(url);
          chain().setTextSelection(range).insertContent({ type: this.name, attrs: { videoId: id, start } }).run();
        },
      }),
    ];
  },
});

export default YouTube;

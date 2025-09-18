import { Node, mergeAttributes } from '@tiptap/core';

// Inline node that renders: [page svg] + <a href="#page:<id>">name</a>
// Persisted in the document so it is saved in HTML/Firestore.
const PageLink = Node.create({
  name: 'pageLink',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      pageId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-page-id') || '' },
      name: { default: 'Untitled', parseHTML: (el: HTMLElement) => el.getAttribute('data-name') || 'Untitled' },
      target: { default: undefined, parseHTML: (el: HTMLElement) => el.getAttribute('data-target') || undefined },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-page-link]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { pageId, name, target } = HTMLAttributes as { pageId: string; name: string; target?: string };
    const href = `#page:${pageId || ''}`;
    const wrapperAttrs = mergeAttributes(HTMLAttributes, {
      'data-page-link': 'true',
      'data-page-id': pageId || '',
      'data-name': name || 'Untitled',
      style: 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
      class: 'page-link',
      'data-href': href,
      onclick: 'event.preventDefault(); const pageId = this.getAttribute(\'data-page-id\'); if (pageId) window.__handlePageLinkClick(pageId);',
    });
    // Render provided PAGE SVG as data URI image (fixed colors for reliability inside <img>)
    const pageSvg = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M6 2.75h7.5L20.5 9.75V20a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 20V5A2.25 2.25 0 0 1 6 2.75Z" fill="#FFFFFF" stroke="#000000" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M13.5 2.75V8A1.75 1.75 0 0 0 15.25 9.75H20.5" fill="#FFFFFF" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="7.5" y1="14" x2="16.5" y2="14" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="7.5" y1="17.5" x2="14.5" y2="17.5" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
    const svgData = "data:image/svg+xml;utf8," + encodeURIComponent(pageSvg);
    const imgAttrs = { src: svgData, width: '14', height: '14', 'aria-hidden': 'true', style: 'display:inline-block;line-height:0;' } as Record<string,string>;
    const linkAttrs = { href, 'data-page-id': pageId || '', title: `page:${pageId || ''}` } as Record<string,string>;
    if (target) linkAttrs['target'] = target;
    return [
      'span',
      wrapperAttrs,
      ['img', imgAttrs],
      ['a', linkAttrs, name || 'Untitled'],
    ];
  },

  addCommands() {
    return {
      insertPageLink:
        (attrs: { pageId: string; name: string; target?: string }) => ({ commands }: { commands: any }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    } as any;
  },
});

export default PageLink;

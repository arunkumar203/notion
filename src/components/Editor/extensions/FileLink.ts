import { Node, mergeAttributes } from '@tiptap/core';

// Inline node that renders: [svg icon] + <a href>filename</a>
// Persisted in the document so it is saved in HTML/Firestore.
const FileLink = Node.create({
  name: 'fileLink',
  group: 'inline',
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      href: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-href') || '' },
      name: { default: 'file', parseHTML: (el: HTMLElement) => el.getAttribute('data-name') || 'file' },
      target: { default: '_blank', parseHTML: (el: HTMLElement) => el.getAttribute('data-target') || '_blank' },
    };
  },

  parseHTML() {
    return [
      { tag: 'span[data-file-link]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { href, name, target } = HTMLAttributes as { href: string; name: string; target?: string };
    const wrapperAttrs = mergeAttributes(HTMLAttributes, {
      'data-file-link': 'true',
      'data-href': href || '',
      'data-name': name || 'file',
      'data-target': target || '_blank',
      style: 'display:inline-flex;align-items:center;gap:6px;',
    });
    // Use the provided FILE SVG as data URI image (fixed colors for reliability inside <img>)
    const fileSvg = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 2H14L18 6V20C18 21.1 17.1 22 16 22H6C4.9 22 4 21.1 4 20V4C4 2.9 4.9 2 6 2Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M14 2V6H18" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M12 22V14M12 14L9 17M12 14L15 17" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    const svgData = "data:image/svg+xml;utf8," + encodeURIComponent(fileSvg);
    const imgAttrs = { src: svgData, width: '14', height: '14', 'aria-hidden': 'true', style: 'display:inline-block;line-height:0;' } as Record<string, string>;
    const linkAttrs = { href: href || '#', target: target || '_blank', rel: 'noopener noreferrer' } as Record<string, string>;
    return [
      'span',
      wrapperAttrs,
      ['img', imgAttrs],
      ['a', linkAttrs, name || 'file'],
    ];
  },

  addCommands() {
    return {
      insertFileLink:
        (attrs: { href: string; name: string; target?: string }) => ({ commands }: { commands: any }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    } as any;
  },
});

export default FileLink;

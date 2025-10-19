import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

// Simple HTML table extension for rendering regular tables
export const HtmlTable = Node.create({
    name: 'htmlTable',

    group: 'block',

    content: 'tableRow+',

    tableRole: 'table',

    isolating: true,

    parseHTML() {
        return [
            { tag: 'table' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['table', { ...HTMLAttributes, class: 'html-table' }, ['tbody', 0]];
    },

    addCommands() {
        return {
            insertHtmlTable: () => ({ commands }) => {
                return commands.insertContent(`
          <table class="html-table">
            <tbody>
              <tr>
                <td>Cell 1</td>
                <td>Cell 2</td>
              </tr>
              <tr>
                <td>Cell 3</td>
                <td>Cell 4</td>
              </tr>
            </tbody>
          </table>
        `);
            },
        };
    },
});

export const HtmlTableRow = Node.create({
    name: 'tableRow',

    content: 'tableCell+',

    tableRole: 'row',

    parseHTML() {
        return [
            { tag: 'tr' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['tr', HTMLAttributes, 0];
    },
});

export const HtmlTableCell = Node.create({
    name: 'tableCell',

    content: 'block+',

    tableRole: 'cell',

    isolating: true,

    parseHTML() {
        return [
            { tag: 'td' },
            { tag: 'th' },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['td', HTMLAttributes, 0];
    },
});

export default [HtmlTable, HtmlTableRow, HtmlTableCell];
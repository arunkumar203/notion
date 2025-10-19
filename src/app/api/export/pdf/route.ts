import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { title, content, type = 'page' } = await request.json();

        if (!title || !content) {
            return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
        }

        // Create HTML document with minimal, PDF-friendly styles
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${title}</title>
                <style>
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                    
                    /* Don't force exact globally – it triggers rasterization */
                    * {
                        box-sizing: border-box;
                    }
                    
                    html, body {
                        /* Minimal styling to avoid rasterization */
                    }
                    
                    ${type === 'page' ? `
                    /* Single page export - prevent unnecessary page breaks */
                    * {
                        page-break-inside: auto !important;
                    }
                    
                    h1, h2, h3, h4, h5, h6 {
                        page-break-before: auto !important;
                        page-break-after: auto !important;
                    }
                    
                    p, li, blockquote {
                        page-break-inside: auto !important;
                        page-break-before: auto !important;
                        page-break-after: auto !important;
                    }
                    ` : ''}
                    
                    * {
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 12pt;
                        line-height: 1.4;
                        color: black;
                        margin: 0;
                        padding: 0;
                        background: white;
                    }
                    
                    @media print {
                        /* Absolutely minimal print styles */
                        body {
                            font-family: Arial, sans-serif !important;
                            font-size: 12pt !important;
                            color: black !important;
                        }
                        
                        a {
                            color: blue !important;
                            text-decoration: underline !important;
                        }
                        
                        h1, h2, h3, h4, h5, h6 {
                            color: black !important;
                            font-weight: bold !important;
                        }
                        
                        p, div, span {
                            color: black !important;
                        }
                    }
                    
                    .page-title {
                        font-size: 22pt;
                        font-weight: 700;
                        margin: 0 0 12pt 0;
                        padding-bottom: 12pt;
                        border-bottom: 1.5pt solid #ccc;
                        page-break-after: avoid;
                    }
                    
                    .content {
                        margin-top: 8pt;
                    }
                    
                    h1, h2, h3, h4, h5, h6 {
                        font-weight: 700;
                        page-break-after: avoid;
                        margin-top: 12pt;
                        margin-bottom: 6pt;
                    }
                    
                    h1 { font-size: 18pt; margin-top: 14pt; }
                    h2 { font-size: 16pt; margin-top: 12pt; }
                    h3 { font-size: 14pt; margin-top: 10pt; }
                    h4 { font-size: 12pt; margin-top: 8pt; }
                    h5 { font-size: 11pt; margin-top: 6pt; }
                    h6 { font-size: 10pt; margin-top: 6pt; }
                    
                    p {
                        margin: 0 0 6pt 0;
                        orphans: 2;
                        widows: 2;
                    }
                    
                    strong, b {
                        font-weight: 700;
                    }
                    
                    em, i {
                        font-style: italic;
                    }
                    
                    ul, ol {
                        margin: 6pt 0;
                        padding-left: 18pt;
                    }
                    
                    li {
                        margin: 2pt 0;
                    }
                    
                    ul {
                        list-style-type: disc;
                    }
                    
                    ol {
                        list-style-type: decimal;
                    }
                    
                    ul li {
                        list-style-position: outside;
                    }
                    
                    ol li {
                        list-style-position: outside;
                    }
                    
                    code {
                        font-family: 'Courier New', Courier, monospace;
                        background-color: #f5f5f5;
                        padding: 2pt 4pt;
                        border-radius: 2pt;
                        font-size: 10pt;
                    }
                    
                    pre {
                        font-family: 'Courier New', Courier, monospace;
                        background-color: #f5f5f5;
                        padding: 10pt;
                        border-radius: 4pt;
                        font-size: 9pt;
                        line-height: 1.4;
                        white-space: pre-wrap;
                        margin: 10pt 0;
                        border: 1pt solid #ddd;
                    }
                    
                    blockquote {
                        margin: 10pt 0;
                        padding: 8pt 12pt;
                        border-left: 3pt solid #ccc;
                        background-color: #f9f9f9;
                        color: #666;
                        font-style: italic;
                    }
                    
                    hr {
                        border: none;
                        border-top: 1pt solid #ccc;
                        margin: 16pt 0;
                    }
                    
                    table {
                        border-collapse: collapse;
                        width: 100%;
                        margin: 8pt 0;
                        page-break-inside: auto;
                        font-size: 10pt;
                    }
                    
                    th, td {
                        border: 0.5pt solid #ccc;
                        padding: 4pt 6pt;
                        text-align: left;
                        vertical-align: top;
                    }
                    
                    th {
                        background-color: #f8f9fa;
                        font-weight: 700;
                        page-break-after: avoid;
                    }
                    
                    tr {
                        page-break-inside: auto;
                    }
                    
                    tbody tr:nth-child(even) {
                        background-color: #fafafa;
                    }
                    
                    /* Handle large tables */
                    .table-wrapper {
                        overflow-x: auto;
                        margin: 8pt 0;
                    }
                    
                    /* Ensure table headers repeat on page breaks */
                    thead {
                        display: table-header-group;
                    }
                    
                    tbody {
                        display: table-row-group;
                    }
                    
                    tfoot {
                        display: table-footer-group;
                    }
                    
                    img {
                        max-width: 100%;
                        height: auto;
                        page-break-inside: avoid;
                        margin: 8pt 0;
                    }
                    
                    a {
                        color: #0066cc;
                        text-decoration: underline;
                    }
                    
                    /* Table of Contents Links */
                    .table-of-contents a {
                        color: #0066cc;
                        text-decoration: none;
                        cursor: pointer;
                    }
                    
                    .table-of-contents a:hover {
                        text-decoration: underline;
                    }
                    
                    /* Ensure all links are preserved in PDF */
                    a[href] {
                        color: #0066cc;
                    }
                    
                    mark {
                        background-color: #ffff99;
                        padding: 1pt 2pt;
                    }
                    
                    /* Task lists */
                    ul[data-type="taskList"] {
                        list-style: none;
                        padding-left: 0;
                    }
                    
                    ul[data-type="taskList"] li {
                        display: flex;
                        align-items: flex-start;
                        margin: 6pt 0;
                    }
                    
                    ul[data-type="taskList"] li input[type="checkbox"] {
                        margin-right: 6pt;
                        margin-top: 2pt;
                    }
                    
                    /* Table of Contents Styles */
                    .table-of-contents {
                        margin-bottom: 30pt;
                    }
                    
                    .table-of-contents h1 {
                        font-size: 24pt;
                        font-weight: 700;
                        margin-bottom: 20pt;
                        text-align: center;
                        border-bottom: 2pt solid #ccc;
                        padding-bottom: 10pt;
                    }
                    
                    .toc-topic h2 {
                        font-size: 16pt;
                        font-weight: 700;
                        margin: 15pt 0 10pt 0;
                        color: #333;
                    }
                    
                    .toc-pages {
                        list-style: none;
                        padding-left: 20pt;
                        margin: 0;
                    }
                    
                    .toc-pages li {
                        margin: 6pt 0;
                        font-size: 11pt;
                        color: #555;
                    }
                    
                    /* Simple TOC styling without page numbers */
                    
                    /* Page numbering at bottom */
                    @page {
                        @bottom-center {
                            content: "Page " counter(page);
                            font-size: 10pt;
                            color: #666;
                        }
                    }
                    
                    /* Breadcrumb Styles */
                    .breadcrumb {
                        font-size: 9pt;
                        color: #666;
                        margin-bottom: 8pt;
                        padding: 4pt 8pt;
                        background-color: #f8f9fa;
                        border-radius: 3pt;
                        border-left: 3pt solid #007bff;
                    }
                    
                    /* Page Section Styles */
                    .page-section {
                        margin-bottom: 12pt;
                    }
                    
                    .page-content {
                        margin-top: 6pt;
                    }
                </style>
            </head>
            <body>
                <div class="page-title">${title}</div>
                <div class="content">${content}</div>
            </body>
            </html>
        `;

        // Return the HTML for client-side printing
        return NextResponse.json({
            html: htmlContent,
            filename: `${title}.pdf`
        });

    } catch (error) {
        console.error('PDF export error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
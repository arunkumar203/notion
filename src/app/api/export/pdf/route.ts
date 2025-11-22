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
                        size: auto;
                        margin: 10mm;
                    }
                    
                    @media print {
                        /* Preserve exact layout for coordinate alignment */
                        body {
                            padding: 0 !important;
                            margin: 0 !important;
                        }
                        
                        .content {
                            padding: 0 !important;
                            /* Force exact width to match editor and ensure text wrapping is identical */
                            margin: 0 auto !important;
                            overflow: visible !important;
                        }
                        
                        .content-layer {
                            width: 100% !important;
                            position: relative !important;
                            box-sizing: border-box !important;
                        }
                        
                        .drawing-layer {
                            display: block !important;
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                            pointer-events: none !important;
                        }
                        
                        .drawing-layer svg {
                            display: block !important;
                            position: absolute !important;
                            top: 0 !important;
                            left: 0 !important;
                            width: 100% !important;
                            height: 100% !important;
                        }
                        
                        /* Prevent any width changes during print */
                        * {
                            box-sizing: border-box !important;
                        }
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
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                        font-size: 16px;
                        line-height: 1.6;
                        color: #1a1a1a;
                        margin: 0;
                        padding: 0;
                        background: white;
                        -webkit-font-smoothing: antialiased;
                        -moz-osx-font-smoothing: grayscale;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    @media print {
                        /* Absolutely minimal print styles */
                        body {
                            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif !important;
                            font-size: 16px !important;
                            color: black !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
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
                        font-size: 28px;
                        font-weight: 700;
                        margin: 20px;
                        padding-bottom: 16px;
                        border-bottom: 2px solid #e5e7eb;
                        page-break-after: avoid;
                        color: #1a1a1a;
                    }
                    
                    .content {
                        margin: 0;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    
                    /* Match TipTap editor styles exactly */
                    .content p {
                        margin: 0 0 1em 0;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    .content > div {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    /* Ensure content wrapper respects exact width */
                    .content > div > div {
                        box-sizing: border-box;
                    }
                    
                    h1, h2, h3, h4, h5, h6 {
                        font-weight: 700;
                        page-break-after: avoid;
                        line-height: 1.3;
                        color: #1a1a1a;
                    }
                    
                    h1 { 
                        font-size: 2em; 
                        margin: 0.67em 0;
                    }
                    h2 { 
                        font-size: 1.5em; 
                        margin: 0.75em 0;
                    }
                    h3 { 
                        font-size: 1.17em; 
                        margin: 0.83em 0;
                    }
                    h4 { 
                        font-size: 1em; 
                        margin: 1em 0;
                    }
                    h5 { 
                        font-size: 0.83em; 
                        margin: 1.17em 0;
                    }
                    h6 { 
                        font-size: 0.67em; 
                        margin: 1.33em 0;
                    }
                    
                    p {
                        margin: 1em 0;
                        orphans: 2;
                        widows: 2;
                        line-height: 1.6;
                    }
                    
                    p:first-child {
                        margin-top: 0;
                    }
                    
                    p:last-child {
                        margin-bottom: 0;
                    }
                    
                    strong, b {
                        font-weight: 700;
                    }
                    
                    em, i {
                        font-style: italic;
                    }
                    
                    ul, ol {
                        margin: 1em 0;
                        padding-left: 1.25rem; /* Matched to globals.css (20px) */
                        list-style-position: outside;
                    }
                    
                    li {
                        margin: 0.25em 0;
                        padding-left: 0.375rem;
                    }
                    
                    li p {
                        margin: 0;
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
                    
                    /* Nested lists */
                    li > ul,
                    li > ol {
                        margin: 0.25em 0;
                    }
                    
                    code {
                        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', Courier, monospace;
                        background-color: #f3f4f6;
                        padding: 0.2em 0.4em;
                        border-radius: 3px;
                        font-size: 0.9em;
                    }
                    
                    pre {
                        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', Courier, monospace;
                        background-color: #1e1e1e;
                        color: #d4d4d4;
                        padding: 1em;
                        border-radius: 6px;
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        margin: 1em 0;
                        overflow-x: auto;
                    }
                    
                    pre code {
                        background: none;
                        padding: 0;
                        color: inherit;
                        font-size: inherit;
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
                    
                    /* SVG drawings - only apply to standalone SVGs, not drawing layer */
                    .content svg:not(.drawing-layer svg) {
                        max-width: 100%;
                        height: auto;
                        page-break-inside: avoid;
                        margin: 8pt 0;
                        display: block;
                    }
                    
                    /* Drawing layer SVG should maintain exact dimensions */
                    .drawing-layer svg {
                        max-width: none !important;
                        max-height: none !important;
                        width: auto !important;
                        height: auto !important;
                        display: block !important;
                    }
                    
                    @media print {
                        .content svg:not(.drawing-layer svg) {
                            max-width: 100% !important;
                            height: auto !important;
                        }
                        
                        .drawing-layer svg {
                            max-width: none !important;
                            max-height: none !important;
                        }
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
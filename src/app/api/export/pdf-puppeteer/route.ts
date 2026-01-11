import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

export async function POST(request: NextRequest) {
    try {
        const { title, content, drawings, editorWidth, editorHeight, drawingsOnly } = await request.json();

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }
        
        if (!drawingsOnly && !content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // Create complete HTML document
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>${title}</title>
                <style>
                    @page {
                        margin: 20mm;
                    }
                    
                    * {
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        font-size: 16px;
                        line-height: 1.6;
                        color: #1a1a1a;
                        margin: 0;
                        padding: 0;
                        background: white;
                        width: ${editorWidth || 800}px;
                    }
                    
                    .page-title {
                        font-size: 28px;
                        font-weight: 700;
                        margin: 0 0 20px 0;
                        padding-bottom: 16px;
                        border-bottom: 2px solid #e5e7eb;
                        color: #1a1a1a;
                        width: 100%;
                    }
                    
                    .content-container {
                        position: relative;
                        width: ${editorWidth || 800}px;
                        min-height: ${editorHeight || 1000}px;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    /* Ensure drawing layer overlays content correctly */
                    .content-container > .absolute {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        right: 0 !important;
                        pointer-events: none !important;
                    }
                    
                    /* TipTap editor styles */
                    h1, h2, h3, h4, h5, h6 {
                        font-weight: 700;
                        line-height: 1.3;
                        color: #1a1a1a;
                        word-wrap: break-word;
                    }
                    
                    h1 { font-size: 2em; margin: 0.67em 0; }
                    h2 { font-size: 1.5em; margin: 0.75em 0; }
                    h3 { font-size: 1.17em; margin: 0.83em 0; }
                    
                    p {
                        margin: 1em 0;
                        line-height: 1.6;
                        word-wrap: break-word;
                        overflow-wrap: break-word;
                    }
                    
                    ul, ol {
                        margin: 1em 0;
                        padding-left: 2em;
                    }
                    
                    li {
                        margin: 0.5em 0;
                        word-wrap: break-word;
                    }
                    
                    code {
                        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
                        background-color: #f3f4f6;
                        padding: 0.2em 0.4em;
                        border-radius: 3px;
                        font-size: 0.9em;
                        word-break: break-all;
                    }
                    
                    pre {
                        font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
                        background-color: #ffffff;
                        color: #1a1a1a;
                        padding: 1em;
                        border: 1px solid #e5e7eb;
                        border-radius: 6px;
                        font-size: 14px;
                        line-height: 1.5;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                        margin: 1em 0;
                        overflow-x: auto;
                        max-width: 100%;
                    }
                    
                    pre code {
                        background-color: transparent;
                        color: inherit;
                        padding: 0;
                        word-break: normal;
                    }
                </style>
            </head>
            <body>
                ${!drawingsOnly ? `<div class="page-title">${title}</div>` : ''}
                <div class="content-container" style="${drawingsOnly ? 'padding: 0; width: 100%;' : ''}">
                    ${drawingsOnly ? (drawings || '') : content}
                </div>
            </body>
            </html>
        `;

        let browser;
        let pdfBuffer;
        
        try {
            // Launch Puppeteer with Vercel-compatible settings
            browser = await puppeteer.launch({
                headless: true,
                timeout: 30000,
                // Use bundled Chromium for Vercel
                executablePath: process.env.NODE_ENV === 'production' 
                    ? '/opt/render/project/.render/chrome/opt/google/chrome/chrome'
                    : undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--single-process',
                    '--no-zygote'
                ]
            });

            const page = await browser.newPage();
            
            // Set viewport to match editor width
            await page.setViewport({ 
                width: editorWidth || 800,
                height: Math.max(editorHeight || 1000, 1123)
            });
            
            // Set content with a shorter timeout
            await page.setContent(htmlContent, { 
                waitUntil: 'domcontentloaded',
                timeout: 15000
            });

            // Wait a bit for any dynamic content
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Generate PDF with custom width to match editor
            // Editor width in mm + PDF margins (20mm left + 20mm right = 40mm)
            const contentWidthMM = (editorWidth || 800) * 0.264583; // Convert px to mm
            const pageWidthMM = contentWidthMM + 40; // Add 40mm for left and right PDF margins
            
            pdfBuffer = await page.pdf({
                width: `${pageWidthMM}mm`,
                height: '297mm', // A4 height
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '20mm',
                    bottom: '20mm',
                    left: '20mm'
                },
                timeout: 30000
            });

        } finally {
            if (browser) {
                await browser.close();
            }
        }

        // Return PDF as response
        return new Response(Buffer.from(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${title}.pdf"`
            }
        });

    } catch (error) {
        console.error('PDF generation error:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to generate PDF';
        if (error instanceof Error) {
            if (error.message.includes('Could not find expected browser')) {
                errorMessage = 'Puppeteer browser not found. Please install Chrome or Chromium.';
            } else if (error.message.includes('Navigation timeout')) {
                errorMessage = 'PDF generation timed out. Content may be too large.';
            } else {
                errorMessage = `PDF generation failed: ${error.message}`;
            }
        }
        
        return NextResponse.json({ 
            error: errorMessage,
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
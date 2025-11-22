import { drawingStrokesToSVG, parseDrawingsData } from './drawing-to-svg';

// Track active toasts to prevent duplicates
let activeToasts = new Set<HTMLElement>();

/**
 * Simple toast notification utility
 */
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration: number = 5000) {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-white text-sm font-medium transition-all duration-300 transform translate-x-full`;

    // Set background color based on type
    if (type === 'success') {
        toast.className += ' bg-green-600';
    } else if (type === 'error') {
        toast.className += ' bg-red-600';
    } else {
        toast.className += ' bg-blue-600';
    }

    toast.textContent = message;
    document.body.appendChild(toast);
    activeToasts.add(toast);

    // Animate in
    setTimeout(() => {
        toast.classList.remove('translate-x-full');
    }, 10);

    // Auto remove after specified duration
    setTimeout(() => {
        toast.classList.add('translate-x-full');
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
            activeToasts.delete(toast);
        }, 300);
    }, duration);

    return toast;
}

/**
 * Export page to PDF using browser printing
 */
export async function exportPageToPDF(pageName: string, content: string, drawings?: string, editorWidth?: number, editorHeight?: number): Promise<void> {
    // Show loading toast
    const loadingToast = showToast('Generating PDF...', 'info', 30000);
    
    try {
        // Get the actual editor element
        const editorElement = document.querySelector('[data-editor-root="true"]') as HTMLElement;

        // Get both widths: content width for text, full width for drawings
        let contentWidth = editorWidth || 800;
        let fullWidth = editorWidth || 800;
        let actualHeight = editorHeight || 1000;
        let paddingLeft = 0;
        
        if (editorElement) {
            const computedStyle = window.getComputedStyle(editorElement);
            paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
            fullWidth = editorElement.offsetWidth; // Full width WITH padding
            contentWidth = fullWidth - paddingLeft - paddingRight; // Content width WITHOUT padding
            actualHeight = editorElement.scrollHeight;
        }

        // Get the actual rendered HTML from the editor to preserve exact layout
        const renderedContent = editorElement?.innerHTML || content;

        // Call the Puppeteer API for server-side PDF generation
        const response = await fetch('/api/export/pdf-puppeteer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: pageName,
                content: renderedContent,
                editorWidth: contentWidth,
                editorHeight: actualHeight
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF with Puppeteer');
        }

        // Get the PDF blob and download it
        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pageName}.pdf`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Remove loading toast
        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        
        showToast('PDF exported successfully!', 'success', 3000);

    } catch (error) {
        console.error('Puppeteer PDF export error:', error);
        
        // Remove loading toast
        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        
        // Fall back to browser printing method
        showToast('Puppeteer failed, falling back to browser printing...', 'info', 3000);
        
        try {
            // Fallback to original browser printing method
            await exportPageToPDFBrowser(pageName, content, drawings, editorWidth, editorHeight);
        } catch (fallbackError) {
            console.error('Fallback export also failed:', fallbackError);
            showToast('PDF export failed. Please try again.', 'error', 5000);
        }
    }
}

/**
 * Export only drawings from a page (no text content)
 */
export async function exportPageDrawingsOnly(pageName: string, drawings: string, editorWidth?: number, editorHeight?: number): Promise<void> {
    const loadingToast = showToast('Generating drawings PDF...', 'info', 30000);
    
    try {
        const editorElement = document.querySelector('[data-editor-root="true"]') as HTMLElement;

        let fullWidth = editorWidth || 800;
        let actualHeight = editorHeight || 1000;
        let paddingLeft = 0;
        
        if (editorElement) {
            const computedStyle = window.getComputedStyle(editorElement);
            paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
            const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
            fullWidth = editorElement.offsetWidth;
            actualHeight = editorElement.scrollHeight;
        }

        // Convert drawings to SVG
        let drawingsSVG = '';
        if (drawings) {
            try {
                const strokes = parseDrawingsData(drawings);

                if (strokes.length > 0) {
                    drawingsSVG = drawingStrokesToSVG(strokes, fullWidth, actualHeight);
                }
            } catch (error) {
                console.error('Error converting drawings:', error);
                throw error;
            }
        }

        if (!drawingsSVG) {
            throw new Error('No drawings to export');
        }

        // Call API to generate PDF with only drawings
        const response = await fetch('/api/export/pdf-puppeteer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `${pageName} - Drawings`,
                content: '', // No text content
                drawings: drawingsSVG,
                editorWidth: fullWidth,
                editorHeight: actualHeight,
                drawingsOnly: true
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate drawings PDF');
        }

        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${pageName}-drawings.pdf`;
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        
        showToast('Drawings exported successfully!', 'success', 3000);

    } catch (error) {
        console.error('Drawings export error:', error);
        
        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        
        showToast('Failed to export drawings. Please try again.', 'error', 5000);
    }
}

/**
 * Export topic with all pages, table of contents, and breadcrumbs
 */
export async function exportTopicToPDF(
    topicName: string,
    pages: Array<{ name: string, content: string, drawings?: string, parentPageId?: string | null }>,
    breadcrumb?: string
): Promise<void> {
    try {
        // Create table of contents
        let combinedContent = `
            <div class="table-of-contents">
                <h1>Table of Contents</h1>
                <div class="toc-topic">
                    <h2>${topicName}</h2>
                    <ul class="toc-pages">
        `;

        // Generate table of contents (non-clickable, no page numbers)
        pages.forEach((page, index) => {
            const indent = page.parentPageId ? 'style="margin-left: 20px;"' : '';
            combinedContent += `<li ${indent}>${index + 1}. ${page.name}</li>`;
        });

        combinedContent += `
                    </ul>
                </div>
            </div>
            <div style="page-break-before: always;"></div>
        `;

        // Add all pages with breadcrumbs and simple sequential numbering
        pages.forEach((page, index) => {
            const pageNumber = `${index + 1}`;
            const pageBreadcrumb = breadcrumb ? `${breadcrumb} > ${page.name}` : `${topicName} > ${page.name}`;

            // Convert drawings to SVG if present
            let drawingsSVG = '';

            if (page.drawings) {
                try {
                    const strokes = parseDrawingsData(page.drawings);

                    if (strokes.length > 0) {
                        drawingsSVG = drawingStrokesToSVG(strokes);
                    }
                } catch (error) {
                    console.error('Error converting drawings to SVG:', error);
                }
            }

            combinedContent += `
                <div class="page-section">
                    <div class="breadcrumb">${pageBreadcrumb}</div>
                    <h1>${pageNumber}. ${page.name}</h1>
                    <div class="page-content">
                        ${page.content}
                        ${drawingsSVG}
                    </div>
                </div>
                ${index < pages.length - 1 ? '<div style="page-break-before: always;"></div>' : ''}
            `;
        });



        // Use the API with enhanced CSS for TOC and breadcrumbs
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: topicName,
                content: combinedContent,
                type: 'topic'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF');
        }

        const { html } = await response.json();

        // Create iframe and print (same as single page)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-9999px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            throw new Error('Unable to create print document');
        }

        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        await new Promise((resolve) => {
            iframe.onload = resolve;
            setTimeout(resolve, 500);
        });

        iframe.contentWindow?.focus();

        setTimeout(() => {
            try {
                // Add event listener for when print dialog closes
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow) {
                    iframeWindow.addEventListener('afterprint', () => {
                        // Show toast when print dialog closes (whether printed or cancelled)
                        showToast('PDF generation may take a moment...', 'info', 3000);
                    });
                }

                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            } catch (error) {
                console.error('Print error:', error);
                alert('Unable to print. Please try again.');
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }
        }, 250);

    } catch (error) {
        console.error('Topic export error:', error);
        alert('Failed to export topic. Please try again.');
    }
}

/**
 * Export section with all topics and pages
 */
export async function exportSectionToPDF(sectionName: string, topics: Array<{ name: string, pages: Array<{ name: string, content: string, drawings?: string }> }>, breadcrumb?: string): Promise<void> {
    try {
        // Create table of contents with proper section hierarchy
        let combinedContent = `
            <div class="table-of-contents">
                <h1>Table of Contents</h1>
                <div class="toc-section">
                    <h2>${sectionName}</h2>
                    <ul class="toc-topics">
        `;

        // Generate hierarchical table of contents (non-clickable, no page numbers)
        topics.forEach((topic, topicIndex) => {
            const topicNum = `${topicIndex + 1}`;
            combinedContent += `<li><strong>${topicNum}. ${topic.name}</strong>`;

            if (topic.pages.length > 0) {
                combinedContent += `<ul class="toc-pages">`;
                topic.pages.forEach((page, pageIndex) => {
                    const pageNum = `${topicNum}.${pageIndex + 1}`;
                    combinedContent += `<li>${pageNum}. ${page.name}</li>`;
                });
                combinedContent += `</ul>`;
            }

            combinedContent += `</li>`;
        });

        combinedContent += `
                    </ul>
                </div>
            </div>
            <div style="page-break-before: always;"></div>
        `;

        // Add all topics and pages with hierarchical numbering
        topics.forEach((topic, topicIndex) => {
            const topicNum = `${topicIndex + 1}`;
            const topicBreadcrumb = breadcrumb ? `${breadcrumb} > ${topic.name}` : `${sectionName} > ${topic.name}`;

            combinedContent += `
                <div class="page-section">
                    <div class="breadcrumb">${topicBreadcrumb}</div>
                    <h1>${topicNum}. ${topic.name}</h1>
                </div>
            `;

            topic.pages.forEach((page, pageIndex) => {
                const pageNum = `${topicNum}.${pageIndex + 1}`;
                const pageBreadcrumb = `${topicBreadcrumb} > ${page.name}`;

                // Convert drawings to SVG if present
                let drawingsSVG = '';
                if (page.drawings) {
                    try {
                        const strokes = parseDrawingsData(page.drawings);
                        if (strokes.length > 0) {
                            drawingsSVG = drawingStrokesToSVG(strokes);
                        }
                    } catch (error) {
                        console.error('Error converting drawings to SVG:', error);
                    }
                }

                combinedContent += `
                    <div class="page-section">
                        <div class="breadcrumb">${pageBreadcrumb}</div>
                        <h2>${pageNum}. ${page.name}</h2>
                        <div class="page-content">
                            ${page.content}
                            ${drawingsSVG}
                        </div>
                    </div>
                `;

                // Add page break between pages (except last)
                if (!(topicIndex === topics.length - 1 && pageIndex === topic.pages.length - 1)) {
                    combinedContent += '<div style="page-break-before: always;"></div>';
                }
            });
        });

        // Use the API with enhanced CSS for TOC and breadcrumbs
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: sectionName,
                content: combinedContent,
                type: 'section'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF');
        }

        const { html } = await response.json();

        // Create iframe and print (same as topic export)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-9999px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            throw new Error('Unable to create print document');
        }

        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        await new Promise((resolve) => {
            iframe.onload = resolve;
            setTimeout(resolve, 500);
        });

        iframe.contentWindow?.focus();

        setTimeout(() => {
            try {
                // Add event listener for when print dialog closes
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow) {
                    iframeWindow.addEventListener('afterprint', () => {
                        // Show toast when print dialog closes (whether printed or cancelled)
                        showToast('PDF generation may take a moment...', 'info', 3000);
                    });
                }

                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            } catch (error) {
                console.error('Print error:', error);
                alert('Unable to print. Please try again.');
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }
        }, 250);

    } catch (error) {
        console.error('Section export error:', error);
        alert('Failed to export section. Please try again.');
    }
}

/**
 * Export notebook with all sections, topics, and pages
 */
export async function exportNotebookToPDF(
    notebookName: string,
    sections: Array<{
        name: string,
        topics: Array<{
            name: string,
            pages: Array<{ name: string, content: string, drawings?: string }>
        }>
    }>,
    breadcrumb?: string
): Promise<void> {
    try {
        // Create table of contents with 4-level hierarchy
        let combinedContent = `
            <div class="table-of-contents">
                <h1>Table of Contents</h1>
                <div class="toc-notebook">
                    <h2>${notebookName}</h2>
                    <ul class="toc-sections">
        `;

        // Generate hierarchical table of contents (non-clickable, no page numbers)
        sections.forEach((section, sectionIndex) => {
            const sectionNum = `${sectionIndex + 1}`;
            combinedContent += `<li><strong>${sectionNum}. ${section.name}</strong>`;

            if (section.topics.length > 0) {
                combinedContent += `<ul class="toc-topics">`;
                section.topics.forEach((topic, topicIndex) => {
                    const topicNum = `${sectionNum}.${topicIndex + 1}`;
                    combinedContent += `<li><strong>${topicNum}. ${topic.name}</strong>`;

                    if (topic.pages.length > 0) {
                        combinedContent += `<ul class="toc-pages">`;
                        topic.pages.forEach((page, pageIndex) => {
                            const pageNum = `${topicNum}.${pageIndex + 1}`;
                            combinedContent += `<li>${pageNum}. ${page.name}</li>`;
                        });
                        combinedContent += `</ul>`;
                    }

                    combinedContent += `</li>`;
                });
                combinedContent += `</ul>`;
            }

            combinedContent += `</li>`;
        });

        combinedContent += `
                    </ul>
                </div>
            </div>
            <div style="page-break-before: always;"></div>
        `;

        // Add all sections, topics, and pages with hierarchical numbering
        sections.forEach((section, sectionIndex) => {
            const sectionNum = `${sectionIndex + 1}`;
            const sectionBreadcrumb = breadcrumb ? `${breadcrumb} > ${section.name}` : `${notebookName} > ${section.name}`;

            combinedContent += `
                <div class="page-section">
                    <div class="breadcrumb">${sectionBreadcrumb}</div>
                    <h1>${sectionNum}. ${section.name}</h1>
                </div>
            `;

            section.topics.forEach((topic, topicIndex) => {
                const topicNum = `${sectionNum}.${topicIndex + 1}`;
                const topicBreadcrumb = `${sectionBreadcrumb} > ${topic.name}`;

                combinedContent += `
                    <div class="page-section">
                        <div class="breadcrumb">${topicBreadcrumb}</div>
                        <h2>${topicNum}. ${topic.name}</h2>
                    </div>
                `;

                topic.pages.forEach((page, pageIndex) => {
                    const pageNum = `${topicNum}.${pageIndex + 1}`;
                    const pageBreadcrumb = `${topicBreadcrumb} > ${page.name}`;

                    // Convert drawings to SVG if present
                    let drawingsSVG = '';
                    if (page.drawings) {
                        try {
                            const strokes = parseDrawingsData(page.drawings);
                            if (strokes.length > 0) {
                                drawingsSVG = drawingStrokesToSVG(strokes);
                            }
                        } catch (error) {
                            console.error('Error converting drawings to SVG:', error);
                        }
                    }

                    combinedContent += `
                        <div class="page-section">
                            <div class="breadcrumb">${pageBreadcrumb}</div>
                            <h3>${pageNum}. ${page.name}</h3>
                            <div class="page-content">
                                ${page.content}
                                ${drawingsSVG}
                            </div>
                        </div>
                    `;

                    // Add page break between pages (except last)
                    const isLastSection = sectionIndex === sections.length - 1;
                    const isLastTopic = topicIndex === section.topics.length - 1;
                    const isLastPage = pageIndex === topic.pages.length - 1;

                    if (!(isLastSection && isLastTopic && isLastPage)) {
                        combinedContent += '<div style="page-break-before: always;"></div>';
                    }
                });
            });
        });

        // Use the API with enhanced CSS for TOC and breadcrumbs
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: notebookName,
                content: combinedContent,
                type: 'notebook'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF');
        }

        const { html } = await response.json();

        // Create iframe and print (same as other exports)
        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.left = '-9999px';
        iframe.style.width = '210mm';
        iframe.style.height = '297mm';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!iframeDoc) {
            document.body.removeChild(iframe);
            throw new Error('Unable to create print document');
        }

        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();

        await new Promise((resolve) => {
            iframe.onload = resolve;
            setTimeout(resolve, 500);
        });

        iframe.contentWindow?.focus();

        setTimeout(() => {
            try {
                // Add event listener for when print dialog closes
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow) {
                    iframeWindow.addEventListener('afterprint', () => {
                        // Show toast when print dialog closes (whether printed or cancelled)
                        showToast('PDF generation may take a moment...', 'info', 3000);
                    });
                }

                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                }, 1000);
            } catch (error) {
                console.error('Print error:', error);
                alert('Unable to print. Please try again.');
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }
        }, 250);

    } catch (error) {
        console.error('Notebook export error:', error);
        alert('Failed to export notebook. Please try again.');
    }
}
/**

 * Fallback PDF export using browser printing (original method)
 */
async function exportPageToPDFBrowser(pageName: string, content: string, drawings?: string, editorWidth?: number, editorHeight?: number): Promise<void> {
    // Get the actual editor element to capture its real dimensions
    const editorElement = document.querySelector('[data-editor-root="true"]') as HTMLElement;
    
    // Use actual editor dimensions if available, otherwise use provided or default values
    const actualWidth = editorElement?.offsetWidth || editorWidth || 800;
    const actualHeight = editorElement?.scrollHeight || editorHeight || 1000;
    
    // Convert drawings to SVG if present
    let drawingsSVG = '';
    if (drawings) {
        try {
            const strokes = parseDrawingsData(drawings);
            if (strokes.length > 0) {
                drawingsSVG = drawingStrokesToSVG(strokes, actualWidth, actualHeight);
            }
        } catch (error) {
            console.error('Error converting drawings to SVG:', error);
        }
    }

    // Combine content with drawings
    const combinedContent = drawingsSVG
        ? `<div style="position: relative; width: ${actualWidth}px; min-height: ${actualHeight}px; margin: 0; padding: 20mm; box-sizing: border-box; background: white;">
               ${content}
               <div style="position: absolute; top: 20mm; left: 20mm; width: calc(100% - 40mm); height: calc(100% - 40mm); pointer-events: none; z-index: 10;">
                   ${drawingsSVG.replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg xmlns="http://www.w3.org/2000/svg" style="transform: translate(12px, 20px);"')}
               </div>
           </div>`
        : `<div style="width: ${actualWidth}px; margin: 0; padding: 20mm; box-sizing: border-box; background: white;">${content}</div>`;

    // Call the original PDF API
    const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: pageName,
            content: combinedContent,
            type: 'page'
        }),
    });

    if (!response.ok) {
        throw new Error('Failed to generate PDF');
    }

    const { html } = await response.json();

    // Create iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
        document.body.removeChild(iframe);
        throw new Error('Unable to create print document');
    }

    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Wait for content to load
    await new Promise((resolve) => {
        iframe.onload = resolve;
        setTimeout(resolve, 500);
    });

    // Trigger print
    iframe.contentWindow?.focus();
    setTimeout(() => {
        try {
            iframe.contentWindow?.print();
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 1000);
        } catch (error) {
            console.error('Print error:', error);
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            throw error;
        }
    }, 250);
}
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

// Helper to handle the iframe printing part
async function printHtml(html: string) {
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

    return new Promise<void>((resolve) => {
        setTimeout(() => {
            try {
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow) {
                    iframeWindow.addEventListener('afterprint', () => {
                        // Optional: logic after print dialog closes
                    });
                }
                iframe.contentWindow?.print();
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                    resolve();
                }, 1000);
            } catch (error) {
                console.error('Print error:', error);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve();
            }
        }, 250);
    });
}



/**
 * Helper to process content for export:
 * 1. Transforms Kanban elements (selects -> badges, inputs -> text)
 * 2. Overlays drawings if present
 */
function processContentForExport(htmlContent: string, drawings?: string, width: number = 800, height: number = 1000): string {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Hydrate tables from data attributes if they exist as placeholders
    // This is needed for bulk exports where the React component hasn't rendered the table
    // Handles both kanban-table and custom-table types
    const tablePlaceholders = tempDiv.querySelectorAll('div[data-type="kanban-table"], div[data-type="custom-table"]');
    tablePlaceholders.forEach(placeholder => {
        // Skip if already rendered (e.g. in single page export where React has already done the job)
        // Check for common table elements to be sure
        if (placeholder.querySelector('.kt__container') ||
            placeholder.querySelector('table') ||
            placeholder.querySelector('tr') ||
            placeholder.querySelector('.kt-kanban')) {
            return;
        }

        try {
            const columnsData = placeholder.getAttribute('data-columns');
            const rowsData = placeholder.getAttribute('data-rows');

            if (columnsData && rowsData) {
                const columns = JSON.parse(columnsData);
                const rows = JSON.parse(rowsData);
                const isKanbanTable = placeholder.getAttribute('data-type') === 'kanban-table';
                console.log('[PDF Export] Processing table:', {
                    type: placeholder.getAttribute('data-type'),
                    isKanban: isKanbanTable,
                    columnCount: columns.length,
                    rowCount: rows.length
                });

                if (isKanbanTable) {
                    // Render Kanban as board view
                    const selectColumn = columns.find((col: any) => col.type === 'select');
                    console.log('[PDF Export] Kanban detected, select column:', selectColumn);

                    if (selectColumn) {
                        const titleColumn = columns.find((c: any) => c.type === 'text');
                        const groupOptions = selectColumn.options || [];
                        console.log('[PDF Export] Rendering Kanban board with', groupOptions.length, 'columns');

                        // Group rows by status
                        const grouped: Record<string, any[]> = {};
                        groupOptions.forEach((opt: any) => {
                            grouped[opt.id] = [];
                        });

                        rows.forEach((row: any) => {
                            const statusValue = row.values[selectColumn.id];
                            if (statusValue && grouped[statusValue]) {
                                grouped[statusValue].push(row);
                            }
                        });

                        console.log('[PDF Export] Grouped rows:', Object.keys(grouped).map(k => `${k}: ${grouped[k].length}`));

                        // Build board HTML
                        let boardHtml = '<div class="kt-kanban"><div class="ktb__columns">';

                        groupOptions.forEach((opt: any) => {
                            const cardsInColumn = grouped[opt.id] || [];
                            boardHtml += `
                                <div class="ktb__column">
                                    <div class="ktb__column-header">
                                        <div class="ktb__column-title">
                                            <span class="ktb__swatch" style="background-color: ${opt.color || '#ccc'}"></span>
                                            <span class="ktb__name">${opt.label}</span>
                                            <span class="ktb__count">(${cardsInColumn.length})</span>
                                        </div>
                                    </div>
                                    <div class="ktb__cards">`;

                            cardsInColumn.forEach((row: any) => {
                                const title = titleColumn ? (row.values[titleColumn.id] || 'Untitled') : 'Untitled';
                                const createdDate = row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                }) : '';

                                boardHtml += `
                                    <div class="ktb__card">
                                        <div class="ktb__card-title">${title}</div>
                                        <div class="ktb__card-meta">
                                            <span class="ktb__meta-item">Created ${createdDate}</span>
                                        </div>
                                    </div>`;
                            });

                            boardHtml += '</div></div>';
                        });

                        boardHtml += '</div></div>';
                        placeholder.innerHTML = boardHtml;
                        console.log('[PDF Export] Kanban board HTML set');
                    } else {
                        console.warn('[PDF Export] Kanban has no select column, falling back to table');
                    }
                } else {
                    // Render custom tables as regular tables
                    let tableHtml = `
                        <div class="kt__container">
                            <table class="kt__table">
                                <thead>
                                    <tr>
                                        ${columns.map((col: any) => {
                        const headerText = col.name || col.label || 'Untitled';
                        return `<th class="kt__th">${headerText}</th>`;
                    }).join('')}
                                    </tr>
                                </thead>
                                <tbody>
                    `;

                    rows.forEach((row: any) => {
                        tableHtml += `<tr class="kt__row">`;
                        columns.forEach((col: any) => {
                            const val = row.values[col.id];
                            let cellContent = '';

                            if (col.type === 'select') {
                                const options = col.options || [];
                                const optionsJson = JSON.stringify(options.map((o: any) => ({ id: o.id, label: o.label }))).replace(/'/g, "&apos;");
                                const currentVal = val ?? (options.length > 0 ? options[0].id : '');
                                const selectedOption = options.find((o: any) => String(o.id) === String(currentVal));
                                const color = selectedOption?.color || '#e5e7eb';

                                cellContent = `
                                    <div class="kt__select-cell">
                                        <select class="kt__select" data-stored-value="${currentVal}" data-column-options='${optionsJson}' style="background-color: ${color}">
                                            <option value="${currentVal}" selected>${selectedOption?.label || ''}</option>
                                        </select>
                                    </div>`;
                            } else if (col.type === 'progress' || col.type === 'percentage') {
                                cellContent = `
                                    <div class="kt__progress-cell">
                                        <input type="number" class="kt__progress-input" value="${val || 0}">
                                    </div>`;
                            } else if (col.type === 'checkbox') {
                                cellContent = `
                                    <div class="kt__checkbox-cell">
                                        <input type="checkbox" class="kt__checkbox" ${val ? 'checked' : ''} disabled>
                                    </div>`;
                            } else if (col.type === 'date') {
                                cellContent = `<div class="kt__input">${val || ''}</div>`;
                            } else {
                                cellContent = `<div class="kt__input">${val || ''}</div>`;
                            }

                            tableHtml += `<td class="kt__td" data-type="${col.type}">${cellContent}</td>`;
                        });
                        tableHtml += `</tr>`;
                    });

                    tableHtml += `
                                </tbody>
                            </table>
                        </div>
                    `;

                    placeholder.innerHTML = tableHtml;
                }
            } else {
                console.warn('Table placeholder missing data attributes, skipping hydration.');
            }
        } catch (e) {
            console.error('Error hydrating table for export:', e);
        }
    });

    // Transform Kanban Progress Cells (Fixes double bars)
    const progressCells = tempDiv.querySelectorAll('.kt__progress-cell');
    progressCells.forEach(cell => {
        const input = cell.querySelector('input.kt__progress-input') as HTMLInputElement;
        if (!input) return;

        const value = input.getAttribute('value') || input.value || '0';

        // Create print-friendly structure
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            flex: 1;
            height: 8px;
            background-color: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
            min-width: 60px;
        `;

        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
            width: ${value}%;
            height: 100%;
            background-color: #3b82f6;
            transition: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        `;

        const progressText = document.createElement('span');
        progressText.textContent = `${value}%`;
        progressText.style.cssText = `
            font-size: 11px;
            color: #374151;
            margin-left: 6px;
            min-width: 28px;
            text-align: right;
        `;

        progressContainer.appendChild(progressBar);

        // Clear existing content and append new structure
        cell.innerHTML = '';
        (cell as HTMLElement).style.cssText = 'display: flex; align-items: center; width: 100%; padding: 0 4px;';
        cell.appendChild(progressContainer);
        cell.appendChild(progressText);
    });

    // Transform Kanban Selects into static badges
    const kanbanSelects = tempDiv.querySelectorAll('select.kt__select');
    kanbanSelects.forEach(select => {
        const selectEl = select as HTMLSelectElement;
        const value = selectEl.getAttribute('data-stored-value') || selectEl.value;

        let text = '';
        let color = selectEl.style.backgroundColor || '#e5e7eb';

        // Strategy 1: Try to get options from data attribute
        const optionsData = selectEl.getAttribute('data-column-options');
        if (optionsData) {
            try {
                const options = JSON.parse(optionsData);
                // Use string comparison to ensure matching works even if IDs are numbers
                const matchedOption = options.find((opt: any) => String(opt.id) === String(value));
                if (matchedOption) {
                    text = matchedOption.label;
                }
            } catch (e) {
                console.error('Failed to parse data-column-options', e);
            }
        }

        // Strategy 2: Fallback to DOM options
        if (!text) {
            const options = Array.from(selectEl.options);
            const selectedOption = options.find(opt => opt.value === value);
            if (selectedOption) {
                text = selectedOption.text;
            }
        }

        // Strategy 3: Last resort
        if (!text) {
            text = 'Not Started';
        }

        const span = document.createElement('span');
        span.textContent = text;
        span.style.cssText = `
            display: inline-block; 
            padding: 0.25rem 0.5rem; 
            border-radius: 4px; 
            font-weight: 500; 
            color: white; 
            text-align: center; 
            min-width: 80px; 
            background-color: ${color};
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
        `;

        select.parentNode?.replaceChild(span, select);
    });

    let processedHtml = tempDiv.innerHTML;

    // Overlay drawings if present
    if (drawings) {
        try {
            const strokes = parseDrawingsData(drawings);
            if (strokes.length > 0) {
                const drawingsSVG = drawingStrokesToSVG(strokes, width, height);
                processedHtml = `
                    <div style="position: relative; width: 100%; min-height: ${height}px;">
                        <div class="content-layer" style="position: relative; z-index: 1;">
                            ${processedHtml}
                        </div>
                        <div class="drawing-layer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none;">
                            ${drawingsSVG}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error processing drawings for PDF:', error);
        }
    }

    return processedHtml;
}

/**
 * Export page to PDF using browser printing
 */
export async function exportPageToPDF(pageName: string, content: string, drawings?: string, editorWidth?: number, editorHeight?: number): Promise<void> {
    const loadingToast = showToast('Generating PDF...', 'info', 30000);

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

        // Sync live values to attributes before processing
        if (editorElement) {
            const inputs = editorElement.querySelectorAll('input');
            inputs.forEach(input => {
                if (input.type === 'checkbox' || input.type === 'radio') {
                    if (input.checked) input.setAttribute('checked', 'checked');
                    else input.removeAttribute('checked');
                } else {
                    input.setAttribute('value', input.value);
                }
            });

            const selects = editorElement.querySelectorAll('select');
            selects.forEach(select => {
                const options = select.querySelectorAll('option');
                options.forEach(option => {
                    if (option.selected) option.setAttribute('selected', 'selected');
                    else option.removeAttribute('selected');
                });
                if (!select.hasAttribute('data-stored-value')) {
                    select.setAttribute('data-stored-value', select.value);
                }
            });
        }

        // Use the shared helper to process content
        // Note: For single page export, we use the editor's innerHTML which now has synced attributes
        const sourceContent = editorElement ? editorElement.innerHTML : content;
        const finalContent = processContentForExport(sourceContent, drawings, fullWidth, actualHeight);

        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: pageName,
                content: finalContent,
                type: 'page'
            }),
        });

        if (!response.ok) throw new Error('Failed to generate PDF');

        const { html } = await response.json();
        await printHtml(html); // Helper function for printing (extracted below)

        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        showToast('PDF exported successfully!', 'success', 3000);

    } catch (error) {
        console.error('PDF export error:', error);
        if (loadingToast && document.body.contains(loadingToast)) {
            document.body.removeChild(loadingToast);
        }
        showToast('PDF export failed. Please try again.', 'error', 5000);
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
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: `${pageName} - Drawings`,
                content: drawingsSVG,
                type: 'drawings'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate drawings PDF');
        }

        const { html } = await response.json();

        // Create iframe for printing drawings
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

            // Process content to hydrate tables and transform Kanban elements
            // Note: No drawings in bulk exports
            const processedContent = processContentForExport(page.content);

            combinedContent += `
                <div class="page-section">
                    <div class="breadcrumb">${pageBreadcrumb}</div>
                    <h1>${pageNumber}. ${page.name}</h1>
                    <div class="page-content">
                        ${processedContent}
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

                // Process content to hydrate tables and transform Kanban elements
                // Note: No drawings in bulk exports
                const processedContent = processContentForExport(page.content);

                combinedContent += `
                    <div class="page-section">
                        <div class="breadcrumb">${pageBreadcrumb}</div>
                        <h2>${pageNum}. ${page.name}</h2>
                        <div class="page-content">
                            ${processedContent}
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

                    // Process content to hydrate tables and transform Kanban elements
                    // Note: No drawings in bulk exports
                    const processedContent = processContentForExport(page.content);

                    combinedContent += `
                        <div class="page-section">
                            <div class="breadcrumb">${pageBreadcrumb}</div>
                            <h3>${pageNum}. ${page.name}</h3>
                            <div class="page-content">
                                ${processedContent}
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
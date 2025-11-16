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
 * Export page to PDF using optimized browser printing
 */
export async function exportPageToPDF(pageName: string, content: string): Promise<void> {
    try {
        // Call the API to get formatted HTML
        const response = await fetch('/api/export/pdf', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title: pageName,
                content: content,
                type: 'page'
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to generate PDF');
        }

        const { html } = await response.json();

        // Create a hidden iframe for printing
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

        // Write the formatted HTML with minimal styling for better text preservation
        const enhancedHtml = html.replace(
            '<head>',
            `<head>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; font-size: 12pt; color: black; }
                    a { color: blue; text-decoration: underline; }
                    h1, h2, h3 { color: black; font-weight: bold; }
                </style>`
        );

        iframeDoc.open();
        iframeDoc.write(enhancedHtml);
        iframeDoc.close();

        // Wait for content to load
        await new Promise((resolve) => {
            iframe.onload = resolve;
            setTimeout(resolve, 500); // Fallback
        });

        // Focus and trigger print
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

                // Clean up after printing
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
        console.error('PDF export error:', error);
        alert('Failed to export PDF. Please try again.');
    }
}

/**
 * Export topic with all pages, table of contents, and breadcrumbs
 */
export async function exportTopicToPDF(
    topicName: string,
    pages: Array<{ name: string, content: string, parentPageId?: string | null }>,
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

            combinedContent += `
                <div class="page-section">
                    <div class="breadcrumb">${pageBreadcrumb}</div>
                    <h1>${pageNumber}. ${page.name}</h1>
                    <div class="page-content">
                        ${page.content}
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
export async function exportSectionToPDF(sectionName: string, topics: Array<{ name: string, pages: Array<{ name: string, content: string }> }>, breadcrumb?: string): Promise<void> {
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

                combinedContent += `
                    <div class="page-section">
                        <div class="breadcrumb">${pageBreadcrumb}</div>
                        <h2>${pageNum}. ${page.name}</h2>
                        <div class="page-content">
                            ${page.content}
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
            pages: Array<{ name: string, content: string }>
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

                    combinedContent += `
                        <div class="page-section">
                            <div class="breadcrumb">${pageBreadcrumb}</div>
                            <h3>${pageNum}. ${page.name}</h3>
                            <div class="page-content">
                                ${page.content}
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
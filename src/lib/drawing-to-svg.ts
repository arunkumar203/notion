/**
 * Utility to convert drawing strokes to SVG for PDF export
 */

interface Stroke {
    points: number[][];
    color: string;
    size: number;
    tool: 'pen' | 'highlighter';
}

/**
 * Convert a stroke's points to an SVG path using Perfect Freehand algorithm
 * This is a simplified version that doesn't require the full library
 */
function getStrokeOutline(points: number[][], size: number, thinning: number, smoothing: number, simulatePressure: boolean): number[][] {
    if (points.length === 0) return [];

    // For PDF export, we'll use a simpler approach - just return the points
    // The actual Perfect Freehand algorithm is complex, so we'll approximate
    const outline: number[][] = [];

    for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const pressure = simulatePressure ? 0.5 + (Math.sin(i / points.length * Math.PI) * 0.5) : 1;
        const radius = (size * pressure) / 2;

        // Add points for the stroke outline
        outline.push([x - radius, y]);
        outline.push([x + radius, y]);
    }

    return outline;
}

function getSvgPathFromStroke(stroke: number[][]): string {
    if (!stroke.length) return '';

    const d = stroke.reduce(
        (acc, [x0, y0], i, arr) => {
            const [x1, y1] = arr[(i + 1) % arr.length];
            acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
            return acc;
        },
        ['M', ...stroke[0], 'Q']
    );

    d.push('Z');
    return d.join(' ');
}

/**
 * Convert drawing strokes to SVG markup
 */
export function drawingStrokesToSVG(strokes: Stroke[], width: number = 800, height: number = 1000): string {
    if (!strokes || strokes.length === 0) {
        return '';
    }

    // Generate SVG paths using ORIGINAL coordinates (no adjustment)
    // This maintains exact pixel positions from the editor
    let svgPaths = '';
    for (const stroke of strokes) {
        if (!stroke.points || stroke.points.length < 2) continue;

        // Use original coordinates exactly as captured in the editor
        const pathPoints = stroke.points.map(([x, y]) => `${x},${y}`).join(' ');
        // Scale down stroke width slightly for PDF to match website appearance
        const baseWidth = stroke.tool === 'highlighter' ? 20 : stroke.size;
        const strokeWidth = baseWidth * 0.6; // Reduce by 40% for PDF
        const opacity = stroke.tool === 'highlighter' ? 0.4 : 1;

        svgPaths += `<polyline points="${pathPoints}" fill="none" stroke="${stroke.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" />\n`;
    }

    // Return SVG with exact pixel dimensions matching the content area
    // No scaling - 1:1 pixel mapping for precise alignment
    return `<svg xmlns="http://www.w3.org/2000/svg" 
                 width="${width}px" 
                 height="${height}px" 
                 viewBox="0 0 ${width} ${height}" 
                 preserveAspectRatio="none"
                 style="position: absolute; top: 0; left: 0; width: ${width}px; height: ${height}px; pointer-events: none; display: block;">
${svgPaths}
</svg>`;
}

/**
 * Parse drawings from Firestore (handles both string and object formats)
 */
export function parseDrawingsData(drawingsData: any): Stroke[] {
    if (!drawingsData) return [];

    try {
        if (typeof drawingsData === 'string') {
            return JSON.parse(drawingsData);
        }
        if (Array.isArray(drawingsData)) {
            return drawingsData;
        }
        return [];
    } catch (error) {
        console.error('Error parsing drawings data:', error);
        return [];
    }
}

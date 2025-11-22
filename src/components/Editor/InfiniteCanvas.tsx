'use client';

import { useState, useRef, useEffect } from 'react';
import { getStroke } from 'perfect-freehand';

interface Stroke {
    points: number[][];
    color: string;
    size: number;
    tool: 'pen' | 'highlighter';
}

interface InfiniteCanvasProps {
    tool: 'pen' | 'highlighter' | 'eraser';
    color: string;
    size: number;
    onStrokesChange?: (strokes: Stroke[]) => void;
    initialStrokes?: Stroke[];
}

function getSvgPathFromStroke(stroke: number[][]) {
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

export default function InfiniteCanvas({ tool, color, size, onStrokesChange, initialStrokes = [] }: InfiniteCanvasProps) {
    const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (onStrokesChange) {
            onStrokesChange(strokes);
        }
    }, [strokes, onStrokesChange]);

    const getPointerPosition = (e: React.PointerEvent | PointerEvent) => {
        if (!svgRef.current) return [0, 0];
        const rect = svgRef.current.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        setIsDrawing(true);
        const point = getPointerPosition(e);
        setCurrentPoints([point]);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        e.preventDefault();
        const point = getPointerPosition(e);
        setCurrentPoints(prev => [...prev, point]);

        // Real-time erasing
        if (tool === 'eraser') {
            const [x, y] = point;
            setStrokes(prevStrokes =>
                prevStrokes.filter(stroke => {
                    // Check if any point in the stroke is within eraser radius
                    return !stroke.points.some(([sx, sy]) => {
                        const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
                        return dist < 25; // Eraser radius
                    });
                })
            );
        }
    };

    const handlePointerUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (currentPoints.length > 2 && tool !== 'eraser') {
            const newStroke: Stroke = {
                points: currentPoints,
                color: color,
                size: tool === 'highlighter' ? 20 : size,
                tool: tool
            };
            setStrokes(prev => [...prev, newStroke]);
        }

        setCurrentPoints([]);
    };

    const renderStroke = (stroke: Stroke, index: number) => {
        const pathStroke = getStroke(stroke.points, {
            size: stroke.size,
            thinning: stroke.tool === 'highlighter' ? 0 : 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: stroke.tool === 'pen'
        });

        const pathData = getSvgPathFromStroke(pathStroke);

        return (
            <path
                key={index}
                d={pathData}
                fill={stroke.color}
                opacity={stroke.tool === 'highlighter' ? 0.4 : 1}
            />
        );
    };

    const renderCurrentStroke = () => {
        if (currentPoints.length < 2) return null;

        if (tool === 'eraser') {
            const lastPoint = currentPoints[currentPoints.length - 1];
            return (
                <circle
                    cx={lastPoint[0]}
                    cy={lastPoint[1]}
                    r={25}
                    fill="rgba(255,0,0,0.1)"
                    stroke="#999"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                />
            );
        }

        const pathStroke = getStroke(currentPoints, {
            size: tool === 'highlighter' ? 20 : size,
            thinning: tool === 'highlighter' ? 0 : 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: tool === 'pen'
        });

        const pathData = getSvgPathFromStroke(pathStroke);

        return (
            <path
                d={pathData}
                fill={color}
                opacity={tool === 'highlighter' ? 0.4 : 0.7}
            />
        );
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full overflow-auto bg-white"
            style={{ touchAction: 'none' }}
        >
            <svg
                ref={svgRef}
                width="10000"
                height="10000"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => {
                    if (isDrawing) handlePointerUp();
                }}
                style={{
                    cursor: tool === 'eraser' ? 'crosshair' : 'crosshair',
                    display: 'block'
                }}
            >
                {/* Grid pattern */}
                <defs>
                    <pattern id="infinite-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1" />
                    </pattern>
                </defs>
                <rect width="10000" height="10000" fill="url(#infinite-grid)" />

                {/* Render saved strokes */}
                {strokes.map((stroke, i) => renderStroke(stroke, i))}

                {/* Render current stroke */}
                {renderCurrentStroke()}
            </svg>
        </div>
    );
}

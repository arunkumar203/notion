'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { getStroke } from 'perfect-freehand';

interface Stroke {
    points: number[][];
    color: string;
    size: number;
    tool: 'pen' | 'highlighter';
}

interface DrawingLayerProps {
    isActive: boolean;
    tool: 'pen' | 'highlighter' | 'eraser';
    color: string;
    size: number;
    onStrokesChange?: (strokes: Stroke[]) => void;
    initialStrokes?: Stroke[];
    height?: number; // Height from parent (editor)
    onRequestExpand?: () => void; // Request height expansion when drawing near bottom
}

export interface DrawingLayerHandle {
    clearDrawing: () => void;
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

const DrawingLayer = forwardRef<DrawingLayerHandle, DrawingLayerProps>(({
    isActive,
    tool,
    color,
    size,
    onStrokesChange,
    initialStrokes = [],
    height = 2000,
    onRequestExpand
}, ref) => {
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
    const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
    const canvasHeight = height; // Use height from parent
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update strokes when initialStrokes changes (clear old ones immediately to prevent cross-contamination)
    useEffect(() => {
        // Immediately clear current strokes to prevent drawings from previous page
        setStrokes([]);
        setCurrentPoints([]);
        setIsDrawing(false); // Cancel any in-progress drawing

        // Then set new strokes
        setStrokes(initialStrokes);

        // Cleanup on unmount or when changing pages
        return () => {
            setStrokes([]);
            setCurrentPoints([]);
            setIsDrawing(false);
        };
    }, [initialStrokes]);

    // Clear all strokes
    const clearAll = useCallback(() => {
        setStrokes([]);
        if (onStrokesChange) {
            onStrokesChange([]);
        }
    }, [onStrokesChange]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        clearDrawing: clearAll
    }), [clearAll]);

    const getPointerPosition = useCallback((e: PointerEvent | React.PointerEvent): [number, number] => {
        if (!svgRef.current) return [0, 0];
        const rect = svgRef.current.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!isActive) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDrawing(true);
        const point = getPointerPosition(e);
        setCurrentPoints([point]);
    }, [isActive, getPointerPosition]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDrawing || !isActive) return;
        e.preventDefault();
        e.stopPropagation();
        const point = getPointerPosition(e);
        setCurrentPoints(prev => [...prev, point]);

        // Check if drawing near bottom and request expansion
        const [, y] = point;
        const expandThreshold = 200; // Request expansion when within 200px of bottom

        if (y > canvasHeight - expandThreshold && onRequestExpand) {
            onRequestExpand();
        }

        // Real-time erasing: remove strokes as we move over them
        if (tool === 'eraser') {
            const newStrokes = strokes.filter(stroke => {
                // Check if any point in the stroke is within eraser radius of current point
                return !stroke.points.some(([sx, sy]) => {
                    const dist = Math.sqrt((point[0] - sx) ** 2 + (point[1] - sy) ** 2);
                    return dist < 20; // Eraser radius
                });
            });

            // Only update if strokes were actually removed
            if (newStrokes.length !== strokes.length) {
                setStrokes(newStrokes);
                if (onStrokesChange) {
                    onStrokesChange(newStrokes);
                }
            }
        }
    }, [isDrawing, isActive, getPointerPosition, tool, strokes, onStrokesChange, canvasHeight, onRequestExpand]);

    const handlePointerUp = useCallback(() => {
        if (!isDrawing) return;
        setIsDrawing(false);

        // Only add strokes for pen and highlighter (eraser works in real-time during move)
        if (currentPoints.length > 2 && tool !== 'eraser') {
            // Pen or Highlighter: add new stroke
            const newStroke: Stroke = {
                points: currentPoints,
                color: color,
                size: tool === 'highlighter' ? 20 : size,
                tool: tool
            };
            const newStrokes = [...strokes, newStroke];
            setStrokes(newStrokes);
            if (onStrokesChange) {
                onStrokesChange(newStrokes);
            }
        }

        setCurrentPoints([]);
    }, [isDrawing, currentPoints, tool, color, size, strokes, onStrokesChange]);

    const renderStroke = useCallback((stroke: Stroke, index: number) => {
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
                className="drawing-path"
            />
        );
    }, []);

    const renderCurrentStroke = useCallback(() => {
        if (currentPoints.length < 2) return null;

        if (tool === 'eraser') {
            const lastPoint = currentPoints[currentPoints.length - 1];
            return (
                <circle
                    cx={lastPoint[0]}
                    cy={lastPoint[1]}
                    r={20}
                    fill="none"
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
                className="drawing-path"
            />
        );
    }, [currentPoints, tool, color, size]);

    return (
        <div
            ref={containerRef}
            className="absolute top-0 left-0 right-0 pointer-events-none"
            style={{
                zIndex: isActive ? 10 : 1,
                pointerEvents: isActive ? 'auto' : 'none',
                height: `${canvasHeight}px`
            }}
        >
            <svg
                ref={svgRef}
                className="w-full h-full"
                width="100%"
                height={canvasHeight}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => {
                    if (isDrawing) handlePointerUp();
                }}
                style={{
                    cursor: isActive ? (tool === 'eraser' ? 'crosshair' : 'crosshair') : 'default',
                    touchAction: 'none',
                    display: 'block'
                }}
            >
                {/* Render saved strokes */}
                {strokes.map((stroke, i) => renderStroke(stroke, i))}

                {/* Render current stroke */}
                {isActive && renderCurrentStroke()}
            </svg>
        </div>
    );
});

DrawingLayer.displayName = 'DrawingLayer';

export default DrawingLayer;

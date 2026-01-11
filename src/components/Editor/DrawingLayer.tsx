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
    height?: number;
    onRequestExpand?: () => void;
}

export interface DrawingLayerHandle {
    clearDrawing: () => void;
}

function distanceToSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
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
    const canvasHeight = height;
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Track references to prevent reset loops
    const lastInitialStrokesRef = useRef<Stroke[]>(initialStrokes);

    // Sync with parent props
    useEffect(() => {
        if (lastInitialStrokesRef.current !== initialStrokes) {
            lastInitialStrokesRef.current = initialStrokes;
            setStrokes(initialStrokes);
            // NOTE: Do not reset isDrawing to prevent interrupting erasure
        }
    }, [initialStrokes]);

    const clearAll = useCallback(() => {
        setStrokes([]);
        if (onStrokesChange) {
            onStrokesChange([]);
        }
    }, [onStrokesChange]);

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

        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { }

        e.preventDefault();
        e.stopPropagation();
        const point = getPointerPosition(e);
        setIsDrawing(true);
        setCurrentPoints([point]);
    }, [isActive, getPointerPosition]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDrawing || !isActive) return;

        e.preventDefault();
        e.stopPropagation();
        const point = getPointerPosition(e);
        setCurrentPoints(prev => [...prev, point]);

        const [, y] = point;
        const expandThreshold = 200;

        if (y > canvasHeight - expandThreshold && onRequestExpand) {
            onRequestExpand();
        }

        if (tool === 'eraser') {
            const eraserRadius = 25;
            const [px, py] = point;

            setStrokes(prevStrokes => {
                const newStrokes = prevStrokes.filter(stroke => {
                    // Check points (fast rejection)
                    if (stroke.points.some(([sx, sy]) => Math.hypot(px - sx, py - sy) < eraserRadius)) return false;

                    // Check segments (accurate intersection)
                    for (let i = 0; i < stroke.points.length - 1; i++) {
                        const [p1x, p1y] = stroke.points[i];
                        const [p2x, p2y] = stroke.points[i + 1];
                        if (distanceToSegment(px, py, p1x, p1y, p2x, p2y) < eraserRadius) return false;
                    }
                    return true;
                });

                if (newStrokes.length !== prevStrokes.length && onStrokesChange) {
                    setTimeout(() => onStrokesChange(newStrokes), 0);
                }

                return newStrokes;
            });
        }
    }, [isDrawing, isActive, getPointerPosition, tool, canvasHeight, onRequestExpand, onStrokesChange]);

    const handlePointerUp = useCallback(() => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (currentPoints.length > 2 && tool !== 'eraser') {
            const newStroke: Stroke = {
                points: currentPoints,
                color: color,
                size: tool === 'highlighter' ? 20 : size,
                tool: tool
            };
            setStrokes(prevStrokes => {
                const newStrokes = [...prevStrokes, newStroke];
                if (onStrokesChange) {
                    setTimeout(() => onStrokesChange(newStrokes), 0);
                }
                return newStrokes;
            });
        }

        setCurrentPoints([]);
    }, [isDrawing, currentPoints, tool, color, size, onStrokesChange]);

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
                    r={25}
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

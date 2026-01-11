'use client';

import { NodeViewWrapper } from '@tiptap/react';
import { getStroke } from 'perfect-freehand';
import { useState, useRef, useEffect } from 'react';

interface Stroke {
    points: number[][];
    color: string;
    size: number;
    tool: 'pen' | 'highlighter';
}

interface DrawingCanvasProps {
    node: any;
    updateAttributes: (attrs: any) => void;
    selected: boolean;
}

const ERASER_RADIUS = 20;

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

export default function DrawingCanvas({
    node,
    updateAttributes,
    selected
}: DrawingCanvasProps) {
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
    const [strokes, setStrokes] = useState<Stroke[]>(node.attrs.strokes || []);
    const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
    const [currentColor, setCurrentColor] = useState('#000000');
    const [currentSize, setCurrentSize] = useState(3);

    const svgRef = useRef<SVGSVGElement>(null);
    const strokesRef = useRef<Stroke[]>(node.attrs.strokes || []);

    useEffect(() => {
        const s = node.attrs.strokes || [];
        setStrokes(s);
        strokesRef.current = s;
    }, [node.attrs.strokes]);

    const getPointerPosition = (e: React.PointerEvent) => {
        if (!svgRef.current) return [0, 0];
        const rect = svgRef.current.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const eraseAtPoint = (x: number, y: number) => {
        setStrokes(prev => {
            const updated = prev.filter(stroke => {
                // Check points (fast rejection)
                if (stroke.points.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < ERASER_RADIUS)) return false;

                // Check segments (accurate intersection)
                for (let i = 0; i < stroke.points.length - 1; i++) {
                    const [p1x, p1y] = stroke.points[i];
                    const [p2x, p2y] = stroke.points[i + 1];
                    if (distanceToSegment(x, y, p1x, p1y, p2x, p2y) < ERASER_RADIUS) return false;
                }
                return true;
            });
            strokesRef.current = updated;
            return updated;
        });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { }

        setIsDrawing(true);
        const [x, y] = getPointerPosition(e);

        if (currentTool === 'eraser') {
            setCurrentPoints([[x, y]]);
            eraseAtPoint(x, y);
        } else {
            setCurrentPoints([[x, y]]);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDrawing) return;
        e.preventDefault();
        const [x, y] = getPointerPosition(e);

        if (currentTool === 'eraser') {
            setCurrentPoints([[x, y]]);
            eraseAtPoint(x, y);
        } else {
            setCurrentPoints(prev => [...prev, [x, y]]);
        }
    };

    const handlePointerUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (currentTool === 'eraser') {
            updateAttributes({ strokes: strokesRef.current });
        } else if (currentPoints.length > 2) {
            const newStroke: Stroke = {
                points: currentPoints,
                color: currentColor,
                size: currentTool === 'highlighter' ? 20 : currentSize,
                tool: currentTool
            };
            const updated = [...strokesRef.current, newStroke];
            setStrokes(updated);
            strokesRef.current = updated;
            updateAttributes({ strokes: updated });
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

        return (
            <path
                key={index}
                d={getSvgPathFromStroke(pathStroke)}
                fill={stroke.color}
                opacity={stroke.tool === 'highlighter' ? 0.4 : 1}
            />
        );
    };

    const renderCurrentStroke = () => {
        if (currentTool === 'eraser' && currentPoints.length > 0) {
            const [x, y] = currentPoints[currentPoints.length - 1];
            return (
                <circle
                    cx={x}
                    cy={y}
                    r={ERASER_RADIUS}
                    fill="none"
                    stroke="#999"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                />
            );
        }

        if (currentPoints.length < 2) return null;

        const pathStroke = getStroke(currentPoints, {
            size: currentTool === 'highlighter' ? 20 : currentSize,
            thinning: currentTool === 'highlighter' ? 0 : 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: currentTool === 'pen'
        });

        return (
            <path
                d={getSvgPathFromStroke(pathStroke)}
                fill={currentColor}
                opacity={currentTool === 'highlighter' ? 0.4 : 0.7}
            />
        );
    };

    const clearCanvas = () => {
        setStrokes([]);
        strokesRef.current = [];
        updateAttributes({ strokes: [] });
    };

    return (
        <NodeViewWrapper>
            <div
                className={`my-4 border-2 rounded-lg overflow-auto ${selected ? 'border-blue-500' : 'border-gray-300'
                    }`}
                style={{ touchAction: 'none' }}
            >
                <div className="bg-gray-50 border-b p-2 flex gap-2 flex-wrap items-center">
                    <div className="flex gap-1 border-r pr-2">
                        <button
                            onClick={() => setCurrentTool('pen')}
                            className={`px-3 py-1.5 rounded text-sm ${currentTool === 'pen' ? 'bg-blue-500 text-white' : 'hover:bg-gray-100'}`}
                        >✏️ Pen</button>
                        <button
                            onClick={() => setCurrentTool('highlighter')}
                            className={`px-3 py-1.5 rounded text-sm ${currentTool === 'highlighter' ? 'bg-yellow-400' : 'hover:bg-gray-100'}`}
                        >🖍️ Highlighter</button>
                        <button
                            onClick={() => setCurrentTool('eraser')}
                            className={`px-3 py-1.5 rounded text-sm ${currentTool === 'eraser' ? 'bg-red-500 text-white' : 'hover:bg-gray-100'}`}
                        >🧹 Eraser</button>
                    </div>

                    {currentTool !== 'eraser' && (
                        <div className="flex items-center gap-2 border-r pr-2">
                            <input type="color" value={currentColor} onChange={e => setCurrentColor(e.target.value)} className="w-6 h-6 p-0 border-0" />
                            {currentTool === 'pen' && (
                                <input type="range" min="1" max="10" value={currentSize} onChange={e => setCurrentSize(+e.target.value)} className="w-20" />
                            )}
                        </div>
                    )}

                    <button onClick={clearCanvas} className="ml-auto px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded">🗑️ Clear</button>
                </div>

                <svg
                    ref={svgRef}
                    width="3000"
                    height="500"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="bg-white"
                    style={{ cursor: currentTool === 'eraser' ? 'crosshair' : 'crosshair', touchAction: 'none', display: 'block' }}
                >
                    <defs>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect width="3000" height="500" fill="url(#grid)" />

                    {strokes.map((stroke, i) => renderStroke(stroke, i))}
                    {renderCurrentStroke()}
                </svg>
            </div>
        </NodeViewWrapper>
    );
}

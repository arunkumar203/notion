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

export default function DrawingCanvas({ node, updateAttributes, selected }: DrawingCanvasProps) {
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
    const [strokes, setStrokes] = useState<Stroke[]>(node.attrs.strokes || []);
    const [currentTool, setCurrentTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
    const [currentColor, setCurrentColor] = useState('#000000');
    const [currentSize, setCurrentSize] = useState(3);
    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const getPointerPosition = (e: React.PointerEvent) => {
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
    };

    const handlePointerUp = () => {
        if (!isDrawing) return;
        setIsDrawing(false);

        if (currentPoints.length > 2) {
            if (currentTool === 'eraser') {
                // Eraser: remove strokes that intersect
                const newStrokes = strokes.filter(stroke => {
                    // Simple collision detection
                    return !currentPoints.some(([x, y]) => {
                        return stroke.points.some(([sx, sy]) => {
                            const dist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
                            return dist < 20; // Eraser radius
                        });
                    });
                });
                setStrokes(newStrokes);
                updateAttributes({ strokes: newStrokes });
            } else {
                // Pen or Highlighter: add new stroke
                const newStroke: Stroke = {
                    points: currentPoints,
                    color: currentColor,
                    size: currentTool === 'highlighter' ? 20 : currentSize,
                    tool: currentTool
                };
                const newStrokes = [...strokes, newStroke];
                setStrokes(newStrokes);
                updateAttributes({ strokes: newStrokes });
            }
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

        if (currentTool === 'eraser') {
            // Show eraser circle
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
            size: currentTool === 'highlighter' ? 20 : currentSize,
            thinning: currentTool === 'highlighter' ? 0 : 0.5,
            smoothing: 0.5,
            streamline: 0.5,
            simulatePressure: currentTool === 'pen'
        });

        const pathData = getSvgPathFromStroke(pathStroke);

        return (
            <path
                d={pathData}
                fill={currentColor}
                opacity={currentTool === 'highlighter' ? 0.4 : 0.7}
            />
        );
    };

    const clearCanvas = () => {
        setStrokes([]);
        updateAttributes({ strokes: [] });
    };

    return (
        <NodeViewWrapper>
            <div
                ref={containerRef}
                className={`my-4 border-2 rounded-lg overflow-hidden ${selected ? 'border-blue-500' : 'border-gray-300'
                    }`}
                style={{ touchAction: 'none' }}
            >
                {/* Toolbar */}
                <div className="bg-gray-50 border-b border-gray-300 p-2 flex items-center gap-2 flex-wrap">
                    {/* Tool Selection */}
                    <div className="flex gap-1 border-r border-gray-300 pr-2">
                        <button
                            onClick={() => setCurrentTool('pen')}
                            className={`px-3 py-1.5 rounded text-sm font-medium ${currentTool === 'pen'
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Pen"
                        >
                            ✏️ Pen
                        </button>
                        <button
                            onClick={() => setCurrentTool('highlighter')}
                            className={`px-3 py-1.5 rounded text-sm font-medium ${currentTool === 'highlighter'
                                    ? 'bg-yellow-400 text-gray-900'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Highlighter"
                        >
                            🖍️ Highlighter
                        </button>
                        <button
                            onClick={() => setCurrentTool('eraser')}
                            className={`px-3 py-1.5 rounded text-sm font-medium ${currentTool === 'eraser'
                                    ? 'bg-red-500 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Eraser"
                        >
                            🧹 Eraser
                        </button>
                    </div>

                    {/* Color Picker */}
                    {currentTool !== 'eraser' && (
                        <div className="flex items-center gap-2 border-r border-gray-300 pr-2">
                            <span className="text-xs text-gray-600">Color:</span>
                            <input
                                type="color"
                                value={currentColor}
                                onChange={(e) => setCurrentColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer"
                            />
                            <div className="flex gap-1">
                                {['#000000', '#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF'].map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setCurrentColor(color)}
                                        className={`w-6 h-6 rounded border-2 ${currentColor === color ? 'border-gray-900' : 'border-gray-300'
                                            }`}
                                        style={{ backgroundColor: color }}
                                        title={color}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Size Selector */}
                    {currentTool === 'pen' && (
                        <div className="flex items-center gap-2 border-r border-gray-300 pr-2">
                            <span className="text-xs text-gray-600">Size:</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={currentSize}
                                onChange={(e) => setCurrentSize(Number(e.target.value))}
                                className="w-20"
                            />
                            <span className="text-xs text-gray-600 w-6">{currentSize}</span>
                        </div>
                    )}

                    {/* Clear Button */}
                    <button
                        onClick={clearCanvas}
                        className="px-3 py-1.5 rounded text-sm font-medium bg-white text-red-600 hover:bg-red-50 border border-red-300"
                        title="Clear all"
                    >
                        🗑️ Clear
                    </button>

                    <div className="text-xs text-gray-500 ml-auto">
                        {strokes.length} stroke{strokes.length !== 1 ? 's' : ''}
                    </div>
                </div>

                {/* Infinite Horizontal Canvas */}
                <div className="overflow-x-auto overflow-y-hidden" style={{ height: '500px' }}>
                    <svg
                        ref={svgRef}
                        width="3000" // Infinite horizontal width
                        height="500"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={() => {
                            if (isDrawing) handlePointerUp();
                        }}
                        className="bg-white"
                        style={{
                            cursor: currentTool === 'eraser' ? 'crosshair' : 'crosshair',
                            touchAction: 'none'
                        }}
                    >
                        {/* Grid pattern for visual reference */}
                        <defs>
                            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#f0f0f0" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="3000" height="500" fill="url(#grid)" />

                        {/* Render saved strokes */}
                        {strokes.map((stroke, i) => renderStroke(stroke, i))}

                        {/* Render current stroke */}
                        {renderCurrentStroke()}
                    </svg>
                </div>
            </div>
        </NodeViewWrapper>
    );
}

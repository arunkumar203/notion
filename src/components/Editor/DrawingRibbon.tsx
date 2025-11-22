'use client';

import { FiEdit2, FiType } from 'react-icons/fi';
import { TbPencil, TbHighlight, TbEraser } from 'react-icons/tb';

interface DrawingRibbonProps {
    mode: 'type' | 'draw';
    onModeChange: (mode: 'type' | 'draw') => void;
    tool: 'pen' | 'highlighter' | 'eraser';
    onToolChange: (tool: 'pen' | 'highlighter' | 'eraser') => void;
    color: string;
    onColorChange: (color: string) => void;
    size: number;
    onSizeChange: (size: number) => void;
    onClear?: () => void;
}

const PRESET_COLORS = [
    '#000000', // Black
    '#FF0000', // Red
    '#0000FF', // Blue
    '#00FF00', // Green
    '#FFFF00', // Yellow
    '#FF00FF', // Magenta
    '#00FFFF', // Cyan
    '#FFA500', // Orange
    '#800080', // Purple
    '#FFC0CB', // Pink
];

export default function DrawingRibbon({
    mode,
    onModeChange,
    tool,
    onToolChange,
    color,
    onColorChange,
    size,
    onSizeChange,
    onClear
}: DrawingRibbonProps) {
    return (
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-4 flex-wrap">
            {/* Mode Toggle */}
            <div className="flex gap-1 border-r border-gray-300 pr-4">
                <button
                    onClick={() => onModeChange('type')}
                    className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${mode === 'type'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                    title="Type mode (T)"
                >
                    <FiType size={16} />
                    <span>Type</span>
                </button>
                <button
                    onClick={() => onModeChange('draw')}
                    className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${mode === 'draw'
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                    title="Draw mode (D)"
                >
                    <FiEdit2 size={16} />
                    <span>Draw</span>
                </button>
            </div>

            {/* Drawing Tools - Only visible in draw mode */}
            {mode === 'draw' && (
                <>
                    {/* Tool Selection */}
                    <div className="flex gap-1 border-r border-gray-300 pr-4">
                        <button
                            onClick={() => onToolChange('pen')}
                            className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${tool === 'pen'
                                    ? 'bg-indigo-500 text-white shadow-sm'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Pen (P)"
                        >
                            <TbPencil size={18} />
                            <span>Pen</span>
                        </button>
                        <button
                            onClick={() => onToolChange('highlighter')}
                            className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${tool === 'highlighter'
                                    ? 'bg-yellow-400 text-gray-900 shadow-sm'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Highlighter (H)"
                        >
                            <TbHighlight size={18} />
                            <span>Highlighter</span>
                        </button>
                        <button
                            onClick={() => onToolChange('eraser')}
                            className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${tool === 'eraser'
                                    ? 'bg-red-500 text-white shadow-sm'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Eraser (E)"
                        >
                            <TbEraser size={18} />
                            <span>Eraser</span>
                        </button>
                    </div>

                    {/* Color Picker - Hidden for eraser */}
                    {tool !== 'eraser' && (
                        <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
                            <span className="text-xs text-gray-600 font-medium">Color:</span>
                            <input
                                type="color"
                                value={color}
                                onChange={(e) => onColorChange(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                                title="Custom color"
                            />
                            <div className="flex gap-1">
                                {PRESET_COLORS.map(presetColor => (
                                    <button
                                        key={presetColor}
                                        onClick={() => onColorChange(presetColor)}
                                        className={`w-6 h-6 rounded border-2 transition-all ${color.toUpperCase() === presetColor.toUpperCase()
                                                ? 'border-gray-900 scale-110'
                                                : 'border-gray-300 hover:scale-105'
                                            }`}
                                        style={{ backgroundColor: presetColor }}
                                        title={presetColor}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Size Selector - Only for pen */}
                    {tool === 'pen' && (
                        <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
                            <span className="text-xs text-gray-600 font-medium">Size:</span>
                            <input
                                type="range"
                                min="1"
                                max="10"
                                value={size}
                                onChange={(e) => onSizeChange(Number(e.target.value))}
                                className="w-24 cursor-pointer"
                            />
                            <span className="text-xs text-gray-600 font-medium w-6 text-center">{size}</span>
                        </div>
                    )}

                    {/* Clear Button */}
                    {onClear && (
                        <button
                            onClick={onClear}
                            className="px-3 py-2 rounded text-sm font-medium bg-white text-red-600 hover:bg-red-50 border border-red-300 transition-colors"
                            title="Clear all drawings"
                        >
                            Clear All
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

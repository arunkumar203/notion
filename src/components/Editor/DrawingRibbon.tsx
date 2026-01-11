'use client';

import { useState, useRef, useEffect } from 'react';
import { FiEdit2, FiType, FiSettings, FiGrid, FiLayout } from 'react-icons/fi';
import { TbPencil, TbHighlight, TbEraser } from 'react-icons/tb';

// View pattern types
export type RuleLineType = 'narrow' | 'college' | 'standard' | 'wide';
export type GridType = 'small' | 'medium' | 'large' | 'very-large';
export type ViewPattern = { type: 'none' } | { type: 'rule'; style: RuleLineType } | { type: 'grid'; style: GridType };

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
    viewPattern?: ViewPattern;
    onViewPatternChange?: (pattern: ViewPattern) => void;
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

// Rule line configurations (spacing in pixels)
const RULE_LINE_CONFIG: Record<RuleLineType, { spacing: number; label: string }> = {
    narrow: { spacing: 16, label: 'Narrow Ruled' },
    college: { spacing: 24, label: 'College Ruled' },
    standard: { spacing: 28, label: 'Standard' },
    wide: { spacing: 36, label: 'Wide Ruled' },
};

// Grid configurations (cell size in pixels)
const GRID_CONFIG: Record<GridType, { size: number; label: string }> = {
    small: { size: 16, label: 'Small' },
    medium: { size: 24, label: 'Medium' },
    large: { size: 32, label: 'Large' },
    'very-large': { size: 48, label: 'Very Large' },
};

// Preview component for rule lines
function RuleLinePreview({ type, selected }: { type: RuleLineType; selected: boolean }) {
    const config = RULE_LINE_CONFIG[type];
    const spacing = Math.min(config.spacing, 12);

    return (
        <div
            className={`w-14 h-14 border-2 rounded cursor-pointer transition-all ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'
                }`}
            style={{ backgroundColor: '#fff' }}
        >
            <svg width="100%" height="100%" viewBox="0 0 56 56">
                {/* Blue horizontal lines */}
                {Array.from({ length: Math.floor(48 / spacing) }).map((_, i) => (
                    <line
                        key={i}
                        x1="4"
                        y1={8 + i * spacing}
                        x2="52"
                        y2={8 + i * spacing}
                        stroke="#93c5fd"
                        strokeWidth="1"
                    />
                ))}
            </svg>
        </div>
    );
}

// Preview component for grid
function GridPreview({ type, selected }: { type: GridType; selected: boolean }) {
    const config = GRID_CONFIG[type];
    const cellSize = Math.min(config.size, 14);

    return (
        <div
            className={`w-14 h-14 border-2 rounded cursor-pointer transition-all ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300 hover:border-gray-400'
                }`}
            style={{ backgroundColor: '#fff' }}
        >
            <svg width="100%" height="100%" viewBox="0 0 56 56">
                {/* Vertical lines */}
                {Array.from({ length: Math.floor(48 / cellSize) + 1 }).map((_, i) => (
                    <line
                        key={`v${i}`}
                        x1={4 + i * cellSize}
                        y1="4"
                        x2={4 + i * cellSize}
                        y2="52"
                        stroke="#93c5fd"
                        strokeWidth="1"
                    />
                ))}
                {/* Horizontal lines */}
                {Array.from({ length: Math.floor(48 / cellSize) + 1 }).map((_, i) => (
                    <line
                        key={`h${i}`}
                        x1="4"
                        y1={4 + i * cellSize}
                        x2="52"
                        y2={4 + i * cellSize}
                        stroke="#93c5fd"
                        strokeWidth="1"
                    />
                ))}
            </svg>

        </div>
    );
}

export default function DrawingRibbon({
    mode,
    onModeChange,
    tool,
    onToolChange,
    color,
    onColorChange,
    size,
    onSizeChange,
    onClear,
    viewPattern = { type: 'none' },
    onViewPatternChange,
}: DrawingRibbonProps) {
    const [showSettings, setShowSettings] = useState(false);
    const [showViewSubmenu, setShowViewSubmenu] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const viewSubmenuRef = useRef<HTMLDivElement>(null);

    // Close settings when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setShowSettings(false);
                setShowViewSubmenu(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handlePatternSelect = (pattern: ViewPattern) => {
        onViewPatternChange?.(pattern);
        setShowSettings(false);
        setShowViewSubmenu(false);
    };

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

            {/* Settings Button */}
            <div className="relative" ref={settingsRef}>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`px-3 py-2 rounded flex items-center gap-2 text-sm font-medium transition-colors ${showSettings
                        ? 'bg-gray-200 text-gray-900'
                        : 'bg-white text-gray-700 hover:bg-gray-100'
                        }`}
                    title="Settings"
                >
                    <FiSettings size={16} />
                    <span>Settings</span>
                </button>

                {/* Settings Dropdown */}
                {showSettings && (
                    <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[160px]">
                        {/* View Option - Shows submenu on hover */}
                        <div
                            className="relative"
                            onMouseEnter={() => setShowViewSubmenu(true)}
                            onMouseLeave={() => setShowViewSubmenu(false)}
                        >
                            <button
                                className="w-full px-4 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 flex items-center justify-between gap-2"
                            >
                                <span className="flex items-center gap-2">
                                    <FiLayout size={16} />
                                    View
                                </span>
                                <span className="text-gray-400">▶</span>
                            </button>

                            {/* View Submenu - appears on right */}
                            {showViewSubmenu && (
                                <div
                                    ref={viewSubmenuRef}
                                    className="absolute left-full top-0 ml-1 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 min-w-[340px]"
                                    onMouseEnter={() => setShowViewSubmenu(true)}
                                    onMouseLeave={() => setShowViewSubmenu(false)}
                                >
                                    {/* Rule Lines Section */}
                                    <div className="mb-4">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Rule Lines</h3>
                                        <div className="flex gap-2">
                                            {(['narrow', 'college', 'standard', 'wide'] as RuleLineType[]).map((ruleType) => (
                                                <div key={ruleType} className="flex flex-col items-center gap-1">
                                                    <div onClick={() => handlePatternSelect({ type: 'rule', style: ruleType })}>
                                                        <RuleLinePreview
                                                            type={ruleType}
                                                            selected={viewPattern.type === 'rule' && viewPattern.style === ruleType}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-600">{RULE_LINE_CONFIG[ruleType].label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Grid Section */}
                                    <div className="mb-4">
                                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Grid</h3>
                                        <div className="flex gap-2">
                                            {(['small', 'medium', 'large', 'very-large'] as GridType[]).map((gridType) => (
                                                <div key={gridType} className="flex flex-col items-center gap-1">
                                                    <div onClick={() => handlePatternSelect({ type: 'grid', style: gridType })}>
                                                        <GridPreview
                                                            type={gridType}
                                                            selected={viewPattern.type === 'grid' && viewPattern.style === gridType}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-gray-600">{GRID_CONFIG[gridType].label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* None Option */}
                                    <div className="pt-2 border-t border-gray-200">
                                        <button
                                            onClick={() => handlePatternSelect({ type: 'none' })}
                                            className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors w-full ${viewPattern.type === 'none'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'hover:bg-gray-100 text-gray-700'
                                                }`}
                                        >
                                            <div className="w-5 h-5 border-2 border-gray-300 rounded bg-white"></div>
                                            <span>None</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
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

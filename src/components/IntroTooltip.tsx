'use client';

import { useState, useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';

interface IntroTooltipProps {
    targetRef: React.RefObject<HTMLElement>;
    show: boolean;
    onClose: () => void;
    title: string;
    description: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
    offset?: number;
}

export default function IntroTooltip({
    targetRef,
    show,
    onClose,
    title,
    description,
    position = 'bottom',
    offset = 12
}: IntroTooltipProps) {
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!show || !targetRef.current || !tooltipRef.current) return;

        const updatePosition = () => {
            const target = targetRef.current;
            const tooltip = tooltipRef.current;
            if (!target || !tooltip) return;

            const targetRect = target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();

            let top = 0;
            let left = 0;

            switch (position) {
                case 'bottom':
                    top = targetRect.bottom + offset;
                    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                    break;
                case 'top':
                    top = targetRect.top - tooltipRect.height - offset;
                    left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                    break;
                case 'right':
                    top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                    left = targetRect.right + offset;
                    break;
                case 'left':
                    top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                    left = targetRect.left - tooltipRect.width - offset;
                    break;
            }

            // Keep tooltip within viewport
            const padding = 16;
            const maxLeft = window.innerWidth - tooltipRect.width - padding;
            const maxTop = window.innerHeight - tooltipRect.height - padding;

            left = Math.max(padding, Math.min(left, maxLeft));
            top = Math.max(padding, Math.min(top, maxTop));

            setTooltipPosition({ top, left });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition);
        };
    }, [show, targetRef, position, offset]);

    if (!show) return null;

    const getCurvedArrow = () => {
        switch (position) {
            case 'bottom':
                return (
                    <svg
                        className="absolute top-2 -left-32"
                        width="120"
                        height="60"
                        viewBox="0 0 120 60"
                        style={{ zIndex: 1000 }}
                    >
                        <path
                            d="M20 40 Q60 10, 100 20"
                            stroke="#374151"
                            strokeWidth="3"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d="M96 17 L100 20 L97 24"
                            stroke="#374151"
                            strokeWidth="3"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                );
            case 'top':
                return (
                    <svg
                        className="absolute -bottom-12 left-8"
                        width="60"
                        height="48"
                        viewBox="0 0 60 48"
                    >
                        <path
                            d="M10 8 Q30 38, 50 43"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d="M46 46 L50 43 L47 39"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                );
            case 'right':
                return (
                    <svg
                        className="absolute -left-12 top-8"
                        width="48"
                        height="60"
                        viewBox="0 0 48 60"
                    >
                        <path
                            d="M40 10 Q10 30, 5 50"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d="M2 46 L5 50 L9 47"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                );
            case 'left':
                return (
                    <svg
                        className="absolute -right-12 top-8"
                        width="48"
                        height="60"
                        viewBox="0 0 48 60"
                    >
                        <path
                            d="M8 10 Q38 30, 43 50"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                        />
                        <path
                            d="M46 46 L43 50 L39 47"
                            stroke="#374151"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                );
            default:
                return null;
        }
    };

    return (
        <div
            ref={tooltipRef}
            className="fixed z-50 max-w-sm"
            style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
            }}
        >
            {/* VISIBLE ARROW */}
            <div
                className="absolute top-8 -left-12 w-8 h-1 bg-red-500"
                style={{ zIndex: 10000 }}
            />
            <div
                className="absolute top-6 -left-16 w-4 h-4 bg-blue-500"
                style={{ zIndex: 10000 }}
            >
                →
            </div>

            {/* Content */}
            <div className="bg-white text-gray-900 rounded-lg p-4 shadow-xl border border-gray-200">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-2 text-gray-900">{title}</h3>
                        <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-700"
                        aria-label="Close tooltip"
                    >
                        <FiX size={16} />
                    </button>
                </div>

                {/* Got it button */}
                <div className="mt-3 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                        Got it!
                    </button>
                </div>
            </div>
        </div>
    );
}
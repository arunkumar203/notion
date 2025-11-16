'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FiCheckSquare } from 'react-icons/fi';
import TodoistWidget from './TodoistWidget';

export default function TasksButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Calculate position based on available space
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < 600 && spaceAbove > spaceBelow) {
        setPosition('top');
      } else {
        setPosition('bottom');
      }
    }
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        widgetRef.current &&
        !widgetRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors shadow-sm"
        title="Open Tasks"
      >
        <FiCheckSquare size={18} className="text-indigo-600" />
        <span>Tasks</span>
      </button>

      {isOpen && (
        <div
          ref={widgetRef}
          className={`absolute z-50 ${position === 'bottom'
            ? 'top-full mt-2'
            : 'bottom-full mb-2'
            } right-0 animate-in fade-in duration-200`}
          style={{
            filter: 'drop-shadow(0 20px 25px rgb(0 0 0 / 0.15))',
          }}
        >
          <TodoistWidget onClose={() => setIsOpen(false)} />
        </div>
      )}
    </div>
  );
}

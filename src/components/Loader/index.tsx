"use client";

import React from 'react';

type LoaderProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  className?: string;
  align?: 'center' | 'start';
};

const sizeMap: Record<NonNullable<LoaderProps['size']>, string> = {
  xs: 'h-4 w-4',
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-14 w-14',
  xl: 'h-16 w-16',
};

export default function Loader({ size = 'md', text, className = '', align = 'center' }: LoaderProps) {
  const alignClasses = align === 'center' ? 'items-center justify-center' : 'items-start justify-start';
  return (
    <div className={`flex flex-col ${alignClasses} ${className}`}>
      <div
        className={`${sizeMap[size]} rounded-full animate-spin border-t-2 border-b-2 border-blue-500`}
        aria-label={text || 'Loading'}
      />
      {text ? (
        <div className="mt-3 text-sm text-gray-600">{text}</div>
      ) : null}
    </div>
  );
}

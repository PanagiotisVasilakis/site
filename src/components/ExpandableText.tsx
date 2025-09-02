"use client";
import React, { useState } from 'react';

interface ExpandableTextProps {
  children: React.ReactNode;
  maxLines?: number;
  className?: string;
  expandText?: string;
  collapseText?: string;
  forceExpanded?: boolean; // externally control full expansion
  disableClamp?: boolean;  // skip line clamp altogether
}

export default function ExpandableText({ 
  children, 
  maxLines = 3, 
  className = '',
  expandText = 'Show more',
  collapseText = 'Show less',
  forceExpanded,
  disableClamp
}: ExpandableTextProps) {
  const [userExpanded, setUserExpanded] = useState(false);
  const isExpanded = forceExpanded || userExpanded || disableClamp;

  return (
    <div className={className}>
      <div 
        className={`transition-[max-height] duration-300 ease-in-out break-words [overflow-wrap:anywhere] ${!isExpanded ? `line-clamp-${maxLines}` : ''}`}
        style={isExpanded ? { overflow:'visible'} : { overflow:'hidden' }}
      >
        <div className="[word-break:break-word] whitespace-pre-wrap leading-relaxed">
          {children}
        </div>
      </div>
      
      {!disableClamp && !forceExpanded && (
        <button
          onClick={() => setUserExpanded(!userExpanded)}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              {collapseText}
              <SimpleChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              {expandText}
              <SimpleChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

// If heroicons is not available, create simple arrow components
export function SimpleChevronDown({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function SimpleChevronUp({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

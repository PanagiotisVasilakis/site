"use client";
import React, { useState } from 'react';
import { SimpleChevronDown, SimpleChevronUp } from './ExpandableText';

interface AmenitiesListProps {
  amenities: string[];
  maxInitialItems?: number;
  className?: string;
}

export default function AmenitiesList({ 
  amenities, 
  maxInitialItems = 6,
  className = '' 
}: AmenitiesListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const displayedAmenities = isExpanded ? amenities : amenities.slice(0, maxInitialItems);
  const hasMore = amenities.length > maxInitialItems;

  return (
    <div className={className}>
  <ul className="space-y-2 text-sm text-[color:var(--fg-muted)]">
        {displayedAmenities.map((amenity, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="text-green-600" aria-hidden>✓</span>
            {amenity}
          </li>
        ))}
      </ul>
      
      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              Show less amenities
              <SimpleChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show all {amenities.length} amenities
              <SimpleChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

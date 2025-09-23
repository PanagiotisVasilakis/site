import React from 'react';
import { MAP_LOADING_STATES, MAP_CSS_CLASSES, MAP_DEFAULTS } from '@/lib/mapConstants';

interface MapLoadingSkeletonProps {
  height?: string;
  message?: string;
  className?: string;
}

export default function MapLoadingSkeleton({ 
  height = MAP_DEFAULTS.HEIGHT.DEFAULT,
  message = MAP_LOADING_STATES.DEFAULT,
  className = ''
}: MapLoadingSkeletonProps) {
  return (
    <div 
      className={`${MAP_CSS_CLASSES.LOADING_CONTAINER} ${className}`}
      style={{ height }}
    >
      <div className={MAP_CSS_CLASSES.LOADING_TEXT}>
        {message}
      </div>
    </div>
  );
}
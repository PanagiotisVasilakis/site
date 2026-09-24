"use client";

import React from 'react';
import { useParams } from 'next/navigation';
import { MAP_CSS_CLASSES, MAP_DEFAULTS } from '@/lib/mapConstants';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

interface MapLoadingSkeletonProps {
  height?: string;
}

export default function MapLoadingSkeleton({ 
  height = MAP_DEFAULTS.HEIGHT.DEFAULT,
}: MapLoadingSkeletonProps) {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = params?.locale === 'el' ? 'el' : 'en';
  const localizedMessage = getDictionary(locale).map?.loading ?? 'Loading map...';

  return (
    <div 
      className={MAP_CSS_CLASSES.LOADING_CONTAINER}
      style={{ height }}
    >
      <div className={MAP_CSS_CLASSES.LOADING_TEXT}>
        {localizedMessage}
      </div>
    </div>
  );
}
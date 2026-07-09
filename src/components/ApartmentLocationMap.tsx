"use client";
import React, { useMemo } from 'react';
import InteractiveMap from './InteractiveMap';
import { getKalamataMarkers } from '@/lib/mapUtils';
import type { MapContentItem } from '@/data/mapLocations';
import type { Locale } from '@/i18n/config';

interface ApartmentLocationMapProps {
  locale: string;
  height?: string;
  zoom?: number;
  className?: string;
  contentItems?: MapContentItem[];
  includeLandmarks?: boolean;
  activation?: 'viewport' | 'intent';
}

export default function ApartmentLocationMap({
  locale,
  height = "300px",
  zoom = 14,
  className = "",
  contentItems = [],
  includeLandmarks = true,
  activation = 'viewport'
}: ApartmentLocationMapProps) {
  const effLocale: Locale = locale === 'el' ? 'el' : 'en';
  const markers = useMemo(
    () => getKalamataMarkers(effLocale, contentItems, { includeLandmarks }),
    [contentItems, effLocale, includeLandmarks]
  );

  return (
    <InteractiveMap
      markers={markers}
      zoom={zoom}
      height={height}
      className={className}
      locale={effLocale}
      activation={activation}
      clusterMin={20}
    />
  );
}

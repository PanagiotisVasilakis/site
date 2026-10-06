"use client";
import { useMemo } from 'react';
import InteractiveMap from './InteractiveMap';
import { getKalamataMapLocations, type MapContentItem } from '@/data/mapLocations';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';

interface ApartmentLocationMapProps {
  locale: string;
  height?: string;
  zoom?: number;
  className?: string;
  contentItems?: MapContentItem[];
  cartoBasemapsKey?: string;
  /** Number the content items' pins 1…n in the given order (the guide's map list, identity §9.5). */
  numbered?: boolean;
}

export default function ApartmentLocationMap({
  locale,
  height = "300px",
  zoom = 14,
  className = "",
  contentItems = [],
  cartoBasemapsKey,
  numbered = false,
}: ApartmentLocationMapProps) {
  const effLocale: Locale = normalizeLocale(locale);
  const markers = useMemo(
    () => getKalamataMapLocations(effLocale, contentItems, { numbered }),
    [contentItems, effLocale, numbered]
  );

  return (
    <InteractiveMap
      markers={markers}
      zoom={zoom}
      height={height}
      className={className}
      locale={effLocale}
      cartoBasemapsKey={cartoBasemapsKey}
    />
  );
}

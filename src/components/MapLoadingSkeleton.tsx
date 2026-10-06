"use client";

import { useParams } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';

interface MapLoadingSkeletonProps {
  height: string;
}

export default function MapLoadingSkeleton({ 
  height,
}: MapLoadingSkeletonProps) {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = normalizeLocale(params?.locale);
  const localizedMessage = getDictionary(locale).map.loading;

  return (
    <div className="map-placeholder" style={{ height }}>
      <p className="map-placeholder__text">{localizedMessage}</p>
    </div>
  );
}
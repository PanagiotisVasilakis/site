"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import StaticLocationMap from './StaticLocationMap';
import { MarkerData, APARTMENT_LOCATION } from '@/lib/mapUtils';
import type { LeafletMarkerData } from '@/components/LeafletMap';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

// Re-export utilities for backwards compatibility
export { createMarkerFromItem, type MarkerData } from '@/lib/mapUtils';

interface InteractiveMapProps {
  markers?: MarkerData[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  onMarkerClick?: (marker: MarkerData) => void;
  locale?: string; // for localized static fallback
}

export default function InteractiveMap({
  markers = [],
  center = APARTMENT_LOCATION,
  zoom = 13,
  height = "400px",
  className = "",
  onMarkerClick,
  locale = 'en'
}: InteractiveMapProps) {
  const eff: Locale = locale === 'el' ? 'el' : 'en';
  const dict = getDictionary(eff);
  const mapT = dict.map;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderInteractive, setShouldRenderInteractive] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setShouldRenderInteractive(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setShouldRenderInteractive(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px 0px', threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMounted]);

  const leafletMarkers = useMemo<LeafletMarkerData[]>(() => {
    const deduped: MarkerData[] = [];
    const seen = new Set<string>();
    markers.forEach(marker => {
      if (seen.has(marker.id)) return;
      seen.add(marker.id);
      deduped.push(marker);
    });

    if (!deduped.some(marker => marker.id === 'apartment' || marker.type === 'apartment')) {
      deduped.unshift({
        id: 'apartment',
  name: mapT?.apartmentMarkerTitle || 'Apartment',
  description: mapT?.apartmentMarkerDesc,
        coordinates: APARTMENT_LOCATION,
        type: 'apartment',
        price: '€150/night'
      });
    }

    return deduped.map<LeafletMarkerData>(marker => ({
      id: marker.id,
      name: marker.name,
      description: marker.description,
      coordinates: marker.coordinates,
      type: marker.type,
      price: marker.price
    }));
  }, [markers, mapT]);

  const handleMarkerClick = useMemo(() => {
    if (!onMarkerClick) return undefined;
    return (marker: LeafletMarkerData) => {
      const typed: MarkerData = {
        id: marker.id,
        name: marker.name,
        description: marker.description,
        coordinates: marker.coordinates,
        type: (marker.type as MarkerData['type']) ?? 'attraction',
        price: marker.price
      };
      onMarkerClick(typed);
    };
  }, [onMarkerClick]);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {shouldRenderInteractive ? (
        <LeafletMap
          center={center}
          zoom={zoom}
          height={height}
          markers={leafletMarkers}
          onMarkerClick={handleMarkerClick}
          origin={APARTMENT_LOCATION}
          showOriginMarker={false}
          autoFitToOriginAndMarkers
          refitOnMarkerChange
          showRefitAllControl
          lazyTravelMetrics
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border border-brand-200 bg-gradient-to-br from-brand-50 to-brand-100 text-center text-sm text-brand-700">
          <div className="mb-2 text-3xl" aria-hidden>🗺️</div>
          <p className="max-w-xs leading-relaxed px-6">
            {mapT?.deferredInteractiveLabel || 'Interactive map loads once it is in view to keep things speedy.'}
          </p>
        </div>
      )}
      <noscript>
  <StaticLocationMap height={height} className="mt-4" title={mapT?.apartmentMarkerTitle} locale={locale} showHeading={false} />
      </noscript>
    </div>
  );
}



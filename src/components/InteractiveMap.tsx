"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';
import StaticLocationMap from './StaticLocationMap';
import {
  APARTMENT_LOCATION,
  toLeafletMarker,
  type MarkerData,
} from '@/lib/mapUtils';
import type { LeafletMapLabels, LeafletMarkerData } from '@/components/LeafletMap';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

interface InteractiveMapProps {
  markers?: MarkerData[];
  zoom?: number;
  height?: string;
  className?: string;
  locale?: string; // for localized static fallback
  activation?: 'viewport' | 'intent';
  clusterMin?: number;
}

export default function InteractiveMap({
  markers = [],
  zoom = 13,
  height = "400px",
  className = "",
  locale = 'en',
  activation = 'viewport',
  clusterMin
}: InteractiveMapProps) {
  const eff: Locale = normalizeLocale(locale);
  const dict = useMemo(() => getDictionary(eff), [eff]);
  const mapT = dict.map;
  const leafletLabels = useMemo<LeafletMapLabels>(() => ({
    address: mapT.address,
    phone: mapT.phone,
    directions: mapT.directions,
    website: mapT.website,
    details: mapT.viewDetails,
    locateMe: mapT.locateMe,
    locationUnavailable: mapT.locationUnavailable,
    fitToMarkers: mapT.fitToMarkers,
    zoomIn: mapT.zoomIn,
    zoomOut: mapT.zoomOut,
    approximate: mapT.approximate,
    travelUnavailable: mapT.travelUnavailable,
    travelUnavailableWithDirections: mapT.travelUnavailableWithDirections,
    unavailable: mapT.unavailable,
  }), [mapT]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderInteractive, setShouldRenderInteractive] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    if (activation === 'intent') return;
    const el = containerRef.current;
    if (!el) return;

    const IntersectionObserverCtor =
      typeof window !== 'undefined'
        ? window.IntersectionObserver ?? globalThis.IntersectionObserver
        : undefined;

    if (!IntersectionObserverCtor) {
      setShouldRenderInteractive(true);
      return;
    }

    const observer = new IntersectionObserverCtor(
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
  }, [hasMounted, activation]);

  // getKalamataMapLocations always includes the apartment marker, so no insertion is needed.
  const leafletMarkers = useMemo<LeafletMarkerData[]>(
    () => markers.map(toLeafletMarker),
    [markers]
  );

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {shouldRenderInteractive ? (
        <LeafletMap
          center={APARTMENT_LOCATION}
          zoom={zoom}
          height={height}
          markers={leafletMarkers}
          origin={APARTMENT_LOCATION}
          autoFitToOriginAndMarkers
          refitOnMarkerChange
          lazyTravelMetrics
          clusterMin={clusterMin}
          travelPrompt={mapT?.travelPrompt}
          labels={leafletLabels}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border border-[color:var(--border-soft)] surface-subtle text-center text-sm text-[color:var(--text-accent)]">
          <div className="mb-2 text-3xl" aria-hidden>🗺️</div>
          <p className="max-w-xs leading-relaxed px-6">
            {mapT.deferredInteractiveLabel}
          </p>
          {activation === 'intent' && (
            <button
              type="button"
              className="btn-tint mt-4 min-h-11"
              onClick={() => setShouldRenderInteractive(true)}
            >
              {mapT.loadMap}
            </button>
          )}
        </div>
      )}
      <noscript>
        <StaticLocationMap height={height} className="mt-4" title={mapT?.apartmentMarkerTitle} locale={locale} showHeading={false} />
      </noscript>
    </div>
  );
}

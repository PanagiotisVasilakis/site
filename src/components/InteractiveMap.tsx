"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import StaticLocationMap from './StaticLocationMap';
import {
  APARTMENT_LOCATION,
  dedupeMarkers,
  markerFromMapLocation,
  toLeafletMarker,
  type MarkerData,
} from '@/lib/mapUtils';
import { getApartmentMapLocation } from '@/data/mapLocations';
import type { LeafletMapLabels, LeafletMarkerData } from '@/components/LeafletMap';

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
  activation?: 'viewport' | 'intent';
  clusterMin?: number;
}

export default function InteractiveMap({
  markers = [],
  center = APARTMENT_LOCATION,
  zoom = 13,
  height = "400px",
  className = "",
  onMarkerClick,
  locale = 'en',
  activation = 'viewport',
  clusterMin
}: InteractiveMapProps) {
  const eff: Locale = locale === 'el' ? 'el' : 'en';
  const dict = useMemo(() => getDictionary(eff), [eff]);
  const mapT = dict.map;
  const leafletLabels = useMemo<LeafletMapLabels>(() => ({
    address: mapT?.address ?? 'Address',
    phone: mapT?.phone ?? 'Phone',
    directions: mapT?.directions ?? 'Directions',
    website: mapT?.website ?? 'Website',
    details: mapT?.viewDetails ?? 'Details',
    locateMe: mapT?.locateMe ?? 'Locate me',
    locationUnavailable: mapT?.locationUnavailable ?? 'Your location is unavailable. Check browser location permission and try again.',
    fitToMarkers: mapT?.fitToMarkers ?? 'Fit to markers',
    zoomIn: mapT?.zoomIn ?? 'Zoom in',
    zoomOut: mapT?.zoomOut ?? 'Zoom out',
    apartment: mapT?.apartmentMarkerTitle ?? 'Apartment',
    approximate: mapT?.approximate ?? 'Approximate – OSRM',
    travelUnavailable: mapT?.travelUnavailable ?? 'Travel times unavailable.',
    travelUnavailableWithDirections: mapT?.travelUnavailableWithDirections ?? 'Travel times unavailable. Use Directions for live navigation.',
    clearRoute: mapT?.clearRoute ?? 'Clear route',
    route: mapT?.route ?? 'Route',
    driving: mapT?.driving ?? 'Driving',
    walking: mapT?.walking ?? 'Walking',
    cycling: mapT?.cycling ?? 'Cycling',
    unavailable: mapT?.unavailable ?? 'Unavailable',
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

  const leafletMarkers = useMemo<LeafletMarkerData[]>(() => {
    const deduped = dedupeMarkers(markers);

    if (!deduped.some(marker => marker.id === 'apartment' || marker.type === 'apartment')) {
      const apartment = markerFromMapLocation(getApartmentMapLocation(eff));
      deduped.unshift({
        ...apartment,
        name: mapT?.apartmentMarkerTitle || apartment.name,
        description: mapT?.apartmentMarkerDesc || apartment.description,
      });
    }

    return deduped.map(toLeafletMarker);
  }, [markers, mapT, eff]);

  const handleMarkerClick = useMemo(() => {
    if (!onMarkerClick) return undefined;
    return (marker: LeafletMarkerData) => {
      const typed: MarkerData = {
        id: marker.id,
        name: marker.name,
        description: marker.description,
        address: marker.address,
        phone: marker.phone,
        phones: marker.phones,
        website: marker.website,
        directionsUrl: marker.directionsUrl,
        coordinates: marker.coordinates,
        type: (marker.type as MarkerData['type']) ?? 'attraction',
        href: marker.href,
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
          lazyTravelMetrics
          clusterMin={clusterMin}
          travelPrompt={mapT?.travelPrompt}
          labels={leafletLabels}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg border border-[color:var(--border-soft)] surface-subtle text-center text-sm text-[color:var(--text-accent)]">
          <div className="mb-2 text-3xl" aria-hidden>🗺️</div>
          <p className="max-w-xs leading-relaxed px-6">
            {activation === 'intent'
              ? (mapT?.deferredInteractiveLabel || 'Interactive map is ready when you need it.')
              : (mapT?.deferredInteractiveLabel || 'Interactive map loads once it is in view to keep things speedy.')}
          </p>
          {activation === 'intent' && (
            <button
              type="button"
              className="btn-tint mt-4 min-h-11"
              onClick={() => setShouldRenderInteractive(true)}
            >
              {mapT?.loadMap || 'Load map'}
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

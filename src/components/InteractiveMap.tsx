"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';
import StaticLocationMap from './StaticLocationMap';
import { APARTMENT_LOCATION } from '@/data/mapLocations';
import type { LeafletMapLabels, LeafletMarkerData } from '@/components/LeafletMap';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

interface InteractiveMapProps {
  markers?: readonly LeafletMarkerData[];
  zoom?: number;
  height?: string;
  className?: string;
  locale?: string; // for localized static fallback
  cartoBasemapsKey?: string;
}

export default function InteractiveMap({
  markers = [],
  zoom = 13,
  height = "400px",
  className = "",
  locale = 'en',
  cartoBasemapsKey,
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
    home: mapT.home,
    locateMe: mapT.locateMe,
    locationUnavailable: mapT.locationUnavailable,
    fitToMarkers: mapT.fitToMarkers,
    zoomIn: mapT.zoomIn,
    zoomOut: mapT.zoomOut,
  }), [mapT]);
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
  }, [hasMounted]);

  return (
    <div ref={containerRef} className={`relative ${className}`} style={{ height }}>
      {shouldRenderInteractive ? (
        <LeafletMap
          center={APARTMENT_LOCATION}
          zoom={zoom}
          height={height}
          markers={markers}
          labels={leafletLabels}
          cartoBasemapsKey={cartoBasemapsKey}
        />
      ) : (
        <div className="map-placeholder">
          <p className="map-placeholder__text">{mapT.deferredInteractiveLabel}</p>
        </div>
      )}
      <noscript>
        <StaticLocationMap height={height} className="mt-4" locale={locale} />
      </noscript>
    </div>
  );
}

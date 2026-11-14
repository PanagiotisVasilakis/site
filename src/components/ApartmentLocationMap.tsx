"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { APARTMENT_LOCATION, getKalamataMapLocations, type MapContentItem } from '@/data/mapLocations';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import type { LeafletMapLabels } from '@/components/LeafletMap';

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false });

interface ApartmentLocationMapProps {
  locale: Locale;
  height: string;
  zoom: number;
  className?: string;
  contentItems: MapContentItem[];
  cartoBasemapsKey?: string;
  /** Number the content items' pins 1…n in the given order (the guide's map list, identity §9.5). */
  numbered?: boolean;
}

export default function ApartmentLocationMap({
  locale,
  height,
  zoom,
  className = "",
  contentItems,
  cartoBasemapsKey,
  numbered = false,
}: ApartmentLocationMapProps) {
  const markers = useMemo(
    () => getKalamataMapLocations(locale, contentItems, { numbered }),
    [contentItems, locale, numbered]
  );
  const dict = useMemo(() => getDictionary(locale), [locale]);
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
    closePopup: mapT.closePopup,
  }), [mapT]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRenderInteractive, setShouldRenderInteractive] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const IntersectionObserverCtor = window.IntersectionObserver;

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
  }, []);

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
    </div>
  );
}

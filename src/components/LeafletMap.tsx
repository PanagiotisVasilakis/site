"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@/styles/components/map.css';
import { buildBasePopupHtml, escapeMapHtml as escapeHtml } from '@/components/maps/leafletPopup';
import { selectMapTileSource } from '@/components/maps/tileSource';
import type { MapLocation, MapMarkerType } from '@/data/mapLocations';

/** What a pin and its popup show (identity §8 MapCard); the data layer's MapLocation without copies (R-339). */
export type LeafletMarkerData = Pick<
  MapLocation,
  'id' | 'name' | 'description' | 'address' | 'phone' | 'phones' | 'website' | 'directionsUrl' | 'href'
  | 'coordinates' | 'markerType' | 'number' | 'meta'
>;

export interface LeafletMapLabels {
  address: string;
  phone: string;
  directions: string;
  website: string;
  details: string;
  home: string;
  locateMe: string;
  locationUnavailable: string;
  fitToMarkers: string;
  zoomIn: string;
  zoomOut: string;
}

export interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  markers?: readonly LeafletMarkerData[];
  height?: string;
  labels: LeafletMapLabels;
  cartoBasemapsKey?: string;
}

const CATEGORY_ICON: Record<MapMarkerType, string> = {
  apartment: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z',
  restaurant: 'M11 1v10.08H9.62c-1.04 0-1.9.83-1.9 2.26v.04c0 .73.43 1.33 1.05 1.61L10 16v6H8v-6L6.95 14.99c.62-.28 1.05-.88 1.05-1.61v-.04C8 11.91 7.04 11.08 6 11.08H4.92V1h2.16v10.08h.5c1.04 0 1.9-.83 1.9-2.26v-.04c0-.73-.43-1.33-1.05-1.61L7.08 6V1h2.16v5L10.5 6.5 14 1v10.08h-.5c-1.04 0-1.9.83-1.9 2.26v.04c0 .73.43 1.33 1.05 1.61L14 16v6h-2v-6l-1.05-1.01c.62-.28 1.05-.88 1.05-1.61v-.04c0-1.43-.96-2.26-2-2.26h-.5V1h2.16z',
  service: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  attraction: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  sightseeing: 'M4 4h3l2-2h6l2 2h3v16H4V4zm8 3a5 5 0 00-5 5 5 5 0 005 5 5 5 0 005-5 5 5 0 00-5-5zm0 8a3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3 3 3 0 01-3 3z',
  beach: 'M18 20H6v-4l5-5 3 3 4-4zM6 14v-2.5l5-5 3 3 4-4V14z',
  shop: 'M12 18H6v-4h6v4zm6-4h-4v4h4v-4zm-6-4H6v4h6v-4zm6-4h-4v4h4V6zM6 6H4v14h16V6h-2v2h-2V6H8v2H6V6z',
  cafe: 'M2 21h18v-2H2v2zm2-4h14v-3H4v3zm14-13v10h2V4h-2z',
  bar: 'M11 13.83l-3.83 3.83L6 16.51l3.83-3.83L6 8.83 7.17 7.66 11 11.5l3.83-3.84L16 8.83l-3.83 3.83L16 16.51l-1.17 1.17L11 13.83zM12 2a9 9 0 00-9 9c0 2.3.86 4.4 2.28 6L12 23.72 18.72 17A9 9 0 0012 2z',
  park: 'M12 2L9.5 5.5 11 6l-2 4-1-1-2 4h12l-2-4-1 1-2-4 1.5-.5L12 2z',
  police: 'M12 3l7 3v5.5c0 4.4-2.8 7.5-7 9.5-4.2-2-7-5.1-7-9.5V6l7-3z',
  'city-center': 'M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2z',
  church: 'M11 2h2v4h4v2h-4v14h-2V8H7V6h4z',
};

function svgIcon(path: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

const LOCATE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/></svg>';
const FIT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';

/**
 * Pins (§8 MapCard): the guide's numbered places are a paper pill with a number disc, the apartment is the
 * terracotta home pill with its label, and every other place is a paper pill with its category icon.
 */
function buildIcon(marker: Pick<LeafletMarkerData, 'markerType' | 'number'>, homeLabel: string) {
  let html: string;
  if (marker.markerType === 'apartment') {
    html = `<span class="map-pin map-pin--home"><span class="map-pin__disc">${svgIcon(CATEGORY_ICON.apartment)}</span><span class="map-pin__label">${escapeHtml(homeLabel)}</span></span>`;
  } else if (marker.number !== undefined) {
    html = `<span class="map-pin map-pin--numbered"><span class="map-pin__disc">${marker.number}</span></span>`;
  } else {
    html = `<span class="map-pin map-pin--place" data-type="${escapeHtml(marker.markerType)}"><span class="map-pin__disc">${svgIcon(CATEGORY_ICON[marker.markerType])}</span></span>`;
  }
  return L.divIcon({ className: 'map-pin-icon', html, iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -40] });
}

function computeIsDark() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

interface ControlExtender {
  extend: (o: { options?: Record<string, unknown>; onAdd: () => HTMLElement }) => new () => L.Control;
}

export default function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  height = '400px',
  labels: mapLabels,
  cartoBasemapsKey,
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef(markers);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  const applyTiles = useCallback((isDark: boolean) => {
    if (!mapRef.current) return;
    const { url, attribution } = selectMapTileSource(isDark, cartoBasemapsKey);
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(url, { attribution }).addTo(mapRef.current);
  }, [cartoBasemapsKey]);

  const fitOriginAndMarkers = useCallback(() => {
    if (!mapRef.current) return;
    // With numbered places (the guide's map list), fit those and the apartment; the landmarks may lie outside.
    const numbered = markersRef.current.filter(marker => marker.number !== undefined);
    const focus = numbered.length > 0
      ? [...numbered, ...markersRef.current.filter(marker => marker.markerType === 'apartment')]
      : markersRef.current;
    const pts: L.LatLngExpression[] = focus.map(marker => [marker.coordinates[1], marker.coordinates[0]]);
    // The padding keeps the pills (up to the home label's width) inside the frame.
    if (pts.length) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.15), { padding: [64, 56] });
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center[1], center[0]],
      zoom,
      attributionControl: true,
      zoomControl: false,
    });
    mapRef.current = map;
    applyTiles(computeIsDark());
    L.control.zoom({
      position: 'topleft',
      zoomInTitle: mapLabels.zoomIn,
      zoomOutTitle: mapLabels.zoomOut,
    }).addTo(map);

    const observer = new MutationObserver(() => applyTiles(computeIsDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mqListener = () => applyTiles(computeIsDark());
    mq.addEventListener('change', mqListener);

    const LocateControl = (L.Control as unknown as ControlExtender).extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const div = L.DomUtil.create('button', 'leaflet-bar leaflet-control map-control-button') as HTMLButtonElement;
        div.type = 'button';
        div.title = mapLabels.locateMe;
        div.setAttribute('aria-label', mapLabels.locateMe);
        div.innerHTML = LOCATE_SVG;
        div.onclick = () => {
          setLocationError('');
          if (!navigator.geolocation) {
            setLocationError(mapLabels.locationUnavailable);
            return;
          }
          navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            mapRef.current?.setView([latitude, longitude], 15);
            L.marker([latitude, longitude], { icon: buildIcon({ markerType: 'service' }, mapLabels.home) }).addTo(mapRef.current!);
          }, () => setLocationError(mapLabels.locationUnavailable), {
            enableHighAccuracy: false,
            timeout: 10_000,
            maximumAge: 60_000,
          });
        };
        return div;
      },
    });
    map.addControl(new (LocateControl as unknown as { new(): L.Control })());

    const FitControl = (L.Control as unknown as ControlExtender).extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const div = L.DomUtil.create('button', 'leaflet-bar leaflet-control map-control-button') as HTMLButtonElement;
        div.type = 'button';
        div.title = mapLabels.fitToMarkers;
        div.setAttribute('aria-label', mapLabels.fitToMarkers);
        div.innerHTML = FIT_SVG;
        div.onclick = fitOriginAndMarkers;
        return div;
      },
    });
    map.addControl(new (FitControl as unknown as { new(): L.Control })());

    return () => {
      observer.disconnect();
      mq.removeEventListener('change', mqListener);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, [applyTiles, center, fitOriginAndMarkers, mapLabels, zoom]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (markersLayerRef.current) {
      mapRef.current.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }

    const layer = L.layerGroup();

    markers.forEach((markerData, index) => {
      const marker = L.marker([markerData.coordinates[1], markerData.coordinates[0]], {
        icon: buildIcon(markerData, mapLabels.home),
        title: markerData.name,
        alt: markerData.name,
        // Leaflet stacks pins by latitude; the guide's numbered pins stay above the landmark and home pins
        // so a neighbouring icon or the home label never hides a number (R-374).
        zIndexOffset: markerData.number !== undefined ? 1000 : 0,
      });
      const baseHtml = buildBasePopupHtml(markerData, mapLabels);
      marker.bindPopup(baseHtml);
      marker.on('add', () => {
        const element = marker.getElement();
        element?.setAttribute('aria-label', markerData.name);
        // The pins drop in one after another (map.css M35); a CSSOM write, not an inline style attribute.
        element?.querySelector<HTMLElement>('.map-pin')?.style.setProperty('--i', String(index));
      });
      layer.addLayer(marker);
    });

    layer.addTo(mapRef.current);
    markersLayerRef.current = layer;
  }, [mapLabels, markers]);

  useEffect(() => {
    fitOriginAndMarkers();
  }, [fitOriginAndMarkers, markers]);

  return (
    <div className="map-card" style={{ height }}>
      <div ref={containerRef} className="map-card__canvas" />
      {locationError && (
        <div className="map-card__error" role="alert">
          {locationError}
        </div>
      )}
    </div>
  );
}

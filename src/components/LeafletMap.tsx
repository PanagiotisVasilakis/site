"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { formatTravelChip, travelModeIcon, type TravelMode } from '@/lib/travelFormat';
import { useTravelMetrics } from '@/hooks/useTravelMetrics';
import { buildBasePopupHtml, escapeMapHtml as escapeHtml } from '@/components/maps/leafletPopup';

const TRAVEL_MODES: TravelMode[] = ['driving', 'foot'];
const OSRM_BASE_URL = (process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const PERSIST_KEY = 'leaflet:apartment-map';
const TRAVEL_FETCH_DEBOUNCE_MS = 350;
const MAX_TABLE_BATCH = 50;
const TRAVEL_REFRESH_MINUTES = 15;

export interface LeafletMarkerData {
  id: string;
  name: string;
  description?: string;
  address?: string;
  phone?: string;
  phones?: string[];
  website?: string;
  directionsUrl?: string;
  href?: string;
  coordinates: [number, number]; // [lng, lat]
  type?: string;
}

export interface LeafletMapLabels {
  address: string;
  phone: string;
  directions: string;
  website: string;
  details: string;
  locateMe: string;
  locationUnavailable: string;
  fitToMarkers: string;
  zoomIn: string;
  zoomOut: string;
  approximate: string;
  travelUnavailable: string;
  travelUnavailableWithDirections: string;
  unavailable: string;
}

export interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  markers?: LeafletMarkerData[];
  height?: string;
  clusterMin?: number;
  origin?: [number, number];
  autoFitToOriginAndMarkers?: boolean;
  refitOnMarkerChange?: boolean;
  lazyTravelMetrics?: boolean;
  travelPrompt?: string;
  labels: LeafletMapLabels;
}

const CATEGORY_ICON: Record<string, string> = {
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

function svgIcon(path: string, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="${color}" aria-hidden="true"><path d="${path}"/></svg>`;
}

function buildIcon(type = 'apartment') {
  const path = CATEGORY_ICON[type] || CATEGORY_ICON.attraction;
  return L.divIcon({
    className: 'leaflet-custom-marker',
    html: `<div class="lmk" data-type="${escapeHtml(type)}">${svgIcon(path, '#fff')}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 40],
  });
}

function sameCoordinates(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;
}

function computeIsDark() {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

type ClusterFactory = (opts?: Record<string, unknown>) => L.LayerGroup & { addLayer: (l: L.Layer) => void };
interface ControlExtender {
  extend: (o: { options?: Record<string, unknown>; onAdd: () => HTMLElement }) => new () => L.Control;
}

export default function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  height = '400px',
  clusterMin = 5,
  origin,
  autoFitToOriginAndMarkers = false,
  refitOnMarkerChange = false,
  lazyTravelMetrics = false,
  travelPrompt = 'Tap a marker to calculate travel time.',
  labels: mapLabels,
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<(L.LayerGroup & { addLayer: (l: L.Layer) => void }) | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerInstancesRef = useRef<Record<string, { marker: L.Marker; baseHtml: string; data: LeafletMarkerData }>>({});
  const markersRef = useRef(markers);
  const originRef = useRef(origin);
  const autoFitDoneRef = useRef(false);
  const [shouldFetchTravel, setShouldFetchTravel] = useState(() => !lazyTravelMetrics);
  const [failedModes, setFailedModes] = useState<TravelMode[]>([]);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  useEffect(() => {
    if (!lazyTravelMetrics) setShouldFetchTravel(true);
  }, [lazyTravelMetrics]);

  const travelTargets = useMemo(
    () => origin ? markers.filter(marker => !sameCoordinates(marker.coordinates, origin)) : [],
    [markers, origin]
  );
  const travel = useTravelMetrics({
    origin,
    markers: travelTargets,
    modes: TRAVEL_MODES,
    osrmBaseUrl: OSRM_BASE_URL,
    debounceMs: TRAVEL_FETCH_DEBOUNCE_MS,
    maxBatch: MAX_TABLE_BATCH,
    refreshMinutes: TRAVEL_REFRESH_MINUTES,
    enabled: Boolean(origin && shouldFetchTravel),
    onProfilesFailed: setFailedModes,
  });

  const applyTiles = useCallback((isDark: boolean) => {
    if (!mapRef.current) return;
    const lightUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    if (tileLayerRef.current) mapRef.current.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(isDark ? darkUrl : lightUrl, {
      attribution: isDark ? '&copy; OpenStreetMap & CartoDB' : '&copy; OpenStreetMap contributors',
    }).addTo(mapRef.current);
  }, []);

  const fitOriginAndMarkers = useCallback(() => {
    if (!mapRef.current) return;
    const pts: L.LatLngExpression[] = [];
    if (originRef.current) pts.push([originRef.current[1], originRef.current[0]]);
    markersRef.current.forEach(marker => pts.push([marker.coordinates[1], marker.coordinates[0]]));
    if (pts.length) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.15));
  }, []);

  const buildTravelInfoHtml = useCallback((marker: LeafletMarkerData) => {
    if (!origin || sameCoordinates(marker.coordinates, origin)) return '';
    if (lazyTravelMetrics && !shouldFetchTravel) {
      return `<div class="map-popup-travel muted">${escapeHtml(travelPrompt)}</div>`;
    }

    const markerTravel = travel.data[marker.id];
    const chips = TRAVEL_MODES.map(mode => {
      const metrics = markerTravel?.[mode];
      if (metrics?.distance && metrics.duration) return formatTravelChip(mode, metrics.distance, metrics.duration);
      if (failedModes.includes(mode)) {
        const icon = travelModeIcon(mode);
        return `<span class="inline-flex items-center gap-1 bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-[2px] rounded-full">${icon}<span>${escapeHtml(mapLabels.unavailable)}</span></span>`;
      }
      if (travel.loading) {
        const icon = travelModeIcon(mode);
        return `<span class="inline-flex items-center gap-1 bg-black/5 dark:bg-white/10 px-2 py-[2px] rounded-full">${icon}<span class="spinner"></span></span>`;
      }
      return '';
    }).filter(Boolean);

    if (chips.length) {
      return `<div class="map-popup-travel" role="list" aria-live="polite">${chips.map(chip => `<span role="listitem">${chip}</span>`).join(' ')}<span class="map-popup-travel-note">${escapeHtml(mapLabels.approximate)}</span></div>`;
    }

    if (travel.error) {
      return `<div class="map-popup-travel muted">${escapeHtml(mapLabels.travelUnavailableWithDirections)}</div>`;
    }

    return shouldFetchTravel ? `<div class="map-popup-travel muted">${escapeHtml(mapLabels.travelUnavailable)}</div>` : '';
  }, [failedModes, lazyTravelMetrics, mapLabels, origin, shouldFetchTravel, travel.data, travel.error, travel.loading, travelPrompt]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let initialCenter: [number, number] = [center[1], center[0]];
    let initialZoom = zoom;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.center) && parsed.center.length === 2 && typeof parsed.zoom === 'number') {
          initialCenter = [parsed.center[0], parsed.center[1]];
          initialZoom = parsed.zoom;
        }
      }
    } catch { }

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
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

    map.on('moveend', () => {
      try {
        const c = map.getCenter();
        localStorage.setItem(PERSIST_KEY, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }));
      } catch { }
    });

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
        div.innerHTML = '📍';
        div.onclick = () => {
          setLocationError('');
          if (!navigator.geolocation) {
            setLocationError(mapLabels.locationUnavailable);
            return;
          }
          navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            mapRef.current?.setView([latitude, longitude], 15);
            L.marker([latitude, longitude], { icon: buildIcon('service') }).addTo(mapRef.current!);
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
        div.innerHTML = '⌖';
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
      clusterRef.current = null;
      markersLayerRef.current = null;
      markerInstancesRef.current = {};
    };
  }, [applyTiles, center, fitOriginAndMarkers, mapLabels, zoom]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (clusterRef.current) {
      mapRef.current.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (markersLayerRef.current) {
      mapRef.current.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }
    markerInstancesRef.current = {};

    const leafletNs = L as typeof L & { markerClusterGroup?: ClusterFactory };
    const useCluster = markers.length >= clusterMin && Boolean(leafletNs.markerClusterGroup);
    const layer = useCluster
      ? leafletNs.markerClusterGroup!({ showCoverageOnHover: false, maxClusterRadius: 50 })
      : L.layerGroup();

    markers.forEach(markerData => {
      const marker = L.marker([markerData.coordinates[1], markerData.coordinates[0]], {
        icon: buildIcon(markerData.type),
        title: markerData.name,
        alt: markerData.name,
      });
      const baseHtml = buildBasePopupHtml(markerData, mapLabels);
      marker.bindPopup(baseHtml);
      marker.on('click', () => {
        if (lazyTravelMetrics) setShouldFetchTravel(true);
      });
      marker.on('add', () => {
        const el = marker.getElement();
        if (!el) return;
        el.setAttribute('aria-label', markerData.name);
        el.classList.add('marker-pop');
        setTimeout(() => el.classList.remove('marker-pop'), 600);
      });
      layer.addLayer(marker);
      markerInstancesRef.current[markerData.id] = { marker, baseHtml, data: markerData };
    });

    layer.addTo(mapRef.current);
    if (useCluster) clusterRef.current = layer as L.LayerGroup & { addLayer: (l: L.Layer) => void };
    else markersLayerRef.current = layer;

    if (autoFitToOriginAndMarkers && !autoFitDoneRef.current) {
      let hadPersist = false;
      try {
        hadPersist = Boolean(localStorage.getItem(PERSIST_KEY));
      } catch { }
      if (!hadPersist) {
        fitOriginAndMarkers();
        autoFitDoneRef.current = true;
      }
    }
  }, [autoFitToOriginAndMarkers, clusterMin, fitOriginAndMarkers, lazyTravelMetrics, mapLabels, markers]);

  useEffect(() => {
    Object.values(markerInstancesRef.current).forEach(({ marker, baseHtml, data }) => {
      const popup = marker.getPopup();
      popup?.setContent(baseHtml + buildTravelInfoHtml(data));
    });
  }, [buildTravelInfoHtml, travel.data, travel.loading, travel.error]);

  useEffect(() => {
    if (refitOnMarkerChange) fitOriginAndMarkers();
  }, [fitOriginAndMarkers, markers, refitOnMarkerChange]);

  return (
    <div className="relative" style={{ height }}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden leaflet-container-custom" />
      {locationError && (
        <div className="absolute bottom-2 left-2 right-2 z-[5000] rounded bg-red-50 border border-red-200 p-2 text-sm text-red-800" role="alert">
          {locationError}
        </div>
      )}
    </div>
  );
}

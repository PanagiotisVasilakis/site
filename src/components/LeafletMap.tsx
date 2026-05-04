"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { formatTravelChip, type TravelMode } from '@/lib/travelFormat';
import { getOSRMClient } from '@/lib/osrmClient';
import { useTravelMetrics } from '@/hooks/useTravelMetrics';
import { logger } from '@/lib/logger-client';

const DEFAULT_TRAVEL_MODES: TravelMode[] = ['driving', 'foot'];
const DEFAULT_OSRM_BASE_URL = process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org';

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
  price?: string;
}

export interface LeafletMapProps {
  center: [number, number];
  zoom?: number;
  markers?: LeafletMarkerData[];
  height?: string;
  className?: string;
  onMarkerClick?: (m: LeafletMarkerData) => void;
  darkTiles?: boolean;
  clusterMin?: number;
  persistKey?: string | null;
  showFitButton?: boolean;
  animateMarkers?: boolean;
  origin?: [number, number];
  showOriginMarker?: boolean;
  autoFitToOriginAndMarkers?: boolean;
  originPopup?: { name?: string; address?: string; description?: string };
  refitOnMarkerChange?: boolean;
  travelModes?: TravelMode[];
  enableTravelModeToggle?: boolean;
  osrmBaseUrl?: string;
  travelFetchDebounceMs?: number;
  partialUpdates?: boolean;
  maxTableBatch?: number;
  travelRefreshMinutes?: number;
  onTravelProfilesFailed?: (failed: TravelMode[]) => void;
  enableRouting?: boolean;
  routeProfile?: TravelMode | 'auto';
  routeColor?: string;
  lazyTravelMetrics?: boolean;
  travelPrompt?: string;
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
  'city-center': 'M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2z'
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+0-9]/g, '')}`;
}

function popupLink(href: string | undefined, label: string) {
  if (!href) return '';
  return `<a class="map-popup-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function sameCoordinates(a?: [number, number], b?: [number, number]) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;
}

function buildBasePopupHtml(marker: LeafletMarkerData) {
  const phones = marker.phones?.length ? marker.phones : marker.phone ? [marker.phone] : [];
  const phoneHtml = phones.map(phone => (
    `<a class="map-popup-contact" href="${escapeHtml(phoneHref(phone))}">${escapeHtml(phone)}</a>`
  )).join('');
  const actionLinks = [
    popupLink(marker.directionsUrl, 'Directions'),
    popupLink(marker.website, 'Website'),
    popupLink(marker.href, 'Details'),
  ].filter(Boolean).join('');

  return `
    <article class="map-popup">
      <h3>${escapeHtml(marker.name)}</h3>
      ${marker.description ? `<p>${escapeHtml(marker.description)}</p>` : ''}
      ${marker.address ? `<div class="map-popup-row"><strong>Address</strong><span>${escapeHtml(marker.address)}</span></div>` : ''}
      ${phoneHtml ? `<div class="map-popup-row"><strong>Phone</strong><span class="map-popup-contacts">${phoneHtml}</span></div>` : ''}
      ${marker.price ? `<div class="map-popup-price">${escapeHtml(marker.price)}</div>` : ''}
      ${actionLinks ? `<div class="map-popup-actions">${actionLinks}</div>` : ''}
    </article>
  `;
}

type ClusterFactory = (opts?: Record<string, unknown>) => L.LayerGroup & { addLayer: (l: L.Layer) => void };
interface ControlExtender {
  extend: (o: { options?: Record<string, unknown>; onAdd: () => HTMLElement }) => new () => L.Control;
}
interface MapWithOrigin extends L.Map {
  _originMarker?: L.Marker;
}

export default function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  height = '400px',
  className = '',
  onMarkerClick,
  darkTiles,
  clusterMin = 5,
  persistKey = 'leaflet:apartment-map',
  showFitButton = true,
  animateMarkers = true,
  origin,
  showOriginMarker = true,
  autoFitToOriginAndMarkers = false,
  originPopup,
  refitOnMarkerChange = false,
  travelModes = DEFAULT_TRAVEL_MODES,
  enableTravelModeToggle = false,
  osrmBaseUrl,
  travelFetchDebounceMs = 350,
  maxTableBatch = 50,
  travelRefreshMinutes = 15,
  onTravelProfilesFailed,
  enableRouting = false,
  routeProfile = 'auto',
  routeColor = '#2563eb',
  lazyTravelMetrics = false,
  travelPrompt = 'Tap a marker to calculate travel time.',
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<(L.LayerGroup & { addLayer: (l: L.Layer) => void }) | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerInstancesRef = useRef<Record<string, { marker: L.Marker; baseHtml: string; data: LeafletMarkerData }>>({});
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersRef = useRef(markers);
  const originRef = useRef(origin);
  const autoFitDoneRef = useRef(false);
  const [selectedModes, setSelectedModes] = useState<TravelMode[]>(travelModes);
  const [shouldFetchTravel, setShouldFetchTravel] = useState(() => !lazyTravelMetrics);
  const [failedModes, setFailedModes] = useState<TravelMode[]>([]);
  const [hasRoute, setHasRoute] = useState(false);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    originRef.current = origin;
  }, [origin]);

  useEffect(() => {
    if (!enableTravelModeToggle) {
      const same = selectedModes.length === travelModes.length && selectedModes.every((mode, index) => mode === travelModes[index]);
      if (!same) setSelectedModes(travelModes);
    }
  }, [travelModes, enableTravelModeToggle, selectedModes]);

  useEffect(() => {
    if (enableTravelModeToggle && persistKey) {
      try {
        localStorage.setItem(`${persistKey}:modes`, JSON.stringify(selectedModes));
      } catch { }
    }
  }, [selectedModes, enableTravelModeToggle, persistKey]);

  useEffect(() => {
    if (!lazyTravelMetrics) setShouldFetchTravel(true);
  }, [lazyTravelMetrics]);

  const effectiveModes = useMemo(
    () => enableTravelModeToggle ? selectedModes : travelModes,
    [enableTravelModeToggle, selectedModes, travelModes]
  );
  const osrmBase = (osrmBaseUrl || DEFAULT_OSRM_BASE_URL).replace(/\/$/, '');
  const travelTargets = useMemo(
    () => origin ? markers.filter(marker => !sameCoordinates(marker.coordinates, origin)) : [],
    [markers, origin]
  );
  const handleProfilesFailed = useCallback((failed: TravelMode[]) => {
    setFailedModes(failed);
    onTravelProfilesFailed?.(failed);
  }, [onTravelProfilesFailed]);
  const travel = useTravelMetrics({
    origin,
    markers: travelTargets,
    modes: effectiveModes,
    osrmBaseUrl: osrmBase,
    debounceMs: travelFetchDebounceMs,
    maxBatch: maxTableBatch,
    refreshMinutes: travelRefreshMinutes,
    enabled: Boolean(origin && shouldFetchTravel && effectiveModes.length > 0),
    onProfilesFailed: handleProfilesFailed,
  });

  const computeIsDark = useCallback(() => {
    if (typeof document === 'undefined') return false;
    if (darkTiles !== undefined) return darkTiles;
    if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }, [darkTiles]);

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
    const chips = effectiveModes.map(mode => {
      const metrics = markerTravel?.[mode];
      if (metrics?.distance && metrics.duration) return formatTravelChip(mode, metrics.distance, metrics.duration);
      if (failedModes.includes(mode)) {
        const icon = mode === 'driving' ? '🚗' : mode === 'foot' ? '🚶' : '🚲';
        return `<span class="inline-flex items-center gap-1 bg-red-500/10 text-red-700 dark:text-red-300 px-2 py-[2px] rounded-full">${icon}<span>n/a</span></span>`;
      }
      if (travel.loading) {
        const icon = mode === 'driving' ? '🚗' : mode === 'foot' ? '🚶' : '🚲';
        return `<span class="inline-flex items-center gap-1 bg-black/5 dark:bg-white/10 px-2 py-[2px] rounded-full">${icon}<span class="spinner"></span></span>`;
      }
      return '';
    }).filter(Boolean);

    if (chips.length) {
      return `<div class="map-popup-travel" role="list" aria-live="polite">${chips.map(chip => `<span role="listitem">${chip}</span>`).join(' ')}<span class="map-popup-travel-note">Approximate - OSRM</span></div>`;
    }

    if (travel.error) {
      return `<div class="map-popup-travel muted">Travel times unavailable. Use Directions for live navigation.</div>`;
    }

    return shouldFetchTravel ? `<div class="map-popup-travel muted">Travel times unavailable.</div>` : '';
  }, [effectiveModes, failedModes, lazyTravelMetrics, origin, shouldFetchTravel, travel.data, travel.error, travel.loading, travelPrompt]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let initialCenter: [number, number] = [center[1], center[0]];
    let initialZoom = zoom;
    if (persistKey) {
      try {
        const raw = localStorage.getItem(persistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.center) && parsed.center.length === 2 && typeof parsed.zoom === 'number') {
            initialCenter = [parsed.center[0], parsed.center[1]];
            initialZoom = parsed.zoom;
          }
        }
      } catch { }
    }

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: true,
      zoomControl: true,
    });
    mapRef.current = map;
    applyTiles(computeIsDark());

    if (persistKey) {
      map.on('moveend', () => {
        try {
          const c = map.getCenter();
          localStorage.setItem(persistKey, JSON.stringify({ center: [c.lat, c.lng], zoom: map.getZoom() }));
        } catch { }
      });
    }

    let observer: MutationObserver | null = null;
    let mqListener: (() => void) | null = null;
    if (darkTiles === undefined) {
      observer = new MutationObserver(() => applyTiles(computeIsDark()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mqListener = () => applyTiles(computeIsDark());
      mq.addEventListener('change', mqListener);
    }

    const LocateControl = (L.Control as unknown as ControlExtender).extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const div = L.DomUtil.create('button', 'leaflet-bar leaflet-control map-control-button') as HTMLButtonElement;
        div.type = 'button';
        div.title = 'Locate me';
        div.innerHTML = '📍';
        div.onclick = () => {
          if (!navigator.geolocation) return;
          navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            mapRef.current?.setView([latitude, longitude], 15);
            L.marker([latitude, longitude], { icon: buildIcon('service') }).addTo(mapRef.current!);
          });
        };
        return div;
      },
    });
    map.addControl(new (LocateControl as unknown as { new(): L.Control })());

    if (showFitButton) {
      const FitControl = (L.Control as unknown as ControlExtender).extend({
      options: { position: 'topleft' },
      onAdd: () => {
          const div = L.DomUtil.create('button', 'leaflet-bar leaflet-control map-control-button') as HTMLButtonElement;
          div.type = 'button';
          div.title = 'Fit to markers';
          div.innerHTML = '⌖';
          div.onclick = fitOriginAndMarkers;
          return div;
        },
      });
      map.addControl(new (FitControl as unknown as { new(): L.Control })());
    }

    return () => {
      observer?.disconnect();
      if (mqListener) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mqListener);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      clusterRef.current = null;
      markersLayerRef.current = null;
      markerInstancesRef.current = {};
    };
  }, [applyTiles, center, computeIsDark, darkTiles, fitOriginAndMarkers, persistKey, showFitButton, zoom]);

  useEffect(() => {
    const map = mapRef.current as MapWithOrigin | null;
    if (!map) return;
    if (map._originMarker) {
      map.removeLayer(map._originMarker);
      map._originMarker = undefined;
    }
    if (!showOriginMarker || !origin) return;

    const marker = L.marker([origin[1], origin[0]], {
      icon: L.divIcon({
        className: 'leaflet-origin-marker',
        html: `<div class="lmk" data-type="apartment" title="Apartment location">${svgIcon(CATEGORY_ICON.apartment, '#fff')}</div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 40],
      }),
    }).addTo(map);
    const popupMarker: LeafletMarkerData = {
      id: 'origin',
      name: originPopup?.name || 'Apartment',
      description: originPopup?.description,
      address: originPopup?.address,
      coordinates: origin,
      type: 'apartment',
    };
    marker.bindPopup(buildBasePopupHtml(popupMarker));
    map._originMarker = marker;
  }, [origin, originPopup, showOriginMarker]);

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
      const marker = L.marker([markerData.coordinates[1], markerData.coordinates[0]], { icon: buildIcon(markerData.type) });
      const baseHtml = buildBasePopupHtml(markerData);
      marker.bindPopup(baseHtml);
      marker.on('click', () => {
        onMarkerClick?.(markerData);
        if (lazyTravelMetrics) setShouldFetchTravel(true);
        if (enableRouting && origin) {
          const profile = routeProfile === 'auto' ? (effectiveModes[0] || 'driving') : routeProfile;
          void (async () => {
            try {
              const route = await getOSRMClient({ baseUrl: osrmBase }).getRoute(profile, origin, markerData.coordinates);
              if (!route?.coordinates.length || !mapRef.current) return;
              if (routeLayerRef.current) {
                routeLayerRef.current.remove();
                routeLayerRef.current = null;
              }
              const latlngs = route.coordinates.map(coord => [coord[1], coord[0]] as [number, number]);
              routeLayerRef.current = L.polyline(latlngs, { color: routeColor, weight: 4, opacity: 0.85 }).addTo(mapRef.current);
              setHasRoute(true);
              mapRef.current.fitBounds(routeLayerRef.current.getBounds().pad(0.15));
              if (persistKey) {
                try {
                  localStorage.setItem(`${persistKey}:route`, JSON.stringify({ profile, to: markerData.id, coords: route.coordinates }));
                } catch { }
              }
            } catch (err) {
              logger.warn('Route fetch failed', err instanceof Error ? err : { error: String(err) });
            }
          })();
        }
      });
      if (animateMarkers) {
        marker.on('add', () => {
          const el = marker.getElement();
          if (!el) return;
          el.classList.add('marker-pop');
          setTimeout(() => el.classList.remove('marker-pop'), 600);
        });
      }
      layer.addLayer(marker);
      markerInstancesRef.current[markerData.id] = { marker, baseHtml, data: markerData };
    });

    layer.addTo(mapRef.current);
    if (useCluster) clusterRef.current = layer as L.LayerGroup & { addLayer: (l: L.Layer) => void };
    else markersLayerRef.current = layer;

    if (enableRouting && origin && persistKey) {
      try {
        const raw = localStorage.getItem(`${persistKey}:route`);
        if (raw) {
          const parsed = JSON.parse(raw) as { coords?: [number, number][] };
          if (Array.isArray(parsed.coords) && parsed.coords.length) {
            const latlngs = parsed.coords.map(coord => [coord[1], coord[0]] as [number, number]);
            routeLayerRef.current = L.polyline(latlngs, { color: routeColor, weight: 4, opacity: 0.85 }).addTo(mapRef.current);
            setHasRoute(true);
          }
        }
      } catch { }
    }

    if (autoFitToOriginAndMarkers && !autoFitDoneRef.current) {
      let hadPersist = false;
      if (persistKey) {
        try {
          hadPersist = Boolean(localStorage.getItem(persistKey));
        } catch { }
      }
      if (!hadPersist) {
        fitOriginAndMarkers();
        autoFitDoneRef.current = true;
      }
    }
  }, [animateMarkers, autoFitToOriginAndMarkers, clusterMin, effectiveModes, enableRouting, fitOriginAndMarkers, lazyTravelMetrics, markers, onMarkerClick, origin, osrmBase, persistKey, routeColor, routeProfile]);

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
    <div className={`${className} relative`} style={{ height }}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden leaflet-container-custom" />
      {enableRouting && hasRoute && (
        <button
          type="button"
          onClick={() => {
            if (routeLayerRef.current) {
              routeLayerRef.current.remove();
              routeLayerRef.current = null;
            }
            setHasRoute(false);
            if (persistKey) {
              try {
                localStorage.removeItem(`${persistKey}:route`);
              } catch { }
            }
          }}
          className="absolute top-2 left-2 z-[5000] bg-white/80 dark:bg-zinc-800/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium shadow hover:bg-white dark:hover:bg-zinc-700 transition"
          aria-label="Clear route"
        >
          x Route
        </button>
      )}
      {enableTravelModeToggle && origin && (
        <div className="absolute top-2 right-2 z-[5000] flex gap-1 bg-white/70 dark:bg-zinc-800/70 backdrop-blur px-2 py-1 rounded-full shadow-sm text-[11px] font-medium">
          {(['driving', 'foot', 'cycling'] as const).map(mode => {
            const active = selectedModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectedModes(prev => prev.includes(mode) ? prev.filter(item => item !== mode) : [...prev, mode])}
                className={`px-2 py-[2px] rounded-full flex items-center gap-1 transition ${active ? 'bg-black/80 text-white dark:bg-white/80 dark:text-black' : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'}`}
                aria-pressed={active}
              >
                {mode === 'driving' ? '🚗' : mode === 'foot' ? '🚶' : '🚲'} {mode}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

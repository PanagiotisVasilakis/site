"use client";
import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { formatTravelChip } from '@/lib/travelFormat';
import { logger } from '@/lib/logger';

type TravelMode = 'driving' | 'foot' | 'cycling';

export interface LeafletMarkerData {
  id: string;
  name: string;
  description?: string;
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
  /** Force dark tiles true/false. If undefined (default) auto sync with data-theme attribute */
  darkTiles?: boolean;
  /** Minimum markers required before enabling clustering */
  clusterMin?: number;
  /** Persist last map center+zoom under this localStorage key (disable by setting to null) */
  persistKey?: string | null;
  /** Show fit-to-bounds button */
  showFitButton?: boolean;
  /** Animate markers on add */
  animateMarkers?: boolean;
  /** Origin (lng,lat) used to compute travel distance/time */
  origin?: [number, number];
  /** Show a dedicated marker for the origin (house) */
  showOriginMarker?: boolean;
  /** Auto fit map to include origin + all markers on first load (skips if persisted position exists) */
  autoFitToOriginAndMarkers?: boolean;
  /** Optional popup info for origin marker (shown if showOriginMarker) */
  originPopup?: { name?: string; address?: string; description?: string };
  /** Refit bounds (origin + markers) whenever marker list changes */
  refitOnMarkerChange?: boolean;
  /** Show a dedicated control button to fit origin + markers */
  showRefitAllControl?: boolean;
  /** Travel modes to compute (OSRM profiles). Supported: driving, foot */
  travelModes?: TravelMode[];
  /** Allow user to toggle travel modes client-side */
  enableTravelModeToggle?: boolean;
  /** Override OSRM base URL (must support /table); default public demo server */
  osrmBaseUrl?: string;
  /** Debounce ms before firing OSRM distance fetch after input changes */
  travelFetchDebounceMs?: number;
  /** Enable partial popup updates per-mode as soon as each mode resolves */
  partialUpdates?: boolean;
  /** Maximum markers per OSRM table request (chunk if exceeded) */
  maxTableBatch?: number;
  /** Minutes between background refreshes (0 to disable) */
  travelRefreshMinutes?: number;
  /** Telemetry callback when profiles fail (after a run finishes) */
  onTravelProfilesFailed?: (failed: TravelMode[]) => void;
  /** Enable drawing route polyline on marker click */
  enableRouting?: boolean;
  /** Route profile if routing enabled; 'auto' uses first selected effective mode */
  routeProfile?: TravelMode | 'auto';
  /** Polyline color */
  routeColor?: string;
  /** Defer OSRM travel calculations until interaction */
  lazyTravelMetrics?: boolean;
  /** Instruction text shown before travel metrics are requested */
  travelPrompt?: string;
}

const CATEGORY_ICON: Record<string, string> = {
  villa: 'M12 2 2 7l10 5 10-5-10-5Zm8 9-8 4-8-4v6l8 4 8-4v-6Z',
  restaurant: 'M6 2v8.5a3.5 3.5 0 1 0 7 0V2h-2v8.5a1.5 1.5 0 1 1-3 0V2H6Zm9 0v14h2v-6h2V8h-2V2h-2Z',
  service: 'M12 2a5 5 0 0 0-5 5v3H5l1 12h12l1-12h-2V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Z',
  attraction: 'M12 2 3 9h6v13h6V9h6L12 2Z'
};

function svgIcon(path: string, color: string) {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='20' height='20' fill='${color}'><path d='${path}'/></svg>`;
}

function buildIcon(type = 'villa') {
  const path = CATEGORY_ICON[type] || CATEGORY_ICON['attraction'];
  return L.divIcon({
    className: 'leaflet-custom-marker',
    html: `<div class="lmk" data-type="${type}">${svgIcon(path, '#fff')}</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 40]
  });
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
  persistKey = 'leaflet:villa-map',
  showFitButton = true,
  animateMarkers = true,
  origin,
  showOriginMarker = true,
  autoFitToOriginAndMarkers = false,
  originPopup,
  refitOnMarkerChange = false,
  showRefitAllControl = false,
  travelModes = ['driving','foot'],
  enableTravelModeToggle = false,
  osrmBaseUrl,
  travelFetchDebounceMs = 350,
  partialUpdates = true,
  maxTableBatch = 50,
  travelRefreshMinutes = 15,
  onTravelProfilesFailed,
  enableRouting = false,
  routeProfile = 'auto',
  routeColor = '#2563eb',
  lazyTravelMetrics = false,
  travelPrompt = 'Tap a marker to calculate travel time.'
}: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const clusterRef = useRef<(L.LayerGroup & { addLayer: (l: L.Layer) => void }) | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markerInstancesRef = useRef<Record<string, { marker: L.Marker; baseHtml: string }>>({});
  const routeLayerRef = useRef<L.Polyline | null>(null);
  interface ModeData { distance: number; duration: number }
  const travelCacheRef = useRef<Record<string, { driving?: ModeData; foot?: ModeData; cycling?: ModeData }>>({});
  const [selectedModes, setSelectedModes] = React.useState<TravelMode[]>(travelModes);
  const [shouldFetchTravel, setShouldFetchTravel] = React.useState(() => !lazyTravelMetrics);
  // Keep selectedModes in sync if prop changes (when toggle disabled)
  useEffect(()=>{
    if(!enableTravelModeToggle){
      // Avoid state churn: only update if arrays differ (order + length)
      const same = selectedModes.length === travelModes.length && selectedModes.every((m,i)=>m===travelModes[i]);
      if(!same){ setSelectedModes(travelModes); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[travelModes, enableTravelModeToggle]);
  useEffect(()=>{ if(enableTravelModeToggle && persistKey){ try { localStorage.setItem(persistKey+':modes', JSON.stringify(selectedModes)); } catch {} } },[selectedModes, enableTravelModeToggle, persistKey]);
  const effectiveModes = enableTravelModeToggle ? selectedModes : travelModes;
  useEffect(() => {
    if (!lazyTravelMetrics) {
      setShouldFetchTravel(true);
    }
  }, [lazyTravelMetrics]);
  const osrmBase = (typeof osrmBaseUrl === 'string' && osrmBaseUrl) ? osrmBaseUrl.replace(/\/$/,'') : 'https://router.project-osrm.org';
  // Global-ish in-module cache of OSRM responses by key (profile+coord list)
  const osrmCacheRef = useRef<Record<string, { distances: number[][]; durations: number[][] }>>({});
  const failedProfilesRef = useRef<Set<string>>(new Set());
  const autoFitDoneRef = useRef(false);

  // Augment map instance to store origin marker reference without using 'any'
  interface MapWithOrigin extends L.Map { _originMarker?: L.Marker }
  // Dedicated origin (house) marker
  useEffect(()=>{
    const map = mapRef.current as MapWithOrigin | null;
    if(!map) return;
    if(map._originMarker){ map.removeLayer(map._originMarker); map._originMarker = undefined; }
    if(showOriginMarker && origin){
      map._originMarker = L.marker([origin[1], origin[0]], {
        icon: L.divIcon({
          className: 'leaflet-origin-marker',
          html: '<div class="lmk" data-type="villa" title="Villa location">🏠</div>',
          iconSize: [42,42], iconAnchor:[21,40]
        })
      }).addTo(map);
      if(originPopup){
        const title = originPopup.name || 'Villa';
        const address = originPopup.address ? `<div style='margin-top:2px;font-size:12px;'>${originPopup.address}</div>` : '';
        const desc = originPopup.description ? `<div style='margin-top:4px;font-size:12px;line-height:1.3;'>${originPopup.description}</div>` : '';
        map._originMarker.bindPopup(`<div style='font-weight:600;margin-bottom:4px;'>${title}</div>${address}${desc}`);
      }
    }
    // Attempt auto-fit (only once, only if not already persisted position)
    if(autoFitToOriginAndMarkers && !autoFitDoneRef.current){
      // Skip if persisted state would have positioned map (we detect via localStorage presence)
      let hadPersist = false;
      if(persistKey){
        try { hadPersist = !!localStorage.getItem(persistKey); } catch {}
      }
      if(!hadPersist){
        const pts: L.LatLngExpression[] = [];
        if(origin) pts.push([origin[1], origin[0]]);
        markers.forEach(m=>pts.push([m.coordinates[1], m.coordinates[0]]));
        if(pts.length){
          const bounds = L.latLngBounds(pts);
          map.fitBounds(bounds.pad(0.15));
          autoFitDoneRef.current = true;
        }
      }
    }
  },[origin, showOriginMarker, originPopup, autoFitToOriginAndMarkers, markers, persistKey]);


  // Helper: decide if dark theme is active
  const computeIsDark = useCallback(() => {
    if (typeof document === 'undefined') return false;
    if (darkTiles !== undefined) return darkTiles; // forced
    const attrDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (attrDark) return true;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }, [darkTiles]);

  const applyTiles = (isDark: boolean) => {
    if (!mapRef.current) return;
    const lightUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    const darkUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(isDark ? darkUrl : lightUrl, {
      attribution: isDark ? '&copy; OpenStreetMap & CartoDB' : '&copy; OpenStreetMap contributors'
    }).addTo(mapRef.current);
  };

  const fitOriginAndMarkers = useCallback(() => {
    if(!mapRef.current) return;
    const pts: L.LatLngExpression[] = [];
    if(origin) pts.push([origin[1], origin[0]]);
    markers.forEach(m=>pts.push([m.coordinates[1], m.coordinates[0]]));
    if(!pts.length) return;
    const bounds = L.latLngBounds(pts);
    mapRef.current.fitBounds(bounds.pad(0.15));
  }, [origin, markers]);

  // Refit whenever markers change (if enabled)
  useEffect(()=>{
    if(refitOnMarkerChange){
      fitOriginAndMarkers();
    }
  },[markers, refitOnMarkerChange, fitOriginAndMarkers]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // already

    // Restore position if persisted
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
      } catch {}
    }

    mapRef.current = L.map(containerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      attributionControl: true,
      zoomControl: true
    });

    applyTiles(computeIsDark());

    // Persist on moveend
    if (persistKey) {
      mapRef.current.on('moveend', () => {
        try {
          const c = mapRef.current!.getCenter();
          const z = mapRef.current!.getZoom();
          localStorage.setItem(persistKey, JSON.stringify({ center: [c.lat, c.lng], zoom: z }));
        } catch {}
      });
    }

    // Observe theme changes if auto mode
    if (darkTiles === undefined) {
      const observer = new MutationObserver(() => {
        applyTiles(computeIsDark());
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      // Media query changes
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const mqListener = () => applyTiles(computeIsDark());
      mq.addEventListener('change', mqListener);
      // cleanup
      mapRef.current.on('unload', () => {
        observer.disconnect();
        mq.removeEventListener('change', mqListener);
      });
    }

    // Geolocation button
  interface ControlExtender { extend: (o: { options?: Record<string, unknown>; onAdd: () => HTMLElement }) => new () => L.Control; }
  const LocateControl = (L.Control as unknown as ControlExtender).extend({
      options: { position: 'topleft' },
      onAdd: () => {
        const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        div.style.background = 'var(--layer-surface, #fff)';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'center';
        div.style.width = '34px';
        div.style.height = '34px';
        div.style.cursor = 'pointer';
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
      }
    });
  mapRef.current.addControl(new (LocateControl as unknown as { new(): L.Control })());

    // Fit bounds button
    if (showFitButton) {
      const FitControl = (L.Control as unknown as ControlExtender).extend({
        options: { position: 'topleft' },
        onAdd: () => {
          const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
          div.style.background = 'var(--layer-surface, #fff)';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.justifyContent = 'center';
          div.style.width = '34px';
          div.style.height = '34px';
          div.style.cursor = 'pointer';
          div.title = 'Fit to markers';
          div.innerHTML = '🔍';
          div.onclick = () => {
            if (!mapRef.current) return;
            const pts: L.LatLngExpression[] = [];
            markers.forEach(m => pts.push([m.coordinates[1], m.coordinates[0]]));
            if (pts.length === 0) return;
            const bounds = L.latLngBounds(pts);
            mapRef.current.fitBounds(bounds.pad(0.15));
          };
          return div;
        }
      });
      mapRef.current.addControl(new (FitControl as unknown as { new(): L.Control })());
    }
  }, [center, zoom, darkTiles, persistKey, showFitButton, markers, computeIsDark]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old marker layers
    if (clusterRef.current) {
      mapRef.current.removeLayer(clusterRef.current);
      clusterRef.current = null;
    }
    if (markersLayerRef.current) {
      mapRef.current.removeLayer(markersLayerRef.current);
      markersLayerRef.current = null;
    }

    const useCluster = markers.length >= clusterMin;
  type ClusterFactory = (opts?: Record<string, unknown>) => L.LayerGroup & { addLayer: (l: L.Layer) => void };
  const leafletNs = L as typeof L & { markerClusterGroup?: ClusterFactory };
  const mcFactory: ClusterFactory | undefined = leafletNs.markerClusterGroup;
    if (useCluster && mcFactory) {
      clusterRef.current = mcFactory({ showCoverageOnHover: false, maxClusterRadius: 50 });
    } else {
      markersLayerRef.current = L.layerGroup();
    }

    const safeTravelPrompt = travelPrompt
      ? travelPrompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : '';

  markers.forEach(m => {
      const marker = L.marker([m.coordinates[1], m.coordinates[0]], { icon: buildIcon(m.type) });
      let loadingPlaceholder = '';
      if (origin) {
        if (lazyTravelMetrics && !shouldFetchTravel && safeTravelPrompt) {
          loadingPlaceholder = `<div class="mt-2 text-[11px] opacity-70 travel-prompt">${safeTravelPrompt}</div>`;
        } else if (!lazyTravelMetrics || shouldFetchTravel) {
          loadingPlaceholder = `<div class="mt-2 text-[11px] opacity-70 flex gap-2 travel-loading">${effectiveModes.map(mode => {
            const icon = mode==='driving'?'🚗': mode==='foot'?'🚶':'🚲';
            return `<span class=\"inline-flex items-center gap-1 bg-black/5 dark:bg-white/10 px-2 py-[2px] rounded-full\">${icon}<span class=spinner size=10></span></span>`;}).join(' ')}<span class="sr-only">Loading distances...</span></div>`;
        }
      }
  const html = `<div style=\"font-weight:600;margin-bottom:4px;\">${m.name}</div>${m.description ? `<div style='font-size:12px;line-height:1.3;'>${m.description}</div>` : ''}${m.price ? `<div style='margin-top:4px;font-size:12px;font-weight:600;'>${m.price}</div>` : ''}${loadingPlaceholder}`;
      marker.bindPopup(html);
      marker.on('click', () => {
        onMarkerClick?.(m);
        if (lazyTravelMetrics) {
          setShouldFetchTravel(true);
        }
        if (enableRouting && origin) {
          const profile = routeProfile === 'auto' ? (effectiveModes[0] || 'driving') : routeProfile;
          const url = `${osrmBase}/route/v1/${profile}/${origin[0]},${origin[1]};${m.coordinates[0]},${m.coordinates[1]}?overview=full&geometries=geojson`;
          // Use async/await properly with error handling
          (async () => {
            try {
              const response = await fetch(url);
              if (!response.ok) return;
              const data = await response.json();
              if (!data || !mapRef.current) return;
              const coords: [number, number][] = data.routes?.[0]?.geometry?.coordinates || [];
              if (!coords.length) return;
              if (routeLayerRef.current) { 
                routeLayerRef.current.remove(); 
                routeLayerRef.current = null; 
              }
              const latlngs = coords.map(c => [c[1], c[0]] as [number, number]);
              routeLayerRef.current = L.polyline(latlngs, { color: routeColor, weight: 4, opacity: 0.85 }).addTo(mapRef.current);
              mapRef.current.fitBounds(routeLayerRef.current.getBounds().pad(0.15));
            } catch (err) {
              logger.warn('Route fetch failed', err);
            }
          })();
        }
      });
      // Animation
      if (animateMarkers) {
        marker.on('add', () => {
          const el = marker.getElement();
          if (el) {
            el.classList.add('marker-pop');
            setTimeout(() => el.classList.remove('marker-pop'), 600);
          }
        });
      }
      if (clusterRef.current) clusterRef.current.addLayer(marker); else markersLayerRef.current!.addLayer(marker);
  markerInstancesRef.current[m.id] = { marker, baseHtml: html };
    });

    if (clusterRef.current) clusterRef.current.addTo(mapRef.current); else if (markersLayerRef.current) markersLayerRef.current.addTo(mapRef.current);

    // Restore persisted route if exists and routing enabled
    if(enableRouting && origin && persistKey){
      try {
        const raw = localStorage.getItem(persistKey+':route');
        if(raw){
          const parsed = JSON.parse(raw) as { profile: string; to: string; coords: [number, number][] };
          if(Array.isArray(parsed?.coords) && parsed.coords.length){
            if(routeLayerRef.current){ routeLayerRef.current.remove(); routeLayerRef.current = null; }
            const latlngs = parsed.coords.map(c => [c[1], c[0]] as [number, number]);
            routeLayerRef.current = L.polyline(latlngs, { color: routeColor, weight:4, opacity:0.85 }).addTo(mapRef.current!);
          }
        }
      } catch {}
    }
  }, [markers, onMarkerClick, clusterMin, animateMarkers, origin, effectiveModes, enableRouting, persistKey, routeColor, osrmBase, routeProfile, lazyTravelMetrics, shouldFetchTravel, travelPrompt]);

  // Compute travel distances (matrix) using OSRM (public demo – not for heavy production) and update popups
  useEffect(() => {
    if (!origin || !mapRef.current || markers.length === 0) return;
    if (!shouldFetchTravel) return;
    if (effectiveModes.length === 0) return;

  let cancelled = false;
  const timeout = window.setTimeout(() => { void run(); }, travelFetchDebounceMs);
  let intervalId: number | null = null;

    const PROFILE_CANDIDATES: Record<string,string[]> = {
      driving: ['driving','car'],
      foot: ['foot','walking'],
      cycling: ['cycling','bike','bicycle']
    };

    interface OSRMTableResponse { distances: number[][]; durations: number[][] }
    const fetchWithRetry = async (url: string, attempts = 2, delay = 500): Promise<OSRMTableResponse | null> => {
      for (let i=0;i<=attempts;i++) {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          if (res.ok) return await res.json() as OSRMTableResponse;
        } catch {}
        if (i < attempts) await new Promise(r => setTimeout(r, delay * Math.pow(2,i)));
      }
      return null;
    };

    const updateAllPopups = () => {
      if (cancelled) return;
      Object.entries(markerInstancesRef.current).forEach(([id, inst]) => {
        const info = travelCacheRef.current[id];
        const chips: string[] = [];
        effectiveModes.forEach((mode: TravelMode) => {
          const entry = (info as Record<TravelMode, ModeData | undefined>)?.[mode];
          if (entry) {
            chips.push(formatTravelChip(mode, entry.distance, entry.duration));
          } else if (failedProfilesRef.current.has(mode)) {
            const icon = mode==='driving'?'🚗': mode==='foot'? '🚶':'🚲';
            chips.push(`<span class=\"inline-flex items-center gap-1 bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-[2px] rounded-full\">${icon}<span>n/a</span></span>`);
          } else if (origin) {
            const icon = mode==='driving'?'🚗': mode==='foot'? '🚶':'🚲';
            chips.push(`<span class=\"inline-flex items-center gap-1 bg-black/5 dark:bg-white/10 px-2 py-[2px] rounded-full\">${icon}<span class=spinner size=10></span></span>`);
          }
        });
        const popup = inst.marker.getPopup();
        if (!popup) return;
        if (chips.length) {
          popup.setContent(inst.baseHtml + `<div class=\"mt-2 text-[11px] leading-tight travel-info\" role=\"list\" aria-live=\"polite\">${chips.map(c=>`<span role=\\"listitem\\">${c}</span>`).join(' ')}<span class=\"block opacity-50 mt-1\">Approximate – OSRM</span></div>`);
        } else {
          popup.setContent(inst.baseHtml + `<div class=\"mt-2 text-[11px] leading-tight text-amber-600 dark:text-amber-400\">Distances unavailable</div>`);
        }
      });
      // Update origin popup summary if desired and origin marker has popup
      if(showOriginMarker && originPopup){
        const map = mapRef.current as (L.Map & { _originMarker?: L.Marker }) | null;
        const om = map?._originMarker;
        if(om){
          const popup = om.getPopup();
          if(popup){
            // Build a small summary (average / nearest distance not applicable – show first driving + foot if available from any marker)
            const sampleMarker = markers[0]?.id ? travelCacheRef.current[markers[0].id] : undefined;
            const chips: string[] = [];
            if(sampleMarker){
              (['driving','foot','cycling'] as const).forEach(mode=>{
                const entry = (sampleMarker as Record<string, { distance:number; duration:number } | undefined>)[mode];
                if(entry){
                  chips.push(formatTravelChip(mode, entry.distance, entry.duration));
                }
              });
            }
            if(chips.length){
              const existingHtml = popup.getContent() as string;
              if(!/travel-info-origin/.test(existingHtml)){
                popup.setContent(existingHtml + `<div class=\"mt-2 text-[11px] leading-tight travel-info-origin\" aria-live=\"polite\">${chips.map(c=>`<span>${c}</span>`).join(' ')}<span class=\"block opacity-50 mt-1\">Approximate – OSRM</span></div>`);
              }
            }
          }
        }
      }
    };

    const fetchChunk = async (mode: string, chunkMarkers: typeof markers) => {
      const coordList = [origin, ...chunkMarkers.map(m => m.coordinates)];
      const coordString = coordList.map(c => `${c[0]},${c[1]}`).join(';');
      const cacheKey = `${mode}:${coordString}`;
      if (osrmCacheRef.current[cacheKey]) return osrmCacheRef.current[cacheKey];
      const profiles = PROFILE_CANDIDATES[mode] || [mode];
      for (const profile of profiles) {
        const url = `${osrmBase}/table/v1/${profile}/${coordString}?annotations=distance,duration`;
        const data = await fetchWithRetry(url, 2, 600);
        if (data) {
          osrmCacheRef.current[cacheKey] = data;
          return data;
        }
        if (cancelled) return null;
      }
      return null;
    };

  const run = async () => {
  const modes = effectiveModes.filter((m): m is TravelMode => ['driving','foot','cycling'].includes(m));
      const chunks: { start: number; end: number; list: typeof markers }[] = [];
      if (markers.length > maxTableBatch) {
        for (let i=0;i<markers.length;i+=maxTableBatch) {
          chunks.push({ start: i, end: Math.min(i+maxTableBatch, markers.length), list: markers.slice(i, i+maxTableBatch) });
        }
      } else {
        chunks.push({ start:0, end: markers.length, list: markers });
      }

      for (const mode of modes) {
        for (const chunk of chunks) {
          const data = await fetchChunk(mode, chunk.list);
          if (!data) {
            failedProfilesRef.current.add(mode);
            continue;
          }
          const distances = data.distances?.[0] || [];
          const durations = data.durations?.[0] || [];
          chunk.list.forEach((m, idx) => {
            if (!travelCacheRef.current[m.id]) travelCacheRef.current[m.id] = {};
            (travelCacheRef.current[m.id] as Record<string, ModeData>)[mode] = { distance: distances[idx+1], duration: durations[idx+1] };
          });
          if (partialUpdates) updateAllPopups();
          if (cancelled) return;
        }
      }
      updateAllPopups();
      if(onTravelProfilesFailed && failedProfilesRef.current.size){
        onTravelProfilesFailed(Array.from(failedProfilesRef.current) as TravelMode[]);
      }
    };

    updateAllPopups(); // initial state replacing any stale cache markers
    if (travelRefreshMinutes > 0) {
      intervalId = window.setInterval(()=>{ if(!cancelled){ void run(); } }, travelRefreshMinutes * 60 * 1000) as unknown as number;
    }
    return () => { cancelled = true; window.clearTimeout(timeout); if(intervalId) window.clearInterval(intervalId); };
  }, [origin, markers, effectiveModes, osrmBase, travelFetchDebounceMs, partialUpdates, maxTableBatch, travelRefreshMinutes, onTravelProfilesFailed, enableRouting, routeProfile, routeColor, showOriginMarker, originPopup, shouldFetchTravel]);

  // Deprecated legacy formatter kept for potential backward compatibility (unused)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function formatMode(_icon: string, _distMeters?: number, _durSeconds?: number) { return ''; }

  return (
    <div className={`${className} relative`} style={{ height }}>
      <div ref={containerRef} className="w-full h-full rounded-lg overflow-hidden leaflet-container-custom" />
      {showRefitAllControl && (
        <button
          type="button"
          onClick={fitOriginAndMarkers}
          className="absolute top-2 left-12 z-[5000] bg-white/80 dark:bg-zinc-800/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium shadow hover:bg-white dark:hover:bg-zinc-700 transition"
          aria-label="Fit villa and markers"
        >↺ Fit All</button>
      )}
      {enableRouting && routeLayerRef.current && (
        <button
          type="button"
          onClick={() => {
            if(routeLayerRef.current){ routeLayerRef.current.remove(); routeLayerRef.current = null; }
            if(persistKey){ try { localStorage.removeItem(persistKey+':route'); } catch {} }
          }}
          className="absolute top-2 left-2 z-[5000] bg-white/80 dark:bg-zinc-800/80 backdrop-blur px-3 py-1 rounded-full text-xs font-medium shadow hover:bg-white dark:hover:bg-zinc-700 transition"
          aria-label="Clear route"
        >✕ Route</button>
      )}
  {enableTravelModeToggle && origin && (
        <div className="absolute top-2 right-2 z-[5000] flex gap-1 bg-white/70 dark:bg-zinc-800/70 backdrop-blur px-2 py-1 rounded-full shadow-sm text-[11px] font-medium">
          {(['driving','foot','cycling'] as const).map(mode => {
            const active = selectedModes.includes(mode);
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSelectedModes(prev => prev.includes(mode) ? prev.filter(m=>m!==mode) : [...prev, mode])}
                className={`px-2 py-[2px] rounded-full flex items-center gap-1 transition ${active ? 'bg-black/80 text-white dark:bg-white/80 dark:text-black' : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'}`}
                aria-pressed={active}
              >
        {mode === 'driving' ? '🚗' : mode === 'foot' ? '🚶' : '🚲'} {mode}
              </button>
            );
          })}
        </div>
      )}
      <style jsx global>{`
        .leaflet-container-custom .lmk { 
          background: var(--accent-500); 
          width: 42px; height: 42px; border-radius: 50%; 
          display:flex; align-items:center; justify-content:center; 
          box-shadow:0 4px 10px rgba(0,0,0,0.25); 
          font-size:18px; border:2px solid #fff; 
        }
  .leaflet-container-custom .lmk.marker-pop, .marker-pop.leaflet-marker-icon { animation: marker-pop 420ms ease; }
  .marker-pop .lmk { animation: marker-pop 420ms ease; }
  @keyframes marker-pop { 0% { transform: scale(0.4); opacity:0; } 60% { transform: scale(1.08); opacity:1;} 100% { transform: scale(1); } }
        .leaflet-container-custom .lmk[data-type='restaurant'] { background:#ff6b6b; }
        .leaflet-container-custom .lmk[data-type='service'] { background:var(--brand-600); }
        .leaflet-container-custom .lmk[data-type='attraction'] { background:#4ecdc4; }
  .leaflet-origin-marker .lmk { background:#f59e0b; }
        [data-theme='dark'] .leaflet-container-custom .lmk { border-color:#111; }
        [data-theme='dark'] .leaflet-tile { filter: brightness(0.78) contrast(1.05) saturate(0.85); }
        [data-theme='dark'] .leaflet-control-zoom a { background:#222; color:#eee; border-color:#333; }
        /* Cluster styling */
        .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background:rgba(54,185,171,0.85); }
        .marker-cluster div { background:#fff; color:#222; font-weight:600; }
  .travel-info span.inline-flex { font-weight:500; }
  .travel-loading .spinner { width:10px; height:10px; border:2px solid currentColor; border-top-color:transparent; border-radius:50%; display:inline-block; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg);} }
      `}</style>
    </div>
  );
}

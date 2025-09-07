"use client";
import React, { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { logger } from '@/lib/logger';
import StaticLocationMap from './StaticLocationMap';
import dynamic from 'next/dynamic';
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

// Note: In production, move this to environment variables
// You'll need to get your own token from https://mapbox.com
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'pk.eyJ1IjoidGVzdCIsImEiOiJjbDdnNmJiZHIwNnA3M29wZjdkMWY0YmZsIn0.fake'; // Replace with real token

export interface MarkerData {
  id: string;
  name: string;
  description?: string;
  coordinates: [number, number]; // [lng, lat]
  type: 'villa' | 'restaurant' | 'service' | 'attraction';
  price?: string;
  rating?: number;
  category?: string;
  href?: string;
}

interface InteractiveMapProps {
  markers?: MarkerData[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  onMarkerClick?: (marker: MarkerData) => void;
  locale?: string; // for localized static fallback
}

// Villa location (Kalamata, Greece - real coordinates)
const VILLA_LOCATION: [number, number] = [22.094364, 37.040635]; // Kalamata, Messenia

export default function InteractiveMap({
  markers = [],
  center = VILLA_LOCATION,
  zoom = 13,
  height = "400px",
  className = "",
  onMarkerClick,
  locale = 'en'
}: InteractiveMapProps) {
  const eff: Locale = locale === 'el' ? 'el' : 'en';
  const dict = getDictionary(eff);
  const mapT = dict.map;
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create custom marker with popup (defined early so effects can depend on it)
  const createCustomMarker = useCallback((markerData: MarkerData): mapboxgl.Marker => {
    if (!map.current) throw new Error('Map not initialized');

    const el = document.createElement('div');
    el.className = 'custom-map-marker';
    const markerStyle = getMarkerStyle(markerData.type);
    el.innerHTML = `
      <div class="marker-pin ${markerStyle.className}">
        <div class="marker-icon">${markerStyle.icon}</div>
        ${markerData.price ? `<div class="marker-price">${markerData.price}</div>` : ''}
      </div>
    `;

    const popup = new mapboxgl.Popup({ 
      offset: 25,
      className: 'custom-map-popup'
    }).setHTML(`
      <div class="map-popup-content">
        <h3 class="popup-title">${markerData.name}</h3>
        ${markerData.description ? `<p class="popup-description">${markerData.description}</p>` : ''}
        ${markerData.rating ? `<div class="popup-rating">⭐ ${markerData.rating}</div>` : ''}
  ${markerData.href ? `<a href="${markerData.href}" class="popup-link">${mapT?.viewDetails} →</a>` : ''}
      </div>
    `);

    const marker = new mapboxgl.Marker(el)
      .setLngLat(markerData.coordinates)
      .setPopup(popup)
      .addTo(map.current);

    el.addEventListener('click', () => {
      onMarkerClick?.(markerData);
    });

    return marker;
  }, [onMarkerClick, mapT]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;

    // Check if Mapbox token is available
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN.includes('fake')) {
      setError('Mapbox token not configured');
      return;
    }

    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/light-v11', // Clean, minimal style
        center: center,
        zoom: zoom,
        attributionControl: false // We'll add custom attribution
      });

      // Custom map styling to match brand
      map.current.on('load', () => {
        if (!map.current) return;
        
        // Add custom styling layers to match your teal theme
        map.current.addSource('villa-glow', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: VILLA_LOCATION
            }
          }
        });

        // Add glow effect around villa
        map.current.addLayer({
          id: 'villa-glow',
          type: 'circle',
          source: 'villa-glow',
          paint: {
            'circle-radius': 50,
            'circle-color': '#36b9ab',
            'circle-opacity': 0.15,
            'circle-blur': 1
          }
        });

        setIsLoaded(true);
      });

      map.current.on('error', (e) => {
        logger.error('Mapbox error', e);
        setError('Failed to load map');
      });

    } catch (err) {
      logger.error('Failed to initialize map', err);
      setError('Map initialization failed');
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, [center, zoom]);

  // Add markers when they change
  useEffect(() => {
    if (!map.current || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add villa marker (main property)
    const villaMarker = createCustomMarker({
      id: 'villa',
      name: mapT?.villaMarkerTitle || 'Villa',
      description: mapT?.villaMarkerDesc,
      coordinates: VILLA_LOCATION,
      type: 'villa',
      price: '€150/night'
    });

    markersRef.current.push(villaMarker);

    // Add other markers
    markers.forEach(markerData => {
      const marker = createCustomMarker(markerData);
      markersRef.current.push(marker);
    });

  }, [markers, isLoaded, createCustomMarker, mapT]);

  // Get marker styling based on type
  const getMarkerStyle = (type: MarkerData['type']) => {
    switch (type) {
      case 'villa':
        return { icon: '🏡', className: 'marker-villa' };
      case 'restaurant':
        return { icon: '🍽️', className: 'marker-restaurant' };
      case 'service':
        return { icon: '📞', className: 'marker-service' };
      case 'attraction':
        return { icon: '📍', className: 'marker-attraction' };
      default:
        return { icon: '📍', className: 'marker-default' };
    }
  };

  // If token not configured, show helpful fallback
  if (error === 'Mapbox token not configured') {
    // Use free OpenStreetMap + Leaflet fallback first; keep old static as noscript support.
    return (
      <div className={className} style={{ height }}>
        <LeafletMap 
          center={center}
          zoom={zoom}
          height={height}
          markers={markers.map(m => ({ id: m.id, name: m.name, description: m.description, coordinates: m.coordinates, price: m.price }))}
        />
        <noscript>
          <StaticLocationMap height={height} className="mt-4" title="Villa Location" locale={locale} showHeading={false} />
        </noscript>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} relative`} style={{ height }}>
        <div className="w-full h-full bg-red-50 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-600 text-lg mb-2">⚠️</div>
            <p className="text-red-800 font-medium">{mapT?.failed}</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height }}>
      <div 
        ref={mapContainer} 
        className="w-full h-full rounded-lg overflow-hidden"
        style={{ height: '100%' }}
      />
      
      {/* Loading overlay */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-white rounded-lg flex items-center justify-center">
          <div className="text-center">
            <div className="text-brand-600 text-lg mb-2 animate-spin">🗺️</div>
            <p className="text-brand-800 font-medium">{mapT?.loading}</p>
          </div>
        </div>
      )}

      {/* Map attribution */}
      {isLoaded && (
        <div className="absolute bottom-2 right-2 text-xs bg-white/90 px-2 py-1 rounded text-gray-600">
          © <a href="https://mapbox.com" target="_blank" className="underline" aria-label="Mapbox">Mapbox</a>
        </div>
      )}

      {/* Custom map styles */}
      <style jsx global>{`
        .custom-map-marker {
          cursor: pointer;
        }
        
        .marker-pin {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform: translate(-50%, -100%);
        }
        
        .marker-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          box-shadow: 0 4px 8px rgba(0,0,0,0.2);
          border: 2px solid white;
          transition: transform 0.2s ease;
        }
        
        .marker-icon:hover {
          transform: scale(1.1);
        }
        
        .marker-villa .marker-icon {
          background: var(--accent-500);
          width: 40px;
          height: 40px;
          font-size: 20px;
        }
        
        .marker-restaurant .marker-icon {
          background: #ff6b6b;
        }
        
        .marker-service .marker-icon {
          background: var(--brand-600);
        }
        
        .marker-attraction .marker-icon {
          background: #4ecdc4;
        }
        
        .marker-price {
          background: white;
          color: var(--brand-800);
          font-size: 11px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          margin-top: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          border: 1px solid var(--border-soft);
        }
        
        .custom-map-popup .mapboxgl-popup-content {
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
          border: 1px solid var(--border-soft);
          padding: 0;
          max-width: 280px;
        }
        
        .custom-map-popup .mapboxgl-popup-tip {
          border-top-color: white;
        }
        
        .map-popup-content {
          padding: 16px;
        }
        
        .popup-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-accent);
          margin-bottom: 8px;
        }
        
        .popup-description {
          font-size: 14px;
          color: var(--fg-muted);
          margin-bottom: 8px;
          line-height: 1.4;
        }
        
        .popup-rating {
          font-size: 12px;
          color: var(--brand-700);
          margin-bottom: 8px;
        }
        
        .popup-link {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 14px;
          color: var(--brand-600);
          text-decoration: none;
          font-weight: 500;
        }
        
        .popup-link:hover {
          color: var(--brand-700);
          text-decoration: underline;
        }
        
        /* Dark theme overrides */
        [data-theme="dark"] .custom-map-popup .mapboxgl-popup-content {
          background: var(--layer-surface);
          border-color: var(--border-soft);
        }
        
        [data-theme="dark"] .custom-map-popup .mapboxgl-popup-tip {
          border-top-color: var(--layer-surface);
        }
        
        [data-theme="dark"] .marker-price {
          background: var(--layer-surface);
          border-color: var(--border-soft);
        }
      `}</style>
    </div>
  );
}

// Helper to create marker from category item
interface GenericCategoryItem {
  id: string;
  name: string;
  summary?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  priceLevel?: number;
  slug?: string;
}

export function createMarkerFromItem(item: GenericCategoryItem, categorySlug: string, locale: string): MarkerData {
  // Extract coordinates from item or use default location near villa
  const coords: [number, number] = item.location ? 
    [item.location.lng, item.location.lat] : 
    [
      VILLA_LOCATION[0] + (Math.random() - 0.5) * 0.02, // Small random offset
      VILLA_LOCATION[1] + (Math.random() - 0.5) * 0.02
    ];

  return {
    id: item.id,
    name: item.name,
    description: item.summary,
    coordinates: coords,
    type: categorySlug === 'restaurants' ? 'restaurant' : 
          categorySlug === 'phones' ? 'service' : 'attraction',
    rating: item.rating,
    price: item.priceLevel ? '€'.repeat(item.priceLevel) : undefined,
    category: categorySlug,
    href: `/${locale}/${categorySlug}/${item.slug || item.id}`
  };
}

"use client";
import React, { useMemo } from 'react';
import InteractiveMap from './InteractiveMap';
import { createMarkerFromItem, markerFromMapLocation, type MarkerData } from '@/lib/mapUtils';
import { getApartmentMapLocation } from '@/data/mapLocations';
import StaticLocationMap from './StaticLocationMap';

interface CategoryItem {
  id: string;
  name: string;
  summary?: string;
  slug?: string;
  rating?: number;
  price?: string;
  priceLevel?: number;
  location?: { lat: number; lng: number };
  phone?: string;
  phones?: string[];
  address?: string;
  website?: string;
  directionsUrl?: string;
  sourceUrls?: string[];
}

interface ApartmentLocationMapProps {
  locale: string;
  height?: string;
  zoom?: number;
  showNearbyAttractions?: boolean;
  className?: string;
  nearbyRestaurants?: CategoryItem[];
  nearbyServices?: CategoryItem[];
  nearbyAttractions?: CategoryItem[];
  activation?: 'viewport' | 'intent';
}

export default function ApartmentLocationMap({
  locale,
  height = "300px",
  zoom = 14,
  showNearbyAttractions = true,
  className = "",
  nearbyRestaurants = [],
  nearbyServices = [],
  nearbyAttractions = [],
  activation = 'viewport'
}: ApartmentLocationMapProps) {
  const apartmentMarker = useMemo(
    () => markerFromMapLocation(getApartmentMapLocation(locale === 'el' ? 'el' : 'en')),
    [locale]
  );

  // Get nearby attractions from props
  const nearbyMarkers: MarkerData[] = useMemo(() => {
    const markers: MarkerData[] = [apartmentMarker];

    if (!showNearbyAttractions) return markers;

    // Add restaurants from props
    nearbyRestaurants.slice(0, 5).forEach(item => {
      const marker = createMarkerFromItem(item, 'moments', locale);
      if (marker) markers.push(marker);
    });

    // Add services from props
    nearbyServices.slice(0, 3).forEach(item => {
      const marker = createMarkerFromItem(item, 'phones', locale);
      if (marker) markers.push(marker);
    });

    // Add attractions from props  
    nearbyAttractions.slice(0, 4).forEach(item => {
      const marker = createMarkerFromItem(item, 'sightseeing', locale);
      if (marker) markers.push(marker);
    });

    return markers;
  }, [apartmentMarker, locale, showNearbyAttractions, nearbyRestaurants, nearbyServices, nearbyAttractions]);

  // Single responsibility: delegate fallback to InteractiveMap; add dedicated static panel for no-JS via <noscript>
  return (
    <div className={className}>
      <InteractiveMap
        markers={nearbyMarkers}
        center={apartmentMarker.coordinates}
        zoom={zoom}
        height={height}
        locale={locale as 'en' | 'el'}
        activation={activation}
      />
      <noscript>
        <div className="mt-4">
          <StaticLocationMap locale={locale} height={height} />
        </div>
      </noscript>
    </div>
  );
}

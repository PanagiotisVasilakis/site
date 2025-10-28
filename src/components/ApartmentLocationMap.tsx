"use client";
import React, { useMemo } from 'react';
import InteractiveMap from './InteractiveMap';
import { createMarkerFromItem, type MarkerData, APARTMENT_LOCATION } from '@/lib/mapUtils';
import StaticLocationMap from './StaticLocationMap';

interface CategoryItem {
  id: string;
  name: string;
  summary?: string;
  slug?: string;
  rating?: number;
  priceLevel?: number;
  location?: { lat: number; lng: number };
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
}

// (villa content import removed – not needed here)

// Apartment details - now using real Kalamata location
const APARTMENT_DATA = {
  id: 'apartment',
  name: '2-Bedroom Apartment with Views',
  description: 'Spacious apartment with mountain & sea views',
  coordinates: APARTMENT_LOCATION, // Use imported constant
  type: 'apartment' as const,
  price: '€65/night'
};

export default function ApartmentLocationMap({ 
  locale, 
  height = "300px", 
  zoom = 14,
  showNearbyAttractions = true,
  className = "",
  nearbyRestaurants = [],
  nearbyServices = [],
  nearbyAttractions = []
}: ApartmentLocationMapProps) {
  
  // Get nearby attractions from props
  const nearbyMarkers: MarkerData[] = useMemo(() => {
    const markers: MarkerData[] = [{
      id: APARTMENT_DATA.id,
      name: APARTMENT_DATA.name,
      description: APARTMENT_DATA.description,
      coordinates: APARTMENT_DATA.coordinates,
      type: 'apartment',
      price: APARTMENT_DATA.price
    }];
    
    if (!showNearbyAttractions) return markers;
    
    // Add restaurants from props
    nearbyRestaurants.slice(0, 5).forEach(item => {
      markers.push(createMarkerFromItem(item, 'restaurants', locale));
    });

    // Add services from props
    nearbyServices.slice(0, 3).forEach(item => {
      markers.push(createMarkerFromItem(item, 'phones', locale));
    });

    // Add attractions from props  
    nearbyAttractions.slice(0, 4).forEach(item => {
      markers.push(createMarkerFromItem(item, 'sightseeing', locale));
    });

    return markers;
  }, [locale, showNearbyAttractions, nearbyRestaurants, nearbyServices, nearbyAttractions]);

  const handleMarkerClick = (marker: MarkerData) => {
    if (marker.href) {
      window.open(marker.href, '_blank');
    }
  };

  // Single responsibility: delegate fallback to InteractiveMap; add dedicated static panel for no-JS via <noscript>
  return (
    <div className={className}>
      <InteractiveMap
        markers={nearbyMarkers}
  center={APARTMENT_DATA.coordinates}
        zoom={zoom}
        height={height}
        onMarkerClick={handleMarkerClick}
        locale={locale as 'en' | 'el'}
      />
      <noscript>
        <div className="mt-4">
          <StaticLocationMap locale={locale} height={height} />
        </div>
      </noscript>
    </div>
  );
}

"use client";
import React, { useMemo } from 'react';
import InteractiveMap, { createMarkerFromItem, type MarkerData } from './InteractiveMap';
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

interface VillaLocationMapProps {
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

// Villa details - now using real Kalamata location
const VILLA_DATA = {
  id: 'villa',
  name: '2-Bedroom Apartment with Views',
  description: 'Spacious apartment with mountain & sea views',
  coordinates: [22.094364, 37.040635] as [number, number], // Kalamata, Greece
  type: 'villa' as const,
  price: '€65/night'
};

export default function VillaLocationMap({ 
  locale, 
  height = "300px", 
  zoom = 14,
  showNearbyAttractions = true,
  className = "",
  nearbyRestaurants = [],
  nearbyServices = [],
  nearbyAttractions = []
}: VillaLocationMapProps) {
  
  // Get nearby attractions from props
  const nearbyMarkers: MarkerData[] = useMemo(() => {
    const markers: MarkerData[] = [{
      id: VILLA_DATA.id,
      name: VILLA_DATA.name,
      description: VILLA_DATA.description,
      coordinates: VILLA_DATA.coordinates,
      type: 'villa',
      price: VILLA_DATA.price
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
        center={VILLA_DATA.coordinates}
        zoom={zoom}
        height={height}
        onMarkerClick={handleMarkerClick}
        locale={locale}
      />
      <noscript>
        <div className="mt-4">
          <StaticLocationMap locale={locale} height={height} />
        </div>
      </noscript>
    </div>
  );
}

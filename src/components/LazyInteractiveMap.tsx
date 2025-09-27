"use client";
import dynamic from 'next/dynamic';
import type { Locale } from '@/i18n/config';
import type { MarkerData } from '@/lib/mapUtils';

// Re-export MarkerData type for convenience
export type { MarkerData } from '@/lib/mapUtils';

interface LazyInteractiveMapProps {
  markers?: MarkerData[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  className?: string;
  locale?: Locale;
  showNearbyAttractions?: boolean;
  villaData?: {
    checkIn: string;
    checkOut: string;
    guests: number;
    name: string;
    description: string;
    amenities: string[];
    coordinates: [number, number];
  };
  onMarkerClick?: (marker: MarkerData) => void;
}

// Dynamic import for the entire InteractiveMap component
// Keeps Leaflet (and window-dependent modules) out of the initial bundle
const InteractiveMap = dynamic(() => import('./InteractiveMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-600 mb-2"></div>
        <div className="text-sm text-gray-600">Loading interactive map...</div>
      </div>
    </div>
  )
});

export default function LazyInteractiveMap(props: LazyInteractiveMapProps) {
  return <InteractiveMap {...props} />;
}
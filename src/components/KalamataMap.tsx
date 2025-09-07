"use client";
import React from 'react';
import LeafletMap from './LeafletMap';
import { KALAMATA_POINTS } from '@/data/kalamataPoints';
import { VILLA_ORIGIN } from '@/config/map';

interface KalamataMapProps {
  height?: string;
  className?: string;
  showDistances?: boolean;
}

export default function KalamataMap({ height='520px', className='', showDistances=true }: KalamataMapProps){
  return (
    <LeafletMap
      center={VILLA_ORIGIN || [22.1145,37.0386]}
      origin={VILLA_ORIGIN}
      markers={KALAMATA_POINTS}
      height={height}
      className={className}
      showOriginMarker
      autoFitToOriginAndMarkers
      showRefitAllControl
      refitOnMarkerChange
      originPopup={{ name: 'Villa Base', address: 'Kalamata, Greece' }}
      travelModes={showDistances ? ['driving','foot','cycling'] : []}
      enableTravelModeToggle={showDistances}
    />
  );
}
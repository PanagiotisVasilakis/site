import React from 'react';
import LeafletMap, { LeafletMapProps } from './LeafletMap';
import { VILLA_ORIGIN } from '@/config/map';

/**
 * VillaMap is a thin wrapper around LeafletMap that automatically supplies the villa origin coordinate.
 * Pass any LeafletMapProps except origin (will be overridden) unless you want to explicitly override.
 */
export interface VillaMapProps extends Omit<LeafletMapProps, 'origin'> {
  /** Optionally override villa origin (otherwise internal default is used). */
  overrideOrigin?: [number, number];
}

// Villa origin now comes from config/env via VILLA_ORIGIN.

export default function VillaMap({ overrideOrigin, ...rest }: VillaMapProps) {
  const origin = overrideOrigin || VILLA_ORIGIN;
  return <LeafletMap origin={origin} enableTravelModeToggle {...rest} />;
}

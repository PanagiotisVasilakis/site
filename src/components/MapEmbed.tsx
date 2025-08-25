"use client";
import React, { useEffect, useState } from 'react';

type Props = {
  lat?: number;
  lng?: number;
  name: string;
  mapsHref?: string;
};

// Simple static map via Google Static Maps style URL placeholder (user can replace key/service). Offline: show placeholder.
export default function MapEmbed({ lat, lng, name, mapsHref }: Props) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  if (!lat || !lng) return null; // minimal; could fallback to geocoding address later

  const staticUrl = `https://maps.geoapify.com/v1/staticmap?style=osm-carto&width=600&height=300&center=lonlat:${lng},${lat}&zoom=14&marker=lonlat:${lng},${lat};color:%23ff5533;size:medium&apiKey=demo`;

  return (
    <div className="mt-4">
      <div className="relative rounded-md overflow-hidden border border-teal-100 bg-slate-100 aspect-[2/1] flex items-center justify-center">
        {online ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={staticUrl} alt={`Map for ${name}`} className="object-cover w-full h-full" loading="lazy" />
        ) : (
          <div className="text-xs text-teal-800 p-4 text-center">Map unavailable offline</div>
        )}
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener" className="absolute bottom-2 right-2 text-xs bg-teal-600 text-white px-2 py-1 rounded shadow" aria-label={`Open directions to ${name}`}>Open</a>
        )}
      </div>
    </div>
  );
}

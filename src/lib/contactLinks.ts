export function telHref(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/[^+0-9]/g, '');
  return `tel:${digits}`;
}

export function mapsHref(address?: string, lat?: number, lng?: number): string | undefined {
  if (!address && (lat == null || lng == null)) return undefined;
  if (lat != null && lng != null) return `https://maps.google.com/?q=${lat},${lng}`;
  return `https://maps.google.com/?q=${encodeURIComponent(address!)}`;
}

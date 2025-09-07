// Centralized map configuration & environment bindings.
// Exposes villa origin coordinate read from env or falls back to default.

// Expect env variable format: NEXT_PUBLIC_VILLA_ORIGIN="<lng>,<lat>"
function parseOrigin(raw?: string | undefined): [number, number] | null {
  if(!raw) return null;
  const parts = raw.split(',').map(s=>parseFloat(s.trim()));
  if(parts.length !== 2 || parts.some(n=>Number.isNaN(n))) return null;
  return [parts[0], parts[1]];
}

const envRaw = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_VILLA_ORIGIN : undefined;
const parsed = parseOrigin(envRaw);

export const VILLA_ORIGIN: [number, number] = parsed || [23.71622, 37.97945]; // Default fallback

export function getVillaOrigin(): [number, number] { return VILLA_ORIGIN; }

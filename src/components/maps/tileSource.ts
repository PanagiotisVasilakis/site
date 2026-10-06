export interface MapTileSource {
  url: string;
  attribution: string;
}

// OSMF tile usage policy: use exactly this URL (no a/b/c subdomains) and link the copyright page.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = `${OSM_ATTRIBUTION} &copy; <a href="https://carto.com/attributions">CARTO</a>`;

/**
 * CARTO basemaps require an API key (https://carto.com/basemaps/apikey/); without one the
 * map uses the standard OpenStreetMap tiles in both themes, never keyless CARTO tiles.
 * `{r}` is Leaflet's retina suffix ('@2x' on high-DPI screens), which CARTO serves.
 */
export function selectMapTileSource(isDark: boolean, cartoBasemapsKey?: string): MapTileSource {
  if (!cartoBasemapsKey) return { url: OSM_TILE_URL, attribution: OSM_ATTRIBUTION };
  const style = isDark ? 'dark_all' : 'rastertiles/voyager';
  return {
    url: `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoBasemapsKey)}`,
    attribution: CARTO_ATTRIBUTION,
  };
}

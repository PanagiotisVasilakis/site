// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tileCalls = vi.hoisted(() => [] as Array<{ url: string; attribution: unknown }>);
const markerLayers = vi.hoisted(() => [] as Array<{ markers: Array<{ title?: string; zIndexOffset?: number }>; addedToMap: boolean }>);
const markerClusterGroup = vi.hoisted(() => vi.fn());
const fitBounds = vi.hoisted(() => vi.fn());
const boundsPoints = vi.hoisted(() => [] as unknown[][]);

vi.mock('leaflet', () => {
  const layer = () => ({ addTo() { return this; }, addLayer() { return this; }, getContainer: () => document.createElement('div') });
  const fakeLeaflet = {
    map: () => ({
      on() {},
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => 13,
      removeLayer() {},
      addControl() {},
      remove() {},
      fitBounds,
      setView() {},
    }),
    tileLayer: (url: string, options: { attribution?: unknown }) => {
      tileCalls.push({ url, attribution: options?.attribution });
      return layer();
    },
    control: { zoom: () => layer() },
    Control: { extend: () => function FakeControl() {} },
    DomUtil: { create: (tag: string) => document.createElement(tag) },
    divIcon: () => ({}),
    marker: (_latLng: unknown, options: { title?: string; zIndexOffset?: number }) => ({
      title: options?.title,
      zIndexOffset: options?.zIndexOffset,
      bindPopup() { return this; },
      on() { return this; },
      addTo() { return this; },
    }),
    layerGroup: () => {
      const group = { markers: [] as Array<{ title?: string }>, addedToMap: false };
      markerLayers.push(group);
      return {
        addLayer(marker: { title?: string; zIndexOffset?: number }) { group.markers.push(marker); return this; },
        addTo() { group.addedToMap = true; return this; },
      };
    },
    latLngBounds: (points: unknown[]) => { boundsPoints.push(points); return { pad: () => ({}) }; },
    // Present so a reintroduced clustering path would be taken and caught below.
    markerClusterGroup,
  };
  return { default: fakeLeaflet };
});
vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('@/styles/components/map.css', () => ({}));

import LeafletMap, { type LeafletMapLabels, type LeafletMarkerData } from '@/components/LeafletMap';

const labels: LeafletMapLabels = {
  address: 'Address',
  phone: 'Phone',
  directions: 'Directions',
  website: 'Website',
  details: 'Details',
  home: "You're staying here",
  locateMe: 'Locate me',
  locationUnavailable: 'Unavailable',
  fitToMarkers: 'Fit',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
};

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_COPYRIGHT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const CARTO_ATTRIBUTION = `${OSM_COPYRIGHT} &copy; <a href="https://carto.com/attributions">CARTO</a>`;
const KEY = 'test-key-aaaaaaaa';

function renderMap(cartoBasemapsKey?: string) {
  return render(
    <LeafletMap center={[22.1, 37.0]} labels={labels} cartoBasemapsKey={cartoBasemapsKey} />,
  );
}

function lastTiles() {
  return tileCalls.at(-1);
}

function stubOsColorScheme(dark: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe('LeafletMap tile source', () => {
  beforeEach(() => {
    tileCalls.length = 0;
    document.documentElement.removeAttribute('data-theme');
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute('data-theme');
  });

  it.each(['light', 'dark'])('uses the exact OpenStreetMap URL in the %s theme without a key', (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    renderMap();
    expect(tileCalls).toEqual([{ url: OSM_URL, attribution: OSM_COPYRIGHT }]);
  });

  it('treats an empty key as not configured', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderMap('');
    expect(lastTiles()).toEqual({ url: OSM_URL, attribution: OSM_COPYRIGHT });
  });

  it('uses CARTO Voyager with the key in the light theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    renderMap(KEY);
    expect(lastTiles()).toEqual({
      url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${KEY}`,
      attribution: CARTO_ATTRIBUTION,
    });
  });

  it('uses CARTO Dark Matter with the key in the dark theme', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    renderMap(KEY);
    expect(lastTiles()).toEqual({
      url: `https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${KEY}`,
      attribution: CARTO_ATTRIBUTION,
    });
  });

  // R-378: an explicit Day choice (data-theme="light") decides the basemap even on a dark OS, as it does for
  // the page tokens; only without a choice (Auto, no attribute) does the OS colour scheme apply.
  it('uses CARTO Voyager for an explicit Day choice on a dark OS', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    stubOsColorScheme(true);
    renderMap(KEY);
    expect(lastTiles()).toEqual({
      url: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${KEY}`,
      attribution: CARTO_ATTRIBUTION,
    });
  });

  it.each([
    [true, 'dark_all'],
    [false, 'rastertiles/voyager'],
  ])('follows the OS colour scheme (dark: %s) without an explicit choice', (osDark, style) => {
    stubOsColorScheme(osDark);
    renderMap(KEY);
    expect(lastTiles()?.url).toBe(`https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${KEY}`);
  });

  it('keeps the key when the theme switches at runtime', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    renderMap(KEY);
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      await Promise.resolve();
    });
    expect(lastTiles()?.url).toBe(`https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${KEY}`);
  });
});

describe('LeafletMap markers', () => {
  beforeEach(() => {
    markerLayers.length = 0;
    markerClusterGroup.mockImplementation(() => ({
      addLayer() { return this; },
      addTo() { return this; },
    }));
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('adds every marker individually to one plain layer on the map', () => {
    const markers: LeafletMarkerData[] = Array.from({ length: 25 }, (_, i) => ({
      id: `m${i}`,
      name: `Marker ${i}`,
      coordinates: [22.1 + i / 1000, 37.0],
      markerType: 'attraction',
    }));
    render(<LeafletMap center={[22.1, 37.0]} labels={labels} markers={markers} />);

    expect(markerClusterGroup).not.toHaveBeenCalled();
    const onMap = markerLayers.filter(layer => layer.addedToMap);
    expect(onMap).toHaveLength(1);
    expect(onMap[0].markers.map(marker => marker.title)).toEqual(markers.map(marker => marker.name));
  });

  // R-374: at 390 px the landmark icons and the home label lay over the numbers 1, 3, 4 and 5; Leaflet
  // stacks pins by latitude only, so the guide's numbered pins are raised above the other pins.
  it('stacks the numbered pins above the landmark and home pins', () => {
    markerLayers.length = 0;
    render(
      <LeafletMap
        center={[22.1, 37.0]}
        labels={labels}
        markers={[
          { id: 'apartment', name: 'Home', coordinates: [22.09, 37.04], markerType: 'apartment' },
          { id: 'square', name: 'Square', coordinates: [22.1132, 37.043], markerType: 'city-center' },
          { id: 'museum', name: 'Museum', coordinates: [22.1135, 37.0438], markerType: 'attraction', number: 1 },
        ]}
      />,
    );
    const [home, square, museum] = markerLayers.filter(layer => layer.addedToMap)[0].markers;
    expect(museum.zIndexOffset ?? 0).toBeGreaterThan(home.zIndexOffset ?? 0);
    expect(museum.zIndexOffset ?? 0).toBeGreaterThan(square.zIndexOffset ?? 0);
  });
});

describe('LeafletMap fitting', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
  });

  afterEach(() => {
    cleanup();
  });

  const marker = (id: string): LeafletMarkerData => ({ id, name: id, coordinates: [22.1, 37.0], markerType: 'attraction' });

  it('fits the markers on mount and refits when the markers change', () => {
    const { rerender } = render(
      <LeafletMap center={[22.1, 37.0]} labels={labels} markers={[marker('a')]} />,
    );
    expect(fitBounds).toHaveBeenCalledTimes(1);

    rerender(<LeafletMap center={[22.1, 37.0]} labels={labels} markers={[marker('a'), marker('b')]} />);
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });

  it('fits the numbered places and the apartment, not the far landmarks, on the guide map', () => {
    boundsPoints.length = 0;
    render(
      <LeafletMap
        center={[22.1, 37.0]}
        labels={labels}
        markers={[
          { id: 'apartment', name: 'Home', coordinates: [22.09, 37.04], markerType: 'apartment' },
          { id: 'beach', name: 'Far beach', coordinates: [22.15, 36.99], markerType: 'beach' },
          { id: 'museum', name: 'Museum', coordinates: [22.11, 37.04], markerType: 'attraction', number: 1 },
        ]}
      />,
    );
    expect(boundsPoints.at(-1)).toEqual([[37.04, 22.11], [37.04, 22.09]]);
  });
});

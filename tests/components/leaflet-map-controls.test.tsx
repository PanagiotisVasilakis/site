// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('leaflet/dist/leaflet.css', () => ({}));
vi.mock('@/styles/components/map.css', () => ({}));

import LeafletMap, { type LeafletMapLabels, type LeafletMarkerData } from '@/components/LeafletMap';

// R-394 and R-398 are about how Leaflet routes DOM events and keeps layers. The other map tests replace Leaflet with
// a fake, which would only repeat the component's own assumptions, so these run the real library in jsdom.

// Every map the component creates, in creation order (an init hook is the public way to reach the instance).
const maps: L.Map[] = [];
L.Map.addInitHook(function (this: L.Map) {
  maps.push(this);
});

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

// [longitude, latitude], under 2 km apart: the fit lands below the maximum zoom, so a zoom step is still possible.
const markers: LeafletMarkerData[] = [
  { id: 'home', name: 'Home', coordinates: [22.1143, 37.0396], markerType: 'apartment' },
  { id: 'police', name: 'Police', coordinates: [22.13, 37.05], markerType: 'service' },
];

const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();

// The same labels and markers on every render: only the zoom prop may rebuild the map (it is an effect dependency).
function mapElement(zoom = 13) {
  return <LeafletMap center={[22.1, 37.04]} zoom={zoom} labels={labels} markers={markers} />;
}

function control(name: string) {
  return screen.getByRole('button', { name });
}

function currentMap() {
  const map = maps.at(-1);
  if (!map) throw new Error('LeafletMap did not create a map');
  return map;
}

function doubleClick(target: HTMLElement) {
  // What a browser sends for a double-click, in order.
  fireEvent.mouseDown(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
  fireEvent.mouseDown(target);
  fireEvent.mouseUp(target);
  fireEvent.click(target);
  fireEvent.dblClick(target);
}

function answerLocate(latitude: number, longitude: number) {
  const onSuccess = getCurrentPosition.mock.lastCall?.[0];
  if (!onSuccess) throw new Error('Locate me did not ask for a position');
  onSuccess({ coords: { latitude, longitude } } as GeolocationPosition);
}

// The data pins carry their place's name as the title; a marker without one is the guest's own position.
function positionPins(map: L.Map) {
  const pins: L.Marker[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker && !layer.options.title) pins.push(layer);
  });
  return pins;
}

beforeEach(() => {
  maps.length = 0;
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  // jsdom has no layout: without a frame a fit has no room and a zoom change cannot be seen.
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(400);
  // Leaflet's keyboard handler calls window.scrollTo on the first mousedown on the map; jsdom only logs an error.
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

// R-394: the two custom controls are plain buttons; Leaflet's own zoom buttons stop the events they receive, so a
// double-click on Fit or Locate me must not reach the map's double-click zoom either.
describe('LeafletMap custom controls (R-394)', () => {
  it('zooms in one level on a double-click on the bare map (the zoom is observable here)', () => {
    render(mapElement());
    const map = currentMap();
    const zoom = map.getZoom();

    doubleClick(map.getContainer());

    expect(map.getZoom()).toBe(zoom + 1);
  });

  it.each(['Fit', 'Locate me'])('keeps the zoom and sends nothing to the map when %s is double-clicked', (name) => {
    render(mapElement());
    const map = currentMap();
    const zoom = map.getZoom();
    const onClick = vi.fn();
    const onDoubleClick = vi.fn();
    map.on('click', onClick);
    map.on('dblclick', onDoubleClick);

    doubleClick(control(name));

    expect(map.getZoom()).toBe(zoom);
    expect(onClick).not.toHaveBeenCalled();
    expect(onDoubleClick).not.toHaveBeenCalled();
  });

  it('still fits on a plain click on Fit and still asks for the position on a plain click on Locate me', () => {
    render(mapElement());
    const map = currentMap();
    const fitted = map.getZoom();
    map.setZoom(fitted - 3);

    fireEvent.click(control('Fit'));
    expect(map.getZoom()).toBe(fitted);

    fireEvent.click(control('Locate me'));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});

// R-398: Locate me kept adding a new focusable, unnamed phone pin per answer, and threw when the answer came
// after the map had been unmounted.
describe('LeafletMap Locate me (R-398)', () => {
  it('keeps one position pin at the latest position that is not a tab stop', () => {
    const { container } = render(mapElement());
    const map = currentMap();

    fireEvent.click(control('Locate me'));
    answerLocate(37.03, 22.11);
    fireEvent.click(control('Locate me'));
    answerLocate(37.031, 22.112);

    const pins = positionPins(map);
    expect(pins).toHaveLength(1);
    expect(pins[0].getLatLng()).toMatchObject({ lat: 37.031, lng: 22.112 });
    expect(pins[0].getElement()).not.toHaveAttribute('tabindex');
    expect(pins[0].getElement()).not.toHaveAttribute('role');
    expect(pins[0].getElement()).not.toHaveClass('leaflet-interactive');
    // The data pins are the only other pins on the map.
    expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(markers.length + 1);
  });

  it('shows the position pin on the rebuilt map after the map was re-initialised', () => {
    const { rerender } = render(mapElement(13));
    fireEvent.click(control('Locate me'));
    answerLocate(37.03, 22.11);
    const firstMap = currentMap();

    // A changed zoom prop removes the map and builds a new one in the same container.
    rerender(mapElement(14));
    const rebuilt = currentMap();
    expect(rebuilt).not.toBe(firstMap);
    fireEvent.click(control('Locate me'));
    answerLocate(37.031, 22.112);

    expect(positionPins(rebuilt)).toHaveLength(1);
  });

  it('ignores a position that arrives after the map was unmounted', () => {
    const { unmount } = render(mapElement());
    fireEvent.click(control('Locate me'));

    unmount();

    expect(() => answerLocate(37.03, 22.11)).not.toThrow();
  });
});

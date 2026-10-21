// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  closePopup: 'Close',
  mapRegion: 'Interactive map',
};

// [longitude, latitude], under 2 km apart: the fit lands below the maximum zoom, so a zoom step is still possible.
const markers: LeafletMarkerData[] = [
  { id: 'home', name: 'Home', coordinates: [22.1143, 37.0396], markerType: 'apartment' },
  { id: 'police', name: 'Police', coordinates: [22.13, 37.05], markerType: 'service' },
];

const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>();

// The Greek page's labels for the popup close button (R-687); a module constant, as the labels are an effect dependency.
const greekLabels: LeafletMapLabels = { ...labels, closePopup: 'Κλείσιμο' };

// The same labels and markers on every render: only the zoom prop may rebuild the map (it is an effect dependency).
function mapElement(zoom = 13, mapLabels: LeafletMapLabels = labels) {
  return <LeafletMap center={[22.1, 37.04]} zoom={zoom} labels={mapLabels} markers={markers} />;
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

// The guest denies the browser's location permission: the callback sets component state, so it runs inside act.
function denyLocate() {
  const onError = getCurrentPosition.mock.lastCall?.[1];
  if (!onError) throw new Error('Locate me did not ask for a position');
  act(() => onError({ code: 1, message: 'denied' } as GeolocationPositionError));
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
  document.documentElement.removeAttribute('data-motion');
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

// R-687: Leaflet hard-codes aria-label="Close popup" on the popup's close button, so a Greek screen-reader user heard
// English there. The component sets the label from the map labels each time a popup opens.
describe('LeafletMap popup close button (R-687)', () => {
  function dataPin(map: L.Map, title: string) {
    let found: L.Marker | undefined;
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker && layer.options.title === title) found = layer;
    });
    if (!found) throw new Error(`No pin titled ${title}`);
    return found;
  }

  function closeButton(container: HTMLElement) {
    const button = container.querySelector('.leaflet-popup-close-button');
    if (!button) throw new Error('The popup has no close button');
    return button;
  }

  it('names the close button from the Greek labels on the first and on the second open', () => {
    const { container } = render(mapElement(13, greekLabels));
    const pin = dataPin(currentMap(), 'Police');

    pin.openPopup();
    expect(closeButton(container)).toHaveAttribute('aria-label', 'Κλείσιμο');

    pin.closePopup();
    pin.openPopup();
    expect(closeButton(container)).toHaveAttribute('aria-label', 'Κλείσιμο');
  });
});

// FGM-06: the guest's position was drawn with the phone-handset pill of the police, fire and hospital pins.
describe('LeafletMap position marker (FGM-06)', () => {
  it('draws the position as a dot with its own marker, not as a place pin', () => {
    render(mapElement());
    const map = currentMap();

    fireEvent.click(control('Locate me'));
    answerLocate(37.03, 22.11);

    const [pin] = positionPins(map);
    const element = pin.getElement();
    expect(element?.querySelector('.map-you')).not.toBeNull();
    expect(element?.querySelector('.map-pin')).toBeNull();
    expect(element?.querySelector('[data-type]')).toBeNull();
    expect(element?.querySelector('svg')).toBeNull();
    // The data pin for the police station keeps the phone pill.
    expect(document.querySelector('.map-pin--place[data-type="service"] svg')).not.toBeNull();
  });

  it('keeps the position marker out of the accessibility tree and the tab order', () => {
    render(mapElement());
    const map = currentMap();

    fireEvent.click(control('Locate me'));
    answerLocate(37.03, 22.11);

    const element = positionPins(map)[0].getElement();
    expect(element?.querySelector('.map-you')).toHaveAttribute('aria-hidden', 'true');
    expect(element).not.toHaveAttribute('tabindex');
    expect(element).not.toHaveAttribute('role');
    expect(element).not.toHaveAttribute('title');
    expect(element).not.toHaveClass('leaflet-interactive');
  });
});

// FGM-06: the permission-denied banner (role="alert") stayed until the next press of Locate me.
describe('LeafletMap location message (FGM-06)', () => {
  it('shows the message when the permission is denied and when the browser has no geolocation', () => {
    render(mapElement());

    fireEvent.click(control('Locate me'));
    denyLocate();
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');

    fireEvent.click(control('Locate me'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    Reflect.deleteProperty(navigator, 'geolocation');
    fireEvent.click(control('Locate me'));
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  });

  it('can be dismissed with its own button, and focus goes back to Locate me', () => {
    const { container } = render(mapElement(13, greekLabels));
    fireEvent.click(control('Locate me'));
    denyLocate();
    const banner = container.querySelector<HTMLElement>('.map-card__error');
    expect(banner).not.toBeNull();

    // The button sits next to the message, outside the live region, and is named in the page's language.
    expect(within(screen.getByRole('alert')).queryByRole('button')).toBeNull();
    fireEvent.click(within(banner as HTMLElement).getByRole('button', { name: 'Κλείσιμο' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelector('.map-card__error')).toBeNull();
    expect(control('Locate me')).toHaveFocus();
  });

  it('does not bring a dismissed message back before the next failed answer', () => {
    const { container } = render(mapElement());
    fireEvent.click(control('Locate me'));
    denyLocate();
    fireEvent.click(within(container.querySelector<HTMLElement>('.map-card__error') as HTMLElement).getByRole('button', { name: 'Close' }));

    fireEvent.click(control('Locate me'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    denyLocate();
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  });
});

// FGM-07: Leaflet animates zooms, popups, pins and the glide after a drag by default, for everyone.
describe('LeafletMap animations follow the motion gate (FGM-07)', () => {
  const animations = ['zoomAnimation', 'fadeAnimation', 'markerZoomAnimation', 'inertia'] as const;

  it.each([[undefined], ['reduce']])('builds the map without Leaflet animations while motion is not armed (data-motion=%s)', (motion) => {
    if (motion) document.documentElement.setAttribute('data-motion', motion);
    render(mapElement());

    const { options } = currentMap();
    expect(animations.map((name) => options[name])).toEqual([false, false, false, false]);
  });

  it('builds the map with Leaflet animations while motion is armed (data-motion="full")', () => {
    document.documentElement.setAttribute('data-motion', 'full');
    render(mapElement());

    const { options } = currentMap();
    expect(animations.map((name) => options[name])).toEqual([true, true, true, true]);
  });

  it('jumps to the position and to the fitted markers without motion, and lets Leaflet animate with it', () => {
    render(mapElement());
    const map = currentMap();
    const setView = vi.spyOn(map, 'setView');
    const fitBounds = vi.spyOn(map, 'fitBounds');

    // Leaflet adds its own keys (pan, zoom) to the options it is given, so the animate flag is read on its own.
    const setViewAnimate = () => setView.mock.lastCall?.[2]?.animate;
    const fitBoundsAnimate = () => fitBounds.mock.lastCall?.[1]?.animate;

    fireEvent.click(control('Locate me'));
    answerLocate(37.03, 22.11);
    expect(setView).toHaveBeenLastCalledWith([37.03, 22.11], 15, expect.anything());
    expect(setViewAnimate()).toBe(false);
    fireEvent.click(control('Fit'));
    expect(fitBoundsAnimate()).toBe(false);

    // The preference is read at each move: it can change while the map is open.
    document.documentElement.setAttribute('data-motion', 'full');
    fireEvent.click(control('Locate me'));
    answerLocate(37.031, 22.112);
    expect(setView).toHaveBeenLastCalledWith([37.031, 22.112], 15, expect.anything());
    expect(setViewAnimate()).toBeUndefined();
    fireEvent.click(control('Fit'));
    expect(fitBoundsAnimate()).toBeUndefined();
  });
});

// FGM-07: Leaflet makes the map container focusable (tabindex 0), and a focusable element needs a role and a name.
// The label is required by the type, so a caller cannot leave the map nameless; InteractiveMap's wiring is pinned in
// interactive-map.test.tsx.
describe('LeafletMap accessible name (FGM-07)', () => {
  it('names the focusable map as a region', () => {
    render(mapElement());

    const region = screen.getByRole('region', { name: 'Interactive map' });
    expect(region).toHaveClass('leaflet-container');
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('names the map from the page language', () => {
    render(mapElement(13, { ...labels, mapRegion: 'Διαδραστικός χάρτης' }));

    expect(screen.getByRole('region', { name: 'Διαδραστικός χάρτης' })).toHaveClass('leaflet-container');
  });
});

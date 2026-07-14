import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const { dynamicLoaderCalls } = vi.hoisted(() => ({
  dynamicLoaderCalls: [] as Array<() => Promise<unknown>>,
}));

vi.mock('next/dynamic', () => ({
  default: (
    loader: () => Promise<{ default: React.ComponentType<any> }>,
    options?: { loading?: () => React.ReactElement | null }
  ) => {
    const DynamicComponent: React.FC<any> = (props) => {
      const [Loaded, setLoaded] = React.useState<React.ComponentType<any> | null>(null);
      React.useEffect(() => {
        let mounted = true;
        dynamicLoaderCalls.push(loader);
        loader().then((mod) => {
          if (mounted) {
            setLoaded(() => mod.default);
          }
        });
        return () => {
          mounted = false;
        };
      }, []);
      if (!Loaded) {
        return options?.loading ? options.loading() : null;
      }
      return React.createElement(Loaded, props);
    };
    return DynamicComponent;
  },
}));

vi.mock('@/components/DateRangePicker', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="date-picker">{isOpen ? 'open' : 'closed'}</div>
  ),
}));

const LeafletMapMock = vi.fn((props: Record<string, unknown>) => {
  void props;
  return <div data-testid="leaflet-map">interactive map</div>;
});
vi.mock('@/components/LeafletMap', () => ({
  default: LeafletMapMock,
}));

const globalWithReact = globalThis as typeof globalThis & { React?: typeof React };
if (!globalWithReact.React) {
  globalWithReact.React = React;
}

interface ObserverInstance {
  callback: (entries: IntersectionObserverEntry[]) => void;
  target?: Element;
}

const observerInstances: ObserverInstance[] = [];
class MockIntersectionObserver {
  callback: (entries: IntersectionObserverEntry[]) => void;
  constructor(callback: (entries: IntersectionObserverEntry[]) => void, _options?: IntersectionObserverInit) {
    this.callback = callback;
    void _options;
    observerInstances.push({ callback });
  }
  observe(target: Element) {
    const instance = observerInstances.find((obs) => obs.callback === this.callback);
    if (instance) {
      instance.target = target;
    }
  }
  disconnect() {
    const index = observerInstances.findIndex((obs) => obs.callback === this.callback);
    if (index >= 0) {
      observerInstances.splice(index, 1);
    }
  }
  unobserve() { }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

const originalGlobalIntersectionObserver = globalThis.IntersectionObserver;
const originalWindowIntersectionObserver = window.IntersectionObserver;

const defineIntersectionObserver = (
  target: typeof globalThis | Window,
  value: typeof IntersectionObserver | typeof MockIntersectionObserver | undefined
) => {
  if (value) {
    Object.defineProperty(target, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value,
    });
    return;
  }
  Reflect.deleteProperty(target, 'IntersectionObserver');
};

const triggerIntersection = (isIntersecting: boolean) => {
  observerInstances.forEach(({ callback, target }) => {
    const entry = { isIntersecting, target: target ?? document.createElement('div') } as IntersectionObserverEntry;
    callback([entry]);
  });
};

describe('Deferred loading guardrails', () => {
  beforeAll(() => {
    defineIntersectionObserver(globalThis, MockIntersectionObserver);
    defineIntersectionObserver(window, MockIntersectionObserver);
  });

  afterAll(() => {
    defineIntersectionObserver(globalThis, originalGlobalIntersectionObserver);
    defineIntersectionObserver(window, originalWindowIntersectionObserver);
  });

  beforeEach(() => {
    vi.resetModules();
    defineIntersectionObserver(globalThis, MockIntersectionObserver);
    defineIntersectionObserver(window, MockIntersectionObserver);
    dynamicLoaderCalls.length = 0;
    observerInstances.length = 0;
    LeafletMapMock.mockClear();
  });

  it('only loads the date picker after the user opens it', async () => {
    const BookingBar = (await import('@/components/SearchBar')).default;

    render(<BookingBar propertyName="Apartment" />);

    expect(dynamicLoaderCalls).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /arrival/i }));

    await waitFor(() => expect(dynamicLoaderCalls).toHaveLength(1));
    expect(await screen.findByTestId('date-picker')).toBeInTheDocument();
  }, 15000);

  it('defers interactive map rendering until it enters the viewport', async () => {
    const InteractiveMap = (await import('@/components/InteractiveMap')).default;

    render(<InteractiveMap locale="en" markers={[]} />);

    // Matches either dictionary value "The interactive map will load here..." 
    // or fallback "Interactive map loads once it is in view..."
    expect(screen.getByText(/interactive map.*load/i)).toBeInTheDocument();
    expect(dynamicLoaderCalls).toHaveLength(0);
    expect(screen.queryByTestId('leaflet-map')).not.toBeInTheDocument();

    // ensure observer attached
    await waitFor(() => expect(observerInstances.length).toBeGreaterThan(0));
    await act(async () => {
      triggerIntersection(true);
    });

    await waitFor(() => {
      expect(dynamicLoaderCalls).toHaveLength(1);
      expect(LeafletMapMock).toHaveBeenCalled();
    });

    expect(await screen.findByTestId('leaflet-map')).toBeInTheDocument();
  });

  it('passes Greek labels to the Leaflet map controls and popups', async () => {
    const InteractiveMap = (await import('@/components/InteractiveMap')).default;
    const user = userEvent.setup();

    render(<InteractiveMap locale="el" markers={[]} activation="intent" />);
    await user.click(screen.getByRole('button', { name: /φόρτωση χάρτη/i }));

    await waitFor(() => expect(LeafletMapMock).toHaveBeenCalled());

    const [props] = LeafletMapMock.mock.calls[LeafletMapMock.mock.calls.length - 1]!;
    const mapProps = props as {
      labels?: { directions?: string; locateMe?: string; clearRoute?: string };
      travelPrompt?: string;
    };
    expect(mapProps.labels).toMatchObject({
      directions: 'Οδηγίες',
      locateMe: 'Εντοπισμός θέσης',
      locationUnavailable: 'Η τοποθεσία σας δεν είναι διαθέσιμη. Ελέγξτε την άδεια τοποθεσίας του browser και δοκιμάστε ξανά.',
      clearRoute: 'Εκκαθάριση διαδρομής',
    });
    expect(mapProps.travelPrompt).toBe('Πατήστε έναν δείκτη για να υπολογίσουμε τον χρόνο διαδρομής.');
  });
});

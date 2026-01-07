import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const dynamicLoaderCalls: Array<() => Promise<unknown>> = [];
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

const LeafletMapMock = vi.fn(() => <div data-testid="leaflet-map">interactive map</div>);
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

const globalWithIO = globalThis as typeof globalThis & { IntersectionObserver?: any };
if (!globalWithIO.IntersectionObserver) {
  globalWithIO.IntersectionObserver = MockIntersectionObserver;
}

const triggerIntersection = (isIntersecting: boolean) => {
  observerInstances.forEach(({ callback, target }) => {
    const entry = { isIntersecting, target: target ?? document.createElement('div') } as IntersectionObserverEntry;
    callback([entry]);
  });
};

describe('Deferred loading guardrails', () => {
  beforeEach(() => {
    dynamicLoaderCalls.length = 0;
    observerInstances.length = 0;
    LeafletMapMock.mockClear();
  });

  it('only loads the date picker after the user opens it', async () => {
    const BookingBar = (await import('@/components/SearchBar')).default;
    const user = userEvent.setup();

    render(<BookingBar propertyName="Apartment" />);

    expect(dynamicLoaderCalls).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /arrival/i }));

    await waitFor(() => expect(dynamicLoaderCalls).toHaveLength(1));
    expect(await screen.findByTestId('date-picker')).toBeInTheDocument();
  });

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
});

import { act, render, waitFor } from '@testing-library/react';
import WebVitalsReporter from './WebVitalsReporter';

type MetricCallback = (metric: {
  name: 'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB';
  value: number;
  id: string;
}) => void;

const mocks = vi.hoisted(() => ({
  callbacks: {} as Partial<Record<'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB', MetricCallback>>,
  internalPost: vi.fn(),
}));

vi.mock('web-vitals', () => ({
  onCLS: (callback: MetricCallback) => { mocks.callbacks.CLS = callback; },
  onFID: (callback: MetricCallback) => { mocks.callbacks.FID = callback; },
  onLCP: (callback: MetricCallback) => { mocks.callbacks.LCP = callback; },
  onINP: (callback: MetricCallback) => { mocks.callbacks.INP = callback; },
  onTTFB: (callback: MetricCallback) => { mocks.callbacks.TTFB = callback; },
}));

vi.mock('@/lib/internalFetch', () => ({
  internalPost: mocks.internalPost,
}));

describe('WebVitalsReporter telemetry', () => {
  const originalFlag = process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY;
  const originalSendBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon');

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY = 'true';
    mocks.internalPost.mockReset().mockResolvedValue({ recorded: true });
    for (const key of Object.keys(mocks.callbacks)) delete mocks.callbacks[key as keyof typeof mocks.callbacks];
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY;
    else process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY = originalFlag;
    if (originalSendBeacon) Object.defineProperty(navigator, 'sendBeacon', originalSendBeacon);
    else Reflect.deleteProperty(navigator, 'sendBeacon');
  });

  it('queues exactly one beacon for one metric callback by default', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    render(<WebVitalsReporter />);
    await waitFor(() => expect(mocks.callbacks.LCP).toBeTypeOf('function'));

    act(() => mocks.callbacks.LCP?.({ name: 'LCP', value: 1_234, id: 'lcp-1' }));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith('/api/vitals', expect.any(Blob));
    expect(mocks.internalPost).not.toHaveBeenCalled();
  });

  it('falls back once when the browser cannot queue the beacon', async () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn().mockReturnValue(false) });
    render(<WebVitalsReporter />);
    await waitFor(() => expect(mocks.callbacks.CLS).toBeTypeOf('function'));

    act(() => mocks.callbacks.CLS?.({ name: 'CLS', value: 0.05, id: 'cls-1' }));

    expect(mocks.internalPost).toHaveBeenCalledTimes(1);
    expect(mocks.internalPost).toHaveBeenCalledWith('/api/vitals', {
      name: 'CLS',
      value: 0.05,
      id: 'cls-1',
      path: '/',
    });
  });

  it('honors an explicit telemetry opt-out', async () => {
    process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY = 'false';
    const sendBeacon = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon });
    render(<WebVitalsReporter />);
    await waitFor(() => expect(mocks.callbacks.TTFB).toBeTypeOf('function'));

    act(() => mocks.callbacks.TTFB?.({ name: 'TTFB', value: 250, id: 'ttfb-1' }));

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(mocks.internalPost).not.toHaveBeenCalled();
  });
});

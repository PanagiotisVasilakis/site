import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getTableMetrics: vi.fn(),
  getFailedProfiles: vi.fn(() => []),
  getOSRMClient: vi.fn(),
}));

vi.mock('@/lib/osrmClient', () => ({
  getOSRMClient: mocks.getOSRMClient,
}));

import { useTravelMetrics } from '@/hooks/useTravelMetrics';

describe('useTravelMetrics request ordering', () => {
  const origin: [number, number] = [22.1, 37.0];
  const markers = [{ id: 'museum', coordinates: [22.2, 37.1] as [number, number] }];
  const modes: Array<'driving'> = ['driving'];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFailedProfiles.mockReturnValue([]);
    mocks.getOSRMClient.mockReturnValue({
      getTableMetrics: mocks.getTableMetrics,
      getFailedProfiles: mocks.getFailedProfiles,
    });
  });

  it('ignores a slower response from an older request', async () => {
    let resolveFirst: ((value: Array<{ distance: number; duration: number }>) => void) | undefined;
    let resolveSecond: ((value: Array<{ distance: number; duration: number }>) => void) | undefined;
    mocks.getTableMetrics
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve; }));

    const { result } = renderHook(() => useTravelMetrics({
      origin,
      markers,
      modes,
      debounceMs: 60_000,
      refreshMinutes: 0,
    }));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refetch();
      second = result.current.refetch();
    });
    await act(async () => {
      resolveSecond?.([{ distance: 200, duration: 20 }]);
      await second;
    });
    expect(result.current.data.museum?.driving?.distance).toBe(200);

    await act(async () => {
      resolveFirst?.([{ distance: 100, duration: 10 }]);
      await first;
    });
    expect(result.current.data.museum?.driving?.distance).toBe(200);
  });

  it('clears stale metrics when the hook is disabled', async () => {
    mocks.getTableMetrics.mockResolvedValue([{ distance: 200, duration: 20 }]);
    const { result, rerender } = renderHook(({ enabled }) => useTravelMetrics({
      origin,
      markers,
      modes,
      debounceMs: 60_000,
      refreshMinutes: 0,
      enabled,
    }), { initialProps: { enabled: true } });

    await act(async () => { await result.current.refetch(); });
    expect(result.current.data.museum).toBeDefined();
    rerender({ enabled: false });
    await waitFor(() => expect(result.current.data).toEqual({}));
  });
});

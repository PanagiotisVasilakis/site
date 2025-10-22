import { GUEST_DATASET_KEYS, type GuestDatasetKey, type GuestDatasetSnapshot, getGuestDatasetSnapshot } from '@/lib/guestDatasetVersion';

export type GuestDataCacheEntry<T> = {
  snapshot: GuestDatasetSnapshot;
  value: T;
  fetchedAt: number;
  size: number | null;
};

export type GuestDataCacheMetrics = {
  hits: number;
  misses: number;
  invalidations: number;
  entries: Record<GuestDatasetKey, {
    cached: boolean;
    version: string | null;
    rowCount: number | null;
    latestChange: string | null;
    fetchedAt: number | null;
    size: number | null;
    error?: string;
  }>;
};

type SnapshotResolver = () => Promise<GuestDatasetSnapshot>;

export type GuestDataCacheConfig = Partial<Record<GuestDatasetKey, SnapshotResolver>>;

export class GuestDataCache {
  private entries = new Map<GuestDatasetKey, GuestDataCacheEntry<unknown>>();
  private pendingLoads = new Map<GuestDatasetKey, Promise<GuestDataCacheEntry<unknown>>>();
  private hits = 0;
  private misses = 0;
  private invalidations = 0;
  private generations = new Map<GuestDatasetKey, number>();

  constructor(private resolvers: Record<GuestDatasetKey, SnapshotResolver>) {}

  public async get<T>(key: GuestDatasetKey, loader: () => Promise<T>): Promise<T> {
    const snapshot = await this.resolvers[key]();
    const existing = this.entries.get(key) as GuestDataCacheEntry<T> | undefined;
    if (existing && existing.snapshot.version === snapshot.version) {
      this.hits += 1;
      return existing.value;
    }

    const pending = this.pendingLoads.get(key) as Promise<GuestDataCacheEntry<T>> | undefined;
    if (pending) {
      this.hits += 1; // treat piggybacking on in-flight load as a hit
      const entry = await pending;
      return entry.value;
    }

    this.misses += 1;
    const generation = this.generations.get(key) ?? 0;
    const loadPromise = (async () => {
      try {
        const value = await loader();
        const entry: GuestDataCacheEntry<T> = {
          snapshot,
          value,
          fetchedAt: Date.now(),
          size: Array.isArray(value) ? value.length : null,
        };
        const currentGeneration = this.generations.get(key) ?? 0;
        if (currentGeneration === generation) {
          this.entries.set(key, entry);
        }
        return entry;
      } finally {
        this.pendingLoads.delete(key);
      }
    })();

    this.pendingLoads.set(key, loadPromise as Promise<GuestDataCacheEntry<unknown>>);
    const entry = await loadPromise;
    return entry.value;
  }

  public invalidate(keys?: GuestDatasetKey[]): void {
    const targets = keys ?? [...GUEST_DATASET_KEYS];
    for (const rawKey of targets) {
      const key = rawKey as GuestDatasetKey;
      const nextGeneration = (this.generations.get(key) ?? 0) + 1;
      this.generations.set(key, nextGeneration);
      this.entries.delete(key);
      this.pendingLoads.delete(key);
    }
    if (targets.length > 0) {
      this.invalidations += 1;
    }
  }

  public metrics(): GuestDataCacheMetrics {
    const entries = Object.fromEntries(
      GUEST_DATASET_KEYS.map((key) => {
        const entry = this.entries.get(key);
        if (!entry) {
          return [key, {
            cached: false,
            version: null,
            rowCount: null,
            latestChange: null,
            fetchedAt: null,
            size: null,
          }];
        }
        return [key, {
          cached: true,
          version: entry.snapshot.version,
          rowCount: entry.snapshot.rowCount,
          latestChange: entry.snapshot.latestChange,
          fetchedAt: entry.fetchedAt,
          size: entry.size,
          error: entry.snapshot.error,
        }];
      })
    ) as GuestDataCacheMetrics['entries'];

    return {
      hits: this.hits,
      misses: this.misses,
      invalidations: this.invalidations,
      entries,
    };
  }
}

export function createGuestDataCache(config?: GuestDataCacheConfig): GuestDataCache {
  const resolvers: Record<GuestDatasetKey, SnapshotResolver> = Object.fromEntries(
    GUEST_DATASET_KEYS.map((key) => [key, config?.[key] ?? (() => getGuestDatasetSnapshot(key))])
  ) as Record<GuestDatasetKey, SnapshotResolver>;

  return new GuestDataCache(resolvers);
}

export const guestDataCache = createGuestDataCache();

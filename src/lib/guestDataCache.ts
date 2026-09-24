import { GUEST_DATASET_KEYS, type GuestDatasetKey, type GuestDatasetSnapshot, getGuestDatasetSnapshot } from '@/lib/guestDatasetVersion';

type GuestDataCacheEntry<T> = {
  snapshot: GuestDatasetSnapshot;
  value: T;
};

type SnapshotResolver = () => Promise<GuestDatasetSnapshot>;

class GuestDataCache {
  private entries = new Map<GuestDatasetKey, GuestDataCacheEntry<unknown>>();
  private pendingLoads = new Map<GuestDatasetKey, Promise<GuestDataCacheEntry<unknown>>>();
  private generations = new Map<GuestDatasetKey, number>();

  constructor(private resolvers: Record<GuestDatasetKey, SnapshotResolver>) {}

  public async get<T>(key: GuestDatasetKey, loader: () => Promise<T>): Promise<T> {
    const snapshot = await this.resolvers[key]();
    const existing = this.entries.get(key) as GuestDataCacheEntry<T> | undefined;
    if (existing && existing.snapshot.version === snapshot.version) {
      return existing.value;
    }

    const pending = this.pendingLoads.get(key) as Promise<GuestDataCacheEntry<T>> | undefined;
    if (pending) {
      const entry = await pending;
      return entry.value;
    }

    const generation = this.generations.get(key) ?? 0;
    const loadPromise = (async () => {
      try {
        const value = await loader();
        const entry: GuestDataCacheEntry<T> = { snapshot, value };
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
  }
}

function createGuestDataCache(): GuestDataCache {
  const resolvers = Object.fromEntries(
    GUEST_DATASET_KEYS.map((key) => [key, () => getGuestDatasetSnapshot(key)])
  ) as Record<GuestDatasetKey, SnapshotResolver>;

  return new GuestDataCache(resolvers);
}

export const guestDataCache = createGuestDataCache();

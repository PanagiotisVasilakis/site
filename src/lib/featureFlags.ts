import { logger } from '@/lib/logger-enterprise';

export type FeatureFlags = {
  portalEnabled: boolean;
  checkinEnabled: boolean;
};

const SETTING_KEY = 'feature_flags';
const DEVELOPMENT_DEFAULTS: FeatureFlags = { portalEnabled: true, checkinEnabled: true };
const PRODUCTION_DEFAULTS: FeatureFlags = { portalEnabled: false, checkinEnabled: false };

let cache: FeatureFlags | null = null;

function defaults(): FeatureFlags {
  return process.env.NODE_ENV === 'production'
    ? { ...PRODUCTION_DEFAULTS }
    : { ...DEVELOPMENT_DEFAULTS };
}

function parseFlags(value: unknown): FeatureFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults();
  const record = value as Record<string, unknown>;
  const fallback = defaults();
  return {
    portalEnabled: typeof record.portalEnabled === 'boolean' ? record.portalEnabled : fallback.portalEnabled,
    checkinEnabled: typeof record.checkinEnabled === 'boolean' ? record.checkinEnabled : fallback.checkinEnabled,
  };
}

/**
 * Synchronous snapshot for non-request compatibility only. Runtime authorization
 * paths must use getFeatureFlagsAsync so every process observes the shared DB value.
 */
export function getFeatureFlags(): FeatureFlags {
  return { ...(cache ?? defaults()) };
}

export async function getFeatureFlagsAsync(): Promise<FeatureFlags> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.operationalSetting.findUnique({ where: { key: SETTING_KEY } });
    cache = row ? parseFlags(row.value) : defaults();
  } catch (error) {
    cache = defaults();
    logger.error('Failed to read feature flags; using fail-closed production defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { ...cache };
}

export async function setFeatureFlags(partial: Partial<FeatureFlags>): Promise<FeatureFlags> {
  const { prisma } = await import('@/lib/prisma');
  const current = await getFeatureFlagsAsync();
  const merged = parseFlags({ ...current, ...partial });
  await prisma.operationalSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: merged },
    update: { value: merged },
  });
  cache = merged;
  return { ...merged };
}

export function resetFeatureFlags(): void {
  cache = null;
}

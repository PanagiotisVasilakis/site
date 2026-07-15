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
  const patch = Object.fromEntries(Object.entries(partial).filter(([, value]) => typeof value === 'boolean'));
  if (Object.keys(patch).length === 0) return getFeatureFlagsAsync();

  const serialized = JSON.stringify(patch);
  const rows = await prisma.$queryRaw<Array<{ value: unknown }>>`
    INSERT INTO "operational_settings" ("key", "value", "updated_at")
    VALUES (${SETTING_KEY}, ${serialized}::jsonb, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "value" = "operational_settings"."value" || EXCLUDED."value",
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING "value"
  `;
  cache = parseFlags(rows[0]?.value);
  return { ...cache };
}

export function resetFeatureFlags(): void {
  cache = null;
}

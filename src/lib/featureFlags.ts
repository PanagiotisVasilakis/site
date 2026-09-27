import { logger } from '@/lib/logger-enterprise';

export type FeatureFlags = {
  portalEnabled: boolean;
  checkinEnabled: boolean;
};

const SETTING_KEY = 'feature_flags';
const DEVELOPMENT_DEFAULTS: FeatureFlags = { portalEnabled: true, checkinEnabled: true };
const PRODUCTION_DEFAULTS: FeatureFlags = { portalEnabled: false, checkinEnabled: false };

function defaults(): FeatureFlags {
  return process.env.NODE_ENV === 'production'
    ? { ...PRODUCTION_DEFAULTS }
    : { ...DEVELOPMENT_DEFAULTS };
}

// Check-in pages and APIs need a guest session, which only the portal issues,
// so check-in is effective only while the portal is enabled. The stored
// check-in value is kept and applies again when the portal is re-enabled.
function effective(flags: FeatureFlags): FeatureFlags {
  return { portalEnabled: flags.portalEnabled, checkinEnabled: flags.portalEnabled && flags.checkinEnabled };
}

function parseFlags(value: unknown): FeatureFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return effective(defaults());
  const record = value as Record<string, unknown>;
  const fallback = defaults();
  return effective({
    portalEnabled: typeof record.portalEnabled === 'boolean' ? record.portalEnabled : fallback.portalEnabled,
    checkinEnabled: typeof record.checkinEnabled === 'boolean' ? record.checkinEnabled : fallback.checkinEnabled,
  });
}

export async function getFeatureFlagsAsync(): Promise<FeatureFlags> {
  try {
    const { prisma } = await import('@/lib/prisma');
    const row = await prisma.operationalSetting.findUnique({ where: { key: SETTING_KEY } });
    return row ? parseFlags(row.value) : defaults();
  } catch (error) {
    logger.error('Failed to read feature flags; using environment defaults (disabled in production)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return defaults();
  }
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
  return parseFlags(rows[0]?.value);
}

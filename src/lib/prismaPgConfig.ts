import type { PrismaPg } from '@prisma/adapter-pg';

export type PrismaPgConfig = ConstructorParameters<typeof PrismaPg>[0];
export type PrismaPgOptions = NonNullable<ConstructorParameters<typeof PrismaPg>[1]>;

const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;
// Keep database work bounded below the generic 30s API deadline. PostgreSQL
// cancels a statement/lock server-side, so a timed-out request cannot leave a
// mutation running indefinitely in the background.
const DEFAULT_STATEMENT_TIMEOUT_MS = 20_000;
const DEFAULT_QUERY_TIMEOUT_MS = 25_000;
const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
const PRISMA_URL_PARAMS = [
  'connection_limit',
  'pool_timeout',
  'connect_timeout',
  'max_idle_connection_lifetime',
  'max_connection_lifetime',
  'statement_timeout',
  'query_timeout',
  'lock_timeout',
  'schema',
] as const;

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildPrismaPgAdapterArgs(connectionString: string): {
  config: PrismaPgConfig;
  options?: PrismaPgOptions;
} {
  const config: PrismaPgConfig = {
    connectionString,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    statement_timeout: DEFAULT_STATEMENT_TIMEOUT_MS,
    query_timeout: DEFAULT_QUERY_TIMEOUT_MS,
    lock_timeout: DEFAULT_LOCK_TIMEOUT_MS,
  };

  try {
    const url = new URL(connectionString);
    const connectionLimit = parsePositiveInteger(url.searchParams.get('connection_limit'));
    const connectTimeout = parsePositiveInteger(url.searchParams.get('connect_timeout'));
    const poolTimeout = parsePositiveInteger(url.searchParams.get('pool_timeout'));
    const maxIdleLifetime = parsePositiveInteger(url.searchParams.get('max_idle_connection_lifetime'));
    const maxConnectionLifetime = parsePositiveInteger(url.searchParams.get('max_connection_lifetime'));
    const statementTimeout = parsePositiveInteger(url.searchParams.get('statement_timeout'));
    const queryTimeout = parsePositiveInteger(url.searchParams.get('query_timeout'));
    const lockTimeout = parsePositiveInteger(url.searchParams.get('lock_timeout'));
    const schema = url.searchParams.get('schema') || undefined;

    if (connectionLimit) config.max = connectionLimit;

    const timeoutSeconds = connectTimeout ?? poolTimeout;
    if (timeoutSeconds) config.connectionTimeoutMillis = timeoutSeconds * 1_000;
    if (maxIdleLifetime) config.idleTimeoutMillis = maxIdleLifetime * 1_000;
    if (maxConnectionLifetime) config.maxLifetimeSeconds = maxConnectionLifetime;
    if (statementTimeout) config.statement_timeout = statementTimeout;
    if (queryTimeout) config.query_timeout = queryTimeout;
    if (lockTimeout) config.lock_timeout = lockTimeout;

    for (const param of PRISMA_URL_PARAMS) {
      url.searchParams.delete(param);
    }
    config.connectionString = url.toString();

    return {
      config,
      options: schema ? { schema } : undefined,
    };
  } catch {
    return { config };
  }
}

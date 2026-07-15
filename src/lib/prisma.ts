import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/lib/logger-enterprise';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import { metrics } from '@/lib/metrics-collector';
import { buildPrismaPgAdapterArgs } from '@/lib/prismaPgConfig';

type ExtendedGlobal = typeof globalThis & {
  __prisma__?: PrismaClient;
  __prismaShutdownHooksRegistered__?: boolean;
};

type PrismaClientWithEvents = PrismaClient & {
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): void;
  $on(event: 'error', callback: (event: Prisma.LogEvent) => void): void;
};

const globalThisWithPrisma = globalThis as ExtendedGlobal;
let prismaInitLogged = false;
const logPrismaLifecycle = process.env.PRISMA_LOG_LIFECYCLE === '1';

function assertDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error('DATABASE_URL is not configured for Prisma client');
    throw new Error('DATABASE_URL env var missing');
  }
  return databaseUrl;
}

function createPrismaPgAdapter(connectionString: string): PrismaPg {
  const { config, options } = buildPrismaPgAdapterArgs(connectionString);
  return options ? new PrismaPg(config, options) : new PrismaPg(config);
}

/**
 * Adds distributed tracing and metrics instrumentation to Prisma client.
 * Uses query events to track performance and errors.
 */
function addPrismaInstrumentation(client: PrismaClient): void {
  const clientWithEvents = client as PrismaClientWithEvents;
  
  // Track query performance
  clientWithEvents.$on('query', (e: Prisma.QueryEvent) => {
    const duration = e.duration;
    
    // Extract model and action from query (best effort)
    const query = e.query.toLowerCase();
    let action = 'unknown';
    let model = 'unknown';
    
    if (query.startsWith('select')) action = 'findMany';
    else if (query.startsWith('insert')) action = 'create';
    else if (query.startsWith('update')) action = 'update';
    else if (query.startsWith('delete')) action = 'delete';
    
    // Try to extract table/model name
    const tableMatch = query.match(/\b(?:from|into|update)\s+"?(\w+)"?/i);
    if (tableMatch) {
      model = tableMatch[1];
    }
    
    // Record metrics
    metrics.timer('db.query.duration', duration, {
      model,
      action,
    });
    
    metrics.counter('db.query.total', 1, {
      model,
      action,
      status: 'success',
    });
    
    // Log slow queries (>1000ms)
    if (duration > 1000) {
      logger.warn('Slow database query detected', {
        model,
        action,
        duration,
        query: e.query.slice(0, 200), // Truncate long queries
      });
      
      // Start and finish a span for slow queries
      const span = tracer.startSpan('db.query.slow', undefined, {
        'db.system': 'postgresql',
        'db.operation': action,
        'db.model': model,
        'db.duration': duration,
      });
      tracer.finishSpan(span);
    }
  });
  
  // Track errors
  clientWithEvents.$on('error', (e: Prisma.LogEvent) => {
    metrics.counter('db.query.errors', 1);
    
    logger.error('Prisma error', {
      message: e.message,
      target: e.target,
    });
    
    // Create error span
    const span = tracer.startSpan('db.error', undefined, {
      'db.system': 'postgresql',
      'error.message': e.message,
    });
    tracer.finishSpan(span, SpanStatus.ERROR);
  });
}

/**
 * Get recommended connection pool size based on environment
 * PostgreSQL connection pooling is configured via DATABASE_URL query params:
 * - connection_limit: Max connections in the pool
 * - pool_timeout: Seconds to wait for available connection
 * 
 * Example: postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20
 * 
 * Recommended values:
 * - Development: 5-10 connections
 * - Production (serverless): 5-10 per instance
 * - Production (long-running): 20-50 connections
 */
function getRecommendedPoolConfig(): { connectionLimit: number; poolTimeout: number } {
  const env = process.env.NODE_ENV;
  
  if (env === 'production') {
    // For serverless (Vercel), keep pool small per instance
    return { connectionLimit: 10, poolTimeout: 20 };
  }
  
  // Development: a smaller pool is sufficient.
  return { connectionLimit: 5, poolTimeout: 10 };
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = assertDatabaseUrl();
  
  // Log recommended pool config (actual config is in DATABASE_URL)
  const poolConfig = getRecommendedPoolConfig();
  if (!prismaInitLogged && logPrismaLifecycle) {
      logger.info('Prisma client initialization', {
        environment: process.env.NODE_ENV,
        recommendedConnectionLimit: poolConfig.connectionLimit,
        recommendedPoolTimeout: poolConfig.poolTimeout,
        note: 'Configure via DATABASE_URL: ?connection_limit=N&pool_timeout=N',
      });
      prismaInitLogged = true;
    }
  
  const client = new PrismaClient({
    adapter: createPrismaPgAdapter(databaseUrl),
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'query' },
    ],
  });

  // Add instrumentation for distributed tracing and metrics
  addPrismaInstrumentation(client);

  return client;
}

// Only initialize the Prisma client if a DATABASE_URL is present.
// This avoids throwing during Next.js build-time data collection when env vars are not available.
if (!globalThisWithPrisma.__prisma__) {
  if (process.env.DATABASE_URL) {
    globalThisWithPrisma.__prisma__ = createPrismaClient();
  } else {
    // Leave undefined during build/time when no DATABASE_URL is configured.
    globalThisWithPrisma.__prisma__ = undefined as unknown as PrismaClient;
  }
}

function getActivePrismaClient(): PrismaClient {
  const client = globalThisWithPrisma.__prisma__;
  if (!client || typeof client.$disconnect !== 'function') {
    const hint = process.env.NODE_ENV === 'production'
      ? 'DATABASE_URL must be configured on the server.'
      : 'Set DATABASE_URL in your environment or run `docker-compose up pg` for the development database.';
    logger.error('Prisma client requested but no DATABASE_URL is configured', { hint });
    throw new Error(`Prisma client is not initialized. ${hint}`);
  }
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getActivePrismaClient();
    const value = Reflect.get(client as unknown as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = getActivePrismaClient();
    Reflect.set(client as unknown as object, prop, value);
    return true;
  },
});

function registerPrismaShutdownHooks(client: PrismaClient): void {
  if (typeof process === 'undefined') {
    return;
  }

  const clientWithEvents = client as PrismaClientWithEvents;

  const longRunningHints =
    Boolean(process.env.NEXT_RUNTIME) ||
    process.argv.some((arg) => /next|turbo|node-dev|tsx-dev|--watch/.test(arg));

  // Added check for command line execution to avoid hanging processes
  const isCommandLineExecution = process.argv.some((arg) => 
    /tsx|-e|--eval/.test(arg)
  ) && !longRunningHints;

  const autoDisconnectEnv = process.env.PRISMA_AUTO_DISCONNECT;
  const shouldAutoDisconnectOnIdle =
    autoDisconnectEnv === 'true'
      ? true
      : autoDisconnectEnv === 'false'
        ? false
        : !longRunningHints;

  const idleDelayMsRaw = process.env.PRISMA_IDLE_DISCONNECT_MS;
  const parsedIdleDelay = idleDelayMsRaw ? Number.parseInt(idleDelayMsRaw, 10) : Number.NaN;
  const idleDelayMs = Number.isFinite(parsedIdleDelay) && parsedIdleDelay >= 0 ? parsedIdleDelay : 200;

  let disconnecting = false;
  let cleanupTimer: NodeJS.Timeout | undefined;
  let observedActivity = false;

  const cleanup = async (trigger: string): Promise<void> => {
    if (disconnecting) return;
    disconnecting = true;

    try {
      if (logPrismaLifecycle) {
        logger.info('Disconnecting Prisma client', { trigger });
      }
      if (client && typeof client.$disconnect === 'function') {
        await client.$disconnect();
      } else {
        logger.debug('Prisma client not initialized; skipping disconnect', { trigger });
      }
    } catch (disconnectError) {
      logger.error('Failed to disconnect Prisma client cleanly', { trigger }, disconnectError);
    }

    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimer = undefined;
    }
  };

  const scheduleIdleDisconnect = () => {
    if (!shouldAutoDisconnectOnIdle) return;
    if (disconnecting) return;

    if (cleanupTimer) {
      cleanupTimer.refresh?.();
      return;
    }

    cleanupTimer = setTimeout(() => {
      cleanupTimer = undefined;
      void cleanup('idle');
    }, idleDelayMs);

    cleanupTimer.unref?.();
  };

  if (shouldAutoDisconnectOnIdle) {
    const markActivity = () => {
      if (!observedActivity) {
        observedActivity = true;
        logger.debug('Prisma query activity observed for auto-disconnect');
      }

      scheduleIdleDisconnect();
    };

    if (client && typeof clientWithEvents.$on === 'function') {
      clientWithEvents.$on('query', markActivity);
      clientWithEvents.$on('error', markActivity);
    }
  }

  // Only register process shutdown hooks if not in command line execution
  if (!isCommandLineExecution) {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    if (process.platform !== 'win32') {
      signals.push('SIGQUIT');
    }

    const exitCodes: Record<string, number> = {
      SIGINT: 130,
      SIGTERM: 143,
      SIGQUIT: 131,
    };

    process.once('beforeExit', () => {
      void cleanup('beforeExit');
    });

    for (const signal of signals) {
      process.once(signal, () => {
        void cleanup(signal).finally(() => {
          const exitCode = exitCodes[signal] ?? 0;
          process.exit(exitCode);
        });
      });
    }
  }
}

if (!globalThisWithPrisma.__prismaShutdownHooksRegistered__) {
  // Only register shutdown hooks when a real Prisma client instance is present.
  // During build/generate steps DATABASE_URL may be missing and prisma is left undefined.
  // Guarding avoids attempting to disconnect a non-initialized client on SIGINT during build.
  const possiblePrisma = globalThisWithPrisma.__prisma__ as unknown;
  const hasClient = Boolean(possiblePrisma && typeof (possiblePrisma as { $disconnect?: unknown })?.$disconnect === 'function');
  if (hasClient) {
    registerPrismaShutdownHooks(prisma);
    globalThisWithPrisma.__prismaShutdownHooksRegistered__ = true;
  }
}

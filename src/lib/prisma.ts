import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/lib/logger-enterprise';
import { buildPrismaPgAdapterArgs } from '@/lib/prismaPgConfig';

type ExtendedGlobal = typeof globalThis & { __prisma__?: PrismaClient };

type PrismaClientWithEvents = PrismaClient & {
  $on(event: 'query', callback: (event: Prisma.QueryEvent) => void): void;
  $on(event: 'error', callback: (event: Prisma.LogEvent) => void): void;
};

const globalThisWithPrisma = globalThis as ExtendedGlobal;

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
 * Logs slow queries and Prisma error events.
 */
function addPrismaInstrumentation(client: PrismaClient): void {
  const clientWithEvents = client as PrismaClientWithEvents;
  
  // Track query performance
  clientWithEvents.$on('query', (e: Prisma.QueryEvent) => {
    const duration = e.duration;
    // Log slow queries (>1000ms)
    if (duration <= 1000) return;

    const query = e.query.toLowerCase();
    const action = query.trimStart().split(/\s+/, 1)[0];
    let model = 'unknown';

    // Try to extract table/model name
    const tableMatch = query.match(/\b(?:from|into|update)\s+"?(\w+)"?/i);
    if (tableMatch) {
      model = tableMatch[1];
    }
    
    logger.warn('Slow database query detected', {
      model,
      action,
      duration,
      query: e.query.slice(0, 200), // Truncate long queries
    });
  });
  
  // Track errors
  clientWithEvents.$on('error', (e: Prisma.LogEvent) => {
    logger.error('Prisma error', {
      message: e.message,
      target: e.target,
    });
  });
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = assertDatabaseUrl();
  
  const client = new PrismaClient({
    adapter: createPrismaPgAdapter(databaseUrl),
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'query' },
    ],
  });

  // Log slow queries and Prisma errors
  addPrismaInstrumentation(client);

  return client;
}

// Only initialize the Prisma client if a DATABASE_URL is present.
// This avoids throwing during Next.js build-time data collection when env vars are not available.
if (!globalThisWithPrisma.__prisma__) {
  if (process.env.DATABASE_URL) {
    globalThisWithPrisma.__prisma__ = createPrismaClient();
  }
}

function getActivePrismaClient(): PrismaClient {
  const client = globalThisWithPrisma.__prisma__;
  if (!client || typeof client.$disconnect !== 'function') {
    const hint = process.env.NODE_ENV === 'production'
      ? 'DATABASE_URL must be configured on the server.'
      : 'Set DATABASE_URL (npm run ensure-pepper writes the local one to .env.local; scripts run with tsx need it exported in the shell) and start the development database with `npm run db:start`.';
    logger.error('Prisma client requested but no DATABASE_URL is configured', { hint });
    throw new Error(`Prisma client is not initialized. ${hint}`);
  }
  return client;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getActivePrismaClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = getActivePrismaClient();
    Reflect.set(client, prop, value);
    return true;
  },
});

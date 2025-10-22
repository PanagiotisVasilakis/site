import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

type Primitive = string | number | boolean | null;

export class SmokeTestError extends Error {
  public readonly details?: Record<string, Primitive>;

  constructor(message: string, options?: { cause?: unknown; details?: Record<string, Primitive> }) {
    super(message, { cause: options?.cause });
    this.name = 'SmokeTestError';
    this.details = options?.details;
  }
}

export interface SmokeTestOptions {
  /**
   * Maximum amount of time (in milliseconds) each Prisma operation is allowed to take
   * before the smoke test aborts with a failure. Defaults to 5000 ms.
   */
  timeoutMs?: number;
  /**
   * Whether the optional model-level check should run. When true the script will call
   * `prisma.user.count()` to make sure that the generated client can access a concrete model.
   */
  verifyUserModel?: boolean;
}

export interface SmokeTestDependencies {
  env?: NodeJS.ProcessEnv;
  createPrismaClient?: () => PrismaClient;
  now?: () => number;
  logger?: Pick<typeof console, 'info' | 'error'>;
}

export interface SmokeTestMetrics {
  connectDurationMs: number;
  simpleQueryDurationMs: number;
  userCountDurationMs?: number;
  userCount?: number;
}

export interface SmokeTestResult {
  status: 'ok';
  metrics: SmokeTestMetrics;
}

export interface SmokeTestCliOptions extends SmokeTestOptions {
  helpRequested?: boolean;
  outputJson?: boolean;
  quiet?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, step: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new SmokeTestError(`Prisma smoke test step \"${step}\" timed out after ${timeoutMs} ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function runSmokeTest(
  options: SmokeTestOptions = {},
  dependencies: SmokeTestDependencies = {},
): Promise<SmokeTestResult> {
  const {
    env = process.env,
    createPrismaClient = () => new PrismaClient(),
    now = () => performance.now(),
    logger = console,
  } = dependencies;

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new SmokeTestError('DATABASE_URL is not set. Prisma smoke test cannot run.');
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const metrics: SmokeTestMetrics = {
    connectDurationMs: 0,
    simpleQueryDurationMs: 0,
  };

  const prisma = createPrismaClient();

  try {
    const connectStart = now();
    await withTimeout(prisma.$connect(), timeoutMs, 'connect');
    metrics.connectDurationMs = now() - connectStart;

    const simpleQueryStart = now();
    const simpleQueryResult = await withTimeout(prisma.$queryRaw`SELECT 1 AS ok`, timeoutMs, 'simple query');
    metrics.simpleQueryDurationMs = now() - simpleQueryStart;

    if (!Array.isArray(simpleQueryResult) || simpleQueryResult.length === 0) {
      throw new SmokeTestError('Simple connectivity query returned no rows.');
    }

    const [{ ok }] = simpleQueryResult as Array<{ ok: unknown }>;
    if (ok !== 1) {
      throw new SmokeTestError('Unexpected result payload from connectivity query.', {
        details: { received: typeof ok === 'object' ? JSON.stringify(ok) : (ok as Primitive) },
      });
    }

    if (options.verifyUserModel ?? true) {
      if (typeof prisma.user?.count !== 'function') {
        throw new SmokeTestError('Generated Prisma client does not expose `user.count()`; schema may be outdated.');
      }

      const userCountStart = now();
      metrics.userCount = await withTimeout(prisma.user.count(), timeoutMs, 'user count');
      metrics.userCountDurationMs = now() - userCountStart;
    }

    return {
      status: 'ok',
      metrics,
    };
  } catch (error) {
    if (error instanceof SmokeTestError) {
      throw error;
    }

    throw new SmokeTestError('Prisma smoke test failed', {
      cause: error,
    });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      logger.error?.('Failed to disconnect Prisma client cleanly after smoke test.', disconnectError);
    }
  }
}

export function parseCliArgs(argv: readonly string[]): SmokeTestCliOptions {
  const options: SmokeTestCliOptions = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    verifyUserModel: true,
    outputJson: false,
    quiet: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.helpRequested = true;
      return options;
    }

    if (arg === '--json') {
      options.outputJson = true;
      continue;
    }

    if (arg === '--quiet' || arg === '-q') {
      options.quiet = true;
      continue;
    }

    if (arg === '--no-verify-user') {
      options.verifyUserModel = false;
      continue;
    }

    if (arg.startsWith('--timeout=')) {
      const [, value] = arg.split('=', 2);
      const parsed = Number.parseInt(value ?? '', 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new SmokeTestError(`Invalid timeout value provided: ${value}`);
      }
      options.timeoutMs = parsed;
      continue;
    }

    if (arg === '--') {
      break;
    }

    if (arg.startsWith('--timeout')) {
      throw new SmokeTestError('Use --timeout=<milliseconds> to configure the timeout.');
    }

    throw new SmokeTestError(`Unknown argument: ${arg}`);
  }

  return options;
}

function formatHumanReadable(result: SmokeTestResult): string {
  const lines = [
    'Prisma smoke test succeeded.',
    `  Connection established in ${result.metrics.connectDurationMs.toFixed(2)} ms`,
    `  Connectivity query completed in ${result.metrics.simpleQueryDurationMs.toFixed(2)} ms`,
  ];

  if (typeof result.metrics.userCountDurationMs === 'number') {
    lines.push(`  User count resolved in ${result.metrics.userCountDurationMs.toFixed(2)} ms`);
  }

  if (typeof result.metrics.userCount === 'number') {
    lines.push(`  Total users: ${result.metrics.userCount}`);
  }

  return lines.join('\n');
}

function printHelp(): void {
  console.log(`Prisma smoke test helper\n\n` +
    `Usage: npm run prisma:smoketest [-- [options]]\n\n` +
    `Options:\n` +
    `  --help, -h           Show this help message.\n` +
    `  --json               Emit machine-readable JSON output.\n` +
    `  --quiet, -q          Suppress human-readable logs (errors still go to stderr).\n` +
    `  --timeout=<ms>       Override the default 5000ms per-step timeout.\n` +
    `  --no-verify-user     Skip the User model check (only runs the connectivity query).\n`);
}

async function runFromCli(): Promise<void> {
  const [, , ...argv] = process.argv;
  let options: SmokeTestCliOptions;

  try {
    options = parseCliArgs(argv);
  } catch (error) {
    if (error instanceof SmokeTestError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  if (options.helpRequested) {
    printHelp();
    return;
  }

  try {
    const result = await runSmokeTest(options);
    if (options.outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (!options.quiet) {
      console.log(formatHumanReadable(result));
    }
  } catch (error) {
    if (error instanceof SmokeTestError) {
      console.error(error.message);
      if (error.details) {
        console.error(JSON.stringify(error.details));
      }
      process.exitCode = 1;
      return;
    }

    console.error('Unexpected error during Prisma smoke test execution.', error);
    process.exitCode = 1;
  }
}

const isMainModule = typeof process.argv[1] === 'string' && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  runFromCli().catch((error) => {
    console.error('Fatal error running Prisma smoke test CLI.', error);
    process.exitCode = 1;
  });
}


#!/usr/bin/env tsx
/*
 * Executes `prisma migrate deploy` for production and staging environments
 * with resilient retry logic and timestamped logging. This script is intended for
 * deployment pipelines where migrations must succeed even if transient network
 * interruptions occur.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

import {
  extractLastAppliedMigration,
  formatTimestamp,
  prefixWithTimestamp,
  type MigrationStatus,
} from './utils/prisma-migrate.js';

const LOG_DIRECTORY = join(process.cwd(), 'logs');
const MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.PRISMA_MIGRATE_MAX_ATTEMPTS ?? '3', 10));
const INITIAL_BACKOFF_MS = Math.max(100, Number.parseInt(process.env.PRISMA_MIGRATE_INITIAL_BACKOFF_MS ?? '1000', 10));

interface EnvironmentConfig {
  readonly name: 'prod' | 'staging';
  readonly description: string;
  readonly connectionStringEnvVars: readonly string[];
  readonly buildRuntimeEnv: (connectionString: string) => Record<string, string>;
}

const ENVIRONMENTS: readonly EnvironmentConfig[] = [
  {
    name: 'prod',
    description: 'production',
    connectionStringEnvVars: ['PROD_DATABASE_URL', 'DATABASE_URL_PROD'],
    buildRuntimeEnv: (connectionString) => ({
      DATABASE_URL: connectionString,
      NODE_ENV: 'production',
    }),
  },
  {
    name: 'staging',
    description: 'staging',
    connectionStringEnvVars: ['STAGING_DATABASE_URL', 'DATABASE_URL_STAGING'],
    buildRuntimeEnv: (connectionString) => ({
      DATABASE_URL: connectionString,
      NODE_ENV: 'production',
    }),
  },
];

interface ExecutionResult {
  readonly environment: EnvironmentConfig;
  readonly logFile: string;
  readonly summary: MigrationStatus;
}

function ensureLogDirectoryExists(directory: string): void {
  mkdirSync(directory, { recursive: true });
}

function findConnectionString(envVars: readonly string[]): string | undefined {
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function writeLogLine(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`);
}

class TimestampedLogger {
  private readonly stdoutBuffer: string[] = [];
  private readonly stderrBuffer: string[] = [];

  constructor(private readonly logStream: NodeJS.WritableStream) {}

  public attach(process: ReturnType<typeof spawn>): void {
    process.stdout?.on('data', (chunk) => this.handleChunk(chunk, this.stdoutBuffer));
    process.stderr?.on('data', (chunk) => this.handleChunk(chunk, this.stderrBuffer));
  }

  public flush(): void {
    this.flushBuffer(this.stdoutBuffer, true);
    this.flushBuffer(this.stderrBuffer, true);
  }

  private handleChunk(chunk: unknown, buffer: string[]): void {
    const data = typeof chunk === 'string' ? chunk : chunk instanceof Buffer ? chunk.toString('utf8') : String(chunk);
    buffer.push(data);
    this.flushBuffer(buffer);
  }

  private flushBuffer(buffer: string[], force = false): void {
    if (buffer.length === 0) {
      return;
    }

    const text = buffer.join('');
    const lines = text.split(/\r?\n/);
    buffer.length = 0;

    // Preserve trailing partial line if the chunk does not end with a newline.
    const maybePartialLine = lines.pop();
    if (maybePartialLine && maybePartialLine.length > 0 && !text.endsWith('\n') && !text.endsWith('\r')) {
      if (force) {
        this.logLine(maybePartialLine);
      } else {
        buffer.push(maybePartialLine);
      }
    } else if (maybePartialLine && maybePartialLine.length > 0) {
      this.logLine(maybePartialLine);
    }

    for (const line of lines) {
      if (line.length > 0) {
        this.logLine(line);
      }
    }
  }

  private logLine(line: string): void {
    const timestamped = prefixWithTimestamp(line);
    writeLogLine(this.logStream, timestamped);
    if (line.toLowerCase().includes('error')) {
      console.error(timestamped);
    } else {
      console.log(timestamped);
    }
  }
}

async function executePrismaMigration(environment: EnvironmentConfig): Promise<ExecutionResult> {
  const connectionString = findConnectionString(environment.connectionStringEnvVars);
  if (!connectionString) {
    throw new Error(
      `Missing connection string for ${environment.description} environment. Set one of: ${environment.connectionStringEnvVars.join(
        ', ',
      )}.`,
    );
  }

  const timestamp = formatTimestamp();
  const logFilename = `prisma-migrate-${environment.name}-${timestamp}.log`;
  const logFilePath = join(LOG_DIRECTORY, logFilename);
  const logStream = createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
  const logger = new TimestampedLogger(logStream);

  writeLogLine(logStream, prefixWithTimestamp(`Starting Prisma migrate deploy for ${environment.description}.`));
  console.log(prefixWithTimestamp(`Running migrations for ${environment.description} environment.`));

  let attempt = 0;
  let lastError: unknown;

  while (attempt < MAX_ATTEMPTS) {
    attempt += 1;
    const attemptMessage = `Attempt ${attempt} of ${MAX_ATTEMPTS}`;
    writeLogLine(logStream, prefixWithTimestamp(`${attemptMessage} — launching Prisma CLI.`));
    console.log(prefixWithTimestamp(`${environment.description}: ${attemptMessage}`));

    const child = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...environment.buildRuntimeEnv(connectionString),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    logger.attach(child);

    const [code] = (await once(child, 'close')) as [number | null, NodeJS.Signals | null];
    logger.flush();

    if (code === 0) {
      writeLogLine(logStream, prefixWithTimestamp(`Prisma migrate deploy completed successfully on attempt ${attempt}.`));
      logStream.end();
      await once(logStream, 'close');

      const summary = summarizeLog(logFilePath, environment);
      const summaryPath = logFilePath.replace(/\.log$/, '.summary.json');
      writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      console.log(
        prefixWithTimestamp(
          `Migrations for ${environment.description} succeeded. Last applied migration: ${
            summary.summary.status === 'applied'
              ? summary.summary.lastAppliedMigration
              : summary.summary.message
          }.`,
        ),
      );

      return summary;
    }

    lastError = new Error(`Prisma migrate deploy exited with code ${code ?? 'null'} on attempt ${attempt}.`);
    writeLogLine(logStream, prefixWithTimestamp(`Attempt ${attempt} failed with exit code ${code}.`));

    if (attempt < MAX_ATTEMPTS) {
      const backoff = INITIAL_BACKOFF_MS * 2 ** (attempt - 1);
      writeLogLine(logStream, prefixWithTimestamp(`Retrying after ${backoff}ms.`));
      await delay(backoff);
    }
  }

  logStream.end();
  await once(logStream, 'close');
  throw lastError instanceof Error
    ? lastError
    : new Error(`Prisma migrate deploy failed for ${environment.description}.`);
}

function summarizeLog(logFile: string, environment: EnvironmentConfig): ExecutionResult {
  const logContent = readFileSync(logFile, 'utf8');
  const summary = extractLastAppliedMigration(logContent);
  return {
    environment,
    logFile: relative(process.cwd(), logFile),
    summary,
  };
}

async function main(): Promise<void> {
  ensureLogDirectoryExists(LOG_DIRECTORY);

  const results: ExecutionResult[] = [];
  for (const environment of ENVIRONMENTS) {
    const result = await executePrismaMigration(environment);
    results.push(result);
  }

  const recap = results.map((result) => {
    const envLabel = result.environment.description;
    switch (result.summary.status) {
      case 'applied':
        return `${envLabel}: applied ${result.summary.lastAppliedMigration} (hash: ${result.summary.hash})`;
      case 'none':
        return `${envLabel}: no pending migrations (${result.summary.message})`;
      case 'unknown':
        return `${envLabel}: status unknown (${result.summary.message})`;
    }
  });

  console.log(prefixWithTimestamp('Migration summary:\n- ' + recap.join('\n- ')));
}

main().catch((error) => {
  console.error(prefixWithTimestamp(`Migration orchestration failed: ${(error as Error).message}`));
  process.exitCode = 1;
});

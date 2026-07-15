import { spawn } from 'node:child_process';
import path from 'node:path';

import { sanitizeDatabaseDiagnostics } from './support/database-safety';
import {
  disposableRuntimeChildEnvironment,
  startDisposablePostgres,
  stopDisposablePostgres,
} from './support/database-lifecycle';
import { REPOSITORY_ROOT } from './support/runtime';
import type { DisposablePostgresRuntime } from './support/runtime';

const SIGNAL_EXIT_CODES: Partial<Record<NodeJS.Signals, number>> = {
  SIGINT: 130,
  SIGTERM: 143,
};

let activeChild: ReturnType<typeof spawn> | undefined;
let receivedSignal: NodeJS.Signals | undefined;
let forcedTerminationTimer: NodeJS.Timeout | undefined;

function signalChildProcess(
  child: ReturnType<typeof spawn>,
  signal: NodeJS.Signals,
): void {
  if (!child.pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall back to the direct process if its group already changed.
    }
  }
  child.kill(signal);
}

function handleSignal(signal: NodeJS.Signals): void {
  receivedSignal = signal;
  if (activeChild) {
    signalChildProcess(activeChild, signal);
    forcedTerminationTimer = setTimeout(() => {
      if (activeChild) signalChildProcess(activeChild, 'SIGKILL');
    }, 5_000);
  }
}

const handleSigint = () => handleSignal('SIGINT');
const handleSigterm = () => handleSignal('SIGTERM');

function runIntegrationTests(runtime: DisposablePostgresRuntime): Promise<number> {
  const vitestBinary = path.join(REPOSITORY_ROOT, 'node_modules/.bin/vitest');
  return new Promise((resolve, reject) => {
    activeChild = spawn(
      vitestBinary,
      ['run', '--config', 'vitest.integration.config.ts', '--reporter=default'],
      {
        cwd: REPOSITORY_ROOT,
        env: {
          ...disposableRuntimeChildEnvironment(runtime),
          NODE_ENV: 'test',
          NO_COLOR: '1',
        },
        detached: process.platform !== 'win32',
        shell: false,
        stdio: 'inherit',
      },
    );
    activeChild.once('error', (error) => {
      if (forcedTerminationTimer) clearTimeout(forcedTerminationTimer);
      activeChild = undefined;
      reject(error);
    });
    activeChild.once('close', (code, signal) => {
      if (forcedTerminationTimer) clearTimeout(forcedTerminationTimer);
      activeChild = undefined;
      resolve(code ?? (signal ? 1 : 0));
    });
  });
}

async function main(): Promise<void> {
  process.once('SIGINT', handleSigint);
  process.once('SIGTERM', handleSigterm);

  let runtime: DisposablePostgresRuntime | undefined;
  let testExitCode = 1;
  let cleanupError: unknown;
  try {
    runtime = await startDisposablePostgres();
    console.info(`[integration] Disposable PostgreSQL run ${runtime.runId} is ready.`);
    if (!receivedSignal) testExitCode = await runIntegrationTests(runtime);
  } catch (error) {
    console.error(`[integration] ${sanitizeDatabaseDiagnostics(error, runtime
      ? [runtime.password, runtime.user]
      : [])}`);
  } finally {
    if (runtime) {
      try {
        await stopDisposablePostgres(runtime);
        console.info(`[integration] Disposable PostgreSQL run ${runtime.runId} was removed.`);
      } catch (error) {
        cleanupError = error;
        console.error(`[integration] Cleanup failed closed: ${sanitizeDatabaseDiagnostics(error, [
          runtime.password,
          runtime.user,
        ])}`);
      }
    }
    process.removeListener('SIGINT', handleSigint);
    process.removeListener('SIGTERM', handleSigterm);
  }

  if (receivedSignal) {
    process.exitCode = SIGNAL_EXIT_CODES[receivedSignal] ?? 1;
  } else if (cleanupError) {
    process.exitCode = 1;
  } else {
    process.exitCode = testExitCode;
  }
}

await main();

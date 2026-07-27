#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  HOSTILE_INTEGRATION_ENVIRONMENT,
  RELEASE_GATES,
  SYNTHETIC_PRODUCTION_ENVIRONMENT,
} from './lib/release-gates.mjs';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_ENVIRONMENT_FILES = Object.freeze([
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.test',
  '.env.test.local',
  '.env.production',
  '.env.production.local',
]);
const PASSTHROUGH_ENVIRONMENT = Object.freeze([
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'CI',
  'USER',
  'SHELL',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'DOCKER_CONTEXT',
  'DOCKER_HOST',
  'DOCKER_CONFIG',
  'npm_config_cache',
  'GITLEAKS_BIN',
]);

let activeChild;
let activeKillTimer;
let receivedSignal;

function localEnvironmentKeyMask() {
  const names = new Set();
  for (const relative of ['.env.example', ...LOCAL_ENVIRONMENT_FILES]) {
    let source;
    try {
      source = readFileSync(path.join(REPOSITORY_ROOT, relative), 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw new Error('Local environment key names could not be isolated.');
    }
    for (const line of source.split(/\r?\n/u)) {
      const trimmed = line.trimStart();
      const assignment = trimmed.startsWith('export ')
        ? trimmed.slice('export '.length)
        : trimmed;
      const separator = assignment.indexOf('=');
      if (separator < 1) continue;
      const name = assignment.slice(0, separator).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) names.add(name);
    }
  }
  return Object.fromEntries([...names].sort().map((name) => [name, '']));
}

function restrictedBaseEnvironment() {
  const environment = {};
  for (const name of PASSTHROUGH_ENVIRONMENT) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return {
    ...localEnvironmentKeyMask(),
    ...environment,
    NODE_ENV: 'test',
    TZ: 'UTC',
    NEXT_TELEMETRY_DISABLED: '1',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    GIT_PAGER: 'cat',
    PAGER: 'cat',
    GIT_TERMINAL_PROMPT: '0',
    DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    DIRECT_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    SHADOW_DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    PGHOST: 'hostile.invalid',
    PGPORT: '1',
    PGDATABASE: 'hostile',
    PGUSER: 'hostile',
    PGPASSWORD: 'hostile',
    POSTGRES_DB: 'hostile',
    POSTGRES_USER: 'hostile',
    POSTGRES_PASSWORD: 'hostile',
  };
}

function environmentFor(profile) {
  const base = restrictedBaseEnvironment();
  if (profile === 'integration') return { ...base, ...HOSTILE_INTEGRATION_ENVIRONMENT };
  if (profile === 'production') return { ...base, ...SYNTHETIC_PRODUCTION_ENVIRONMENT };
  if (profile === 'base') return base;
  throw new Error('Release gate requested an unknown environment profile.');
}

function runProcess(command, args, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: REPOSITORY_ROOT,
      env: environment,
      detached: process.platform !== 'win32',
      shell: false,
      stdio: 'inherit',
    });
    activeChild = child;
    child.once('error', () => {
      if (activeKillTimer) clearTimeout(activeKillTimer);
      activeKillTimer = undefined;
      activeChild = undefined;
      reject(new Error('Mandatory release command could not be started.'));
    });
    child.once('exit', (code, signal) => {
      if (activeKillTimer) clearTimeout(activeKillTimer);
      activeKillTimer = undefined;
      activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(
        signal
          ? `Mandatory release command was interrupted by ${signal}.`
          : `Mandatory release command exited with status ${code ?? 'unknown'}.`,
      ));
    });
  });
}

async function runGate(gate, position, gateCount, runner, stdout, now, abortSignal) {
  const startedAt = now();
  stdout.write(`\n[${position}/${gateCount}] ${gate.label}\n`);
  await runner(gate.command, gate.args, environmentFor(gate.environment));
  if (abortSignal()) throw new Error('Release verification was interrupted.');
  const elapsedSeconds = ((now() - startedAt) / 1_000).toFixed(1);
  stdout.write(`PASS ${gate.label} (${elapsedSeconds}s)\n`);
  return { id: gate.id, label: gate.label, elapsedSeconds };
}

function terminateActiveChild(signal) {
  if (!activeChild || activeChild.killed) return;
  try {
    if (process.platform === 'win32' || !activeChild.pid) activeChild.kill(signal);
    else process.kill(-activeChild.pid, signal);
  } catch {
    // The process may have exited between the signal and this attempt.
  }
  activeKillTimer = setTimeout(() => {
    if (!activeChild) return;
    try {
      if (process.platform === 'win32' || !activeChild.pid) activeChild.kill('SIGKILL');
      else process.kill(-activeChild.pid, 'SIGKILL');
    } catch {
      // A completed process group needs no further action.
    }
  }, 5_000);
  activeKillTimer.unref();
}

export async function runReleaseVerification({
  gates = RELEASE_GATES,
  runner = runProcess,
  stdout = process.stdout,
  stderr = process.stderr,
  now = Date.now,
  abortSignal = () => receivedSignal,
} = {}) {
  const completed = [];
  let integrationAttempted = false;
  let currentGate;
  try {
    for (const [index, gate] of gates.entries()) {
      if (abortSignal()) throw new Error('Release verification was interrupted.');
      currentGate = gate;
      if (gate.id === 'integration') integrationAttempted = true;
      completed.push(await runGate(
        gate,
        index + 1,
        gates.length,
        runner,
        stdout,
        now,
        abortSignal,
      ));
    }
    if (abortSignal()) throw new Error('Release verification was interrupted.');
  } catch (error) {
    if (integrationAttempted
      && currentGate?.id !== 'integration-orphans') {
      stderr.write('\nVerifying disposable-container state after failure...\n');
      try {
        await runner(
          'npm',
          ['--ignore-scripts', 'run', 'check:integration-orphans'],
          environmentFor('base'),
        );
      } catch {
        stderr.write('Disposable-container state could not be proven clean.\n');
      }
    }
    stderr.write(
      `\nRELEASE VERIFICATION FAILED after ${completed.length}/${gates.length} gates.\n`,
    );
    stderr.write(
      `Failed gate: ${currentGate?.label ?? 'unknown mandatory gate'}.\n`,
    );
    stderr.write(`${error instanceof Error ? error.message : 'Mandatory gate failed.'}\n`);
    return {
      ok: false,
      completed,
      failedGate: currentGate?.id,
      interruptedBy: abortSignal() || undefined,
    };
  }

  const totalSeconds = completed
    .reduce((sum, gate) => sum + Number.parseFloat(gate.elapsedSeconds), 0)
    .toFixed(1);
  stdout.write(
    `\nRELEASE VERIFICATION PASSED: ${completed.length}/${gates.length} gates (${totalSeconds}s).\n`,
  );
  stdout.write('No deployment or persistent migration was performed.\n');
  return { ok: true, completed };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (invokedPath === import.meta.url) {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      receivedSignal = signal;
      terminateActiveChild(signal);
    });
  }
  const result = await runReleaseVerification();
  if (!result.ok) {
    process.exitCode = result.interruptedBy === 'SIGINT'
      ? 130
      : result.interruptedBy === 'SIGTERM'
        ? 143
        : 1;
  }
}

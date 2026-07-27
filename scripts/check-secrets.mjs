#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  opendir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_ROOT = path.join(REPOSITORY_ROOT, 'config/secret-scanning');
const CONFIG_PATH = path.join(CONFIG_ROOT, 'gitleaks.toml');
const TOOL_LOCK_PATH = path.join(CONFIG_ROOT, 'tool.lock.json');
const CURRENT_ALLOWLIST_PATH = path.join(CONFIG_ROOT, 'current-fixture-allowlist.json');
const HISTORICAL_BASELINE_PATH = path.join(CONFIG_ROOT, 'historical-incident-baseline.json');
const ENV_FILE_PATTERN = /(^|\/)\.env(?:\.|$)/u;
const ARTIFACT_ROOTS = Object.freeze([
  '.next/standalone',
  '.next/server',
  '.next/static',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function platformKey() {
  return `${process.platform}-${process.arch}`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? REPOSITORY_ROOT,
    encoding: 'utf8',
    env: options.env ?? process.env,
    maxBuffer: 16 * 1_024 * 1_024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function verifyScanner(binaryPath) {
  const lock = await readJson(TOOL_LOCK_PATH);
  const artifact = lock.artifacts?.[platformKey()];
  if (!artifact) {
    throw new Error(`No locked scanner artifact exists for ${platformKey()}.`);
  }
  const binary = await readFile(binaryPath);
  if (sha256(binary) !== artifact.binarySha256) {
    throw new Error('The secret scanner binary does not match the repository lock.');
  }
  const version = run(binaryPath, ['version']);
  if (version.status !== 0 || version.stdout.trim() !== lock.version) {
    throw new Error('The secret scanner version does not match the repository lock.');
  }
}

function scannerBinary() {
  const configured = process.env.GITLEAKS_BIN?.trim();
  if (configured) return path.resolve(configured);
  throw new Error(
    'GITLEAKS_BIN must identify the checksum-locked Gitleaks binary documented in docs/security/secret-scanning.md.',
  );
}

async function trackedCandidateFiles() {
  const result = run('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  if (result.status !== 0) {
    throw new Error('Tracked release inputs could not be enumerated.');
  }
  return result.stdout.split('\0').filter(Boolean).sort();
}

async function walkFiles(root, relative = '') {
  const output = [];
  let directory;
  try {
    directory = await opendir(path.join(root, relative));
  } catch (error) {
    if (error?.code === 'ENOENT') return output;
    throw error;
  }
  for await (const entry of directory) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) output.push(...await walkFiles(root, child));
    else if (entry.isFile()) output.push(child);
    else throw new Error(`Unsupported release input type: ${child}`);
  }
  return output;
}

async function copyCandidateFiles(files, destination) {
  for (const relative of files) {
    if (path.isAbsolute(relative) || relative.split('/').includes('..')) {
      throw new Error('Release input enumeration produced an unsafe path.');
    }
    const source = path.join(REPOSITORY_ROOT, relative);
    let metadata;
    try {
      metadata = await lstat(source);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    if (!metadata.isFile()) {
      throw new Error(`Unsupported tracked release input type: ${relative}`);
    }
    const target = path.join(destination, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(source, target);
    await chmod(target, 0o600);
  }
}

function normalizeFinding(scanRoot, finding) {
  const absolute = path.resolve(finding.File);
  const relative = path.relative(scanRoot, absolute).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) {
    throw new Error('Secret scanner returned a finding outside the isolated candidate.');
  }
  const rule = String(finding.RuleID ?? 'unknown');
  const line = Number(finding.StartLine);
  const column = Number(finding.StartColumn);
  if (!Number.isSafeInteger(line) || line < 1 || !Number.isSafeInteger(column) || column < 1) {
    throw new Error('Secret scanner returned invalid location metadata.');
  }
  return {
    path: relative,
    rule,
    line,
    column,
    classification: classifyRule(rule),
    fingerprint: sha256(`${relative}\0${rule}\0${line}\0${column}`).slice(0, 16),
  };
}

function classifyRule(rule) {
  if (/private-key/iu.test(rule)) return 'private-key';
  if (/database-url/iu.test(rule)) return 'credential-bearing-database-url';
  if (/high-entropy/iu.test(rule)) return 'high-entropy-credential';
  return 'secret-assignment';
}

function allowlistKey(finding) {
  return [
    finding.path,
    finding.rule,
    finding.line,
    finding.column,
  ].join('\0');
}

export function findForbiddenEnvironmentArtifact(files) {
  return files.find((relative) => ENV_FILE_PATTERN.test(relative));
}

export function evaluateCurrentFindings(findings, allowlistEntries = []) {
  const allowlist = new Map(allowlistEntries.map((entry) => [allowlistKey(entry), entry]));
  const accepted = [];
  const unexpected = [];
  for (const finding of findings) {
    const known = allowlist.get(allowlistKey(finding));
    if (known) {
      accepted.push({ ...finding, classification: known.classification });
      allowlist.delete(allowlistKey(finding));
    } else {
      unexpected.push(finding);
    }
  }
  return {
    accepted,
    unexpected,
    stale: [...allowlist.values()],
  };
}

export function evaluateHistoricalFindings(findings, baselineEntries) {
  const expected = new Set(baselineEntries.map((entry) => entry.fingerprint));
  const unexpected = findings.filter((finding) => !expected.has(finding.fingerprint));
  const missing = baselineEntries.filter(
    (entry) => !findings.some((finding) => finding.fingerprint === entry.fingerprint),
  );
  return { unexpected, missing };
}

export function formatFinding(finding) {
  return [
    `path=${finding.path}`,
    `line=${finding.line}`,
    `column=${finding.column}`,
    `rule=${finding.rule}`,
    `classification=${finding.classification}`,
    `fingerprint=${finding.fingerprint}`,
  ].join(' ');
}

async function runGitleaks(binaryPath, scanRoot, reportPath) {
  const result = run(binaryPath, [
    'dir',
    scanRoot,
    '--config',
    CONFIG_PATH,
    '--no-banner',
    '--no-color',
    '--log-level',
    'error',
    '--redact=100',
    '--report-format',
    'json',
    '--report-path',
    reportPath,
  ]);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error('The maintained secret scanner failed without usable redacted evidence.');
  }
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
  } catch {
    throw new Error('The maintained secret scanner did not produce valid JSON evidence.');
  }
  if (!Array.isArray(report)) {
    throw new Error('The maintained secret scanner produced an invalid evidence shape.');
  }
  return report.map((finding) => normalizeFinding(scanRoot, finding));
}

async function isolatedScan(files, { allowlist = [], rejectEnvironmentFiles = false } = {}) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'secret-gate-'));
  await chmod(temporaryRoot, 0o700);
  const scanRoot = path.join(temporaryRoot, 'candidate');
  const reportPath = path.join(temporaryRoot, 'report.json');
  try {
    await mkdir(scanRoot, { mode: 0o700 });
    if (rejectEnvironmentFiles) {
      const environmentFile = findForbiddenEnvironmentArtifact(files);
      if (environmentFile) {
        throw new Error(`Environment file is forbidden in release artifacts: ${environmentFile}`);
      }
    }
    await copyCandidateFiles(files, scanRoot);
    await writeFile(reportPath, '[]\n', { encoding: 'utf8', mode: 0o600 });
    const binaryPath = scannerBinary();
    await verifyScanner(binaryPath);
    const findings = await runGitleaks(binaryPath, scanRoot, reportPath);
    return evaluateCurrentFindings(findings, allowlist);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function scanPathForTest(sourceRoot, { allowlist = [] } = {}) {
  const files = await walkFiles(sourceRoot);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'secret-gate-test-'));
  await chmod(temporaryRoot, 0o700);
  const scanRoot = path.join(temporaryRoot, 'candidate');
  const reportPath = path.join(temporaryRoot, 'report.json');
  try {
    await mkdir(scanRoot, { mode: 0o700 });
    for (const relative of files) {
      const target = path.join(scanRoot, relative);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await copyFile(path.join(sourceRoot, relative), target);
      await chmod(target, 0o600);
    }
    await writeFile(reportPath, '[]\n', { encoding: 'utf8', mode: 0o600 });
    const binaryPath = scannerBinary();
    await verifyScanner(binaryPath);
    const findings = await runGitleaks(binaryPath, scanRoot, reportPath);
    return evaluateCurrentFindings(findings, allowlist);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function sourceScan() {
  const allowlist = await readJson(CURRENT_ALLOWLIST_PATH);
  const historical = await readJson(HISTORICAL_BASELINE_PATH);
  if (historical.findings.length !== 6) {
    throw new Error('IR-01 historical baseline must contain exactly six redacted findings.');
  }
  return isolatedScan(await trackedCandidateFiles(), { allowlist: allowlist.findings });
}

async function artifactScan() {
  const files = [];
  for (const artifactRoot of ARTIFACT_ROOTS) {
    const artifactFiles = await walkFiles(REPOSITORY_ROOT, artifactRoot);
    files.push(...artifactFiles.map((relative) => `${artifactRoot}/${relative}`));
  }
  if (files.length === 0) {
    throw new Error('No production build artifacts were available for secret scanning.');
  }
  return isolatedScan([...new Set(files)].sort(), { rejectEnvironmentFiles: true });
}

async function main() {
  const scope = process.argv[2] ?? 'sources';
  if (!['sources', 'artifacts'].includes(scope) || process.argv.length > 3) {
    throw new Error('Usage: node scripts/check-secrets.mjs [sources|artifacts]');
  }
  const result = scope === 'sources' ? await sourceScan() : await artifactScan();
  if (result.stale.length > 0 || result.unexpected.length > 0) {
    process.stderr.write('SECRET SCAN FAILED. Redacted findings:\n');
    for (const finding of result.unexpected) {
      process.stderr.write(`${formatFinding(finding)}\n`);
    }
    for (const stale of result.stale) {
      process.stderr.write(
        `stale-allowlist path=${stale.path} line=${stale.line} column=${stale.column} `
          + `rule=${stale.rule} `
          + `classification=${stale.classification}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `SECRET SCAN PASSED scope=${scope} reviewedFixtures=${result.accepted.length} findings=0\n`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';
if (invokedPath === import.meta.url) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `SECRET SCAN FAILED. ${error instanceof Error ? error.message : 'Unknown scanner failure.'}\n`,
    );
    process.exitCode = 1;
  }
}

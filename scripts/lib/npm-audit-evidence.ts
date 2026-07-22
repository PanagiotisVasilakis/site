import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const NPM_AUDIT_COMMAND = 'npm';
export const NPM_AUDIT_ARGUMENTS = Object.freeze([
  'audit',
  '--audit-level=high',
  '--omit=dev',
  '--json',
] as const);

export interface NpmAuditCounts {
  informational: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

export type NpmAuditFailureReason =
  | 'EMPTY_OUTPUT'
  | 'INVALID_UTF8'
  | 'MALFORMED_JSON'
  | 'INVALID_VULNERABILITY_COUNTS'
  | 'PROCESS_ERROR'
  | 'PROCESS_SIGNAL'
  | 'PROCESS_EXIT_CODE_UNAVAILABLE'
  | 'PROCESS_RESULT_INCONSISTENT'
  | 'PROCESS_FAILURE_WITHOUT_HIGH_FINDINGS'
  | 'VULNERABILITY_THRESHOLD_EXCEEDED';

export interface NpmAuditProcessResult {
  exitCode: number | null;
  signal: string | null;
  processError: boolean;
}

export interface NpmAuditProcessOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  shell: false;
  stdoutPath: string;
  stderrPath: string;
}

export type NpmAuditRunner = (
  command: string,
  args: readonly string[],
  options: NpmAuditProcessOptions,
) => Promise<NpmAuditProcessResult>;

export interface NpmAuditEvidence {
  artifactPath: string;
  stderrArtifactPath: string;
  artifactSha256: string;
  counts?: NpmAuditCounts;
  processExitCode: number | null;
  processSignal: string | null;
  passed: boolean;
  failureReason?: NpmAuditFailureReason;
}

interface CollectNpmAuditEvidenceOptions {
  cwd?: string;
  environment?: NodeJS.ProcessEnv;
  runner?: NpmAuditRunner;
  temporaryRoot?: string;
}

interface RunNpmAuditEvidenceCheckOptions extends CollectNpmAuditEvidenceOptions {
  writeLine?: (line: string) => void;
}

interface CountsResult {
  counts?: NpmAuditCounts;
  failureReason?: NpmAuditFailureReason;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseNpmAuditCounts(bytes: Buffer): CountsResult {
  if (bytes.length === 0) return { failureReason: 'EMPTY_OUTPUT' };

  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { failureReason: 'INVALID_UTF8' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { failureReason: 'MALFORMED_JSON' };
  }

  if (!isPlainObject(parsed)
    || !hasOwn(parsed, 'metadata')
    || !isPlainObject(parsed.metadata)
    || !hasOwn(parsed.metadata, 'vulnerabilities')
    || !isPlainObject(parsed.metadata.vulnerabilities)) {
    return { failureReason: 'INVALID_VULNERABILITY_COUNTS' };
  }

  const vulnerabilities = parsed.metadata.vulnerabilities;
  const keys = ['info', 'low', 'moderate', 'high', 'critical', 'total'] as const;
  for (const key of keys) {
    if (!hasOwn(vulnerabilities, key)
      || !Number.isSafeInteger(vulnerabilities[key])
      || (vulnerabilities[key] as number) < 0) {
      return { failureReason: 'INVALID_VULNERABILITY_COUNTS' };
    }
  }

  const info = vulnerabilities.info as number;
  const low = vulnerabilities.low as number;
  const moderate = vulnerabilities.moderate as number;
  const high = vulnerabilities.high as number;
  const critical = vulnerabilities.critical as number;
  const total = vulnerabilities.total as number;
  const calculatedTotal = info + low + moderate + high + critical;

  if (!Number.isSafeInteger(calculatedTotal) || calculatedTotal !== total) {
    return { failureReason: 'INVALID_VULNERABILITY_COUNTS' };
  }

  return {
    counts: {
      informational: info,
      low,
      moderate,
      high,
      critical,
      total,
    },
  };
}

function isInsideRepository(repositoryRoot: string, candidate: string): boolean {
  const relativePath = path.relative(repositoryRoot, candidate);
  return relativePath === ''
    || (!relativePath.startsWith(`..${path.sep}`)
      && relativePath !== '..'
      && !path.isAbsolute(relativePath));
}

function createEvidencePaths(repositoryRoot: string, temporaryRoot: string) {
  const resolvedRepositoryRoot = realpathSync(repositoryRoot);
  const resolvedTemporaryRoot = realpathSync(temporaryRoot);
  if (isInsideRepository(resolvedRepositoryRoot, resolvedTemporaryRoot)) {
    throw new Error('Audit evidence temporary root must be outside the repository.');
  }

  const evidenceDirectory = mkdtempSync(
    path.join(resolvedTemporaryRoot, 'qr-city-guide-npm-audit-'),
  );
  chmodSync(evidenceDirectory, 0o700);

  const artifactPath = path.join(evidenceDirectory, 'npm-audit.json');
  const stderrArtifactPath = path.join(evidenceDirectory, 'npm-audit.stderr');
  writeFileSync(artifactPath, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
  writeFileSync(stderrArtifactPath, Buffer.alloc(0), { flag: 'wx', mode: 0o600 });

  return { artifactPath, stderrArtifactPath };
}

export const runNpmAuditProcess: NpmAuditRunner = async (command, args, options) => {
  let stdoutDescriptor: number | undefined;
  let stderrDescriptor: number | undefined;

  try {
    stdoutDescriptor = openSync(options.stdoutPath, 'w');
    stderrDescriptor = openSync(options.stderrPath, 'w');
    const childStdoutDescriptor = stdoutDescriptor;
    const childStderrDescriptor = stderrDescriptor;
    return await new Promise<NpmAuditProcessResult>((resolve) => {
      let processError = false;
      try {
        const child = spawn(command, [...args], {
          cwd: options.cwd,
          env: options.env,
          shell: options.shell,
          stdio: ['ignore', childStdoutDescriptor, childStderrDescriptor],
        });
        child.once('error', () => {
          processError = true;
        });
        child.once('close', (exitCode, signal) => {
          resolve({ exitCode, signal, processError });
        });
      } catch {
        resolve({ exitCode: null, signal: null, processError: true });
      }
    });
  } finally {
    let closeFailed = false;
    for (const descriptor of [stderrDescriptor, stdoutDescriptor]) {
      if (descriptor === undefined) continue;
      try {
        closeSync(descriptor);
      } catch {
        closeFailed = true;
      }
    }
    if (closeFailed) throw new Error('Audit evidence descriptor close failed.');
  }
};

function determineFailure(
  processResult: NpmAuditProcessResult,
  countsResult: CountsResult,
): NpmAuditFailureReason | undefined {
  if (processResult.processError) return 'PROCESS_ERROR';
  if (processResult.signal !== null) return 'PROCESS_SIGNAL';
  if (!Number.isSafeInteger(processResult.exitCode)
    || (processResult.exitCode as number) < 0) {
    return 'PROCESS_EXIT_CODE_UNAVAILABLE';
  }
  if (countsResult.failureReason) return countsResult.failureReason;

  const counts = countsResult.counts;
  if (!counts) return 'INVALID_VULNERABILITY_COUNTS';
  const hasHighFindings = counts.high > 0 || counts.critical > 0;

  if (hasHighFindings && processResult.exitCode !== 1) {
    return 'PROCESS_RESULT_INCONSISTENT';
  }
  if (hasHighFindings) return 'VULNERABILITY_THRESHOLD_EXCEEDED';
  if (processResult.exitCode !== 0) return 'PROCESS_FAILURE_WITHOUT_HIGH_FINDINGS';
  return undefined;
}

export async function collectNpmAuditEvidence({
  cwd = process.cwd(),
  environment = process.env,
  runner = runNpmAuditProcess,
  temporaryRoot = tmpdir(),
}: CollectNpmAuditEvidenceOptions = {}): Promise<NpmAuditEvidence> {
  const { artifactPath, stderrArtifactPath } = createEvidencePaths(cwd, temporaryRoot);
  let processResult: NpmAuditProcessResult;

  try {
    processResult = await runner(NPM_AUDIT_COMMAND, NPM_AUDIT_ARGUMENTS, {
      cwd,
      env: environment,
      shell: false,
      stdoutPath: artifactPath,
      stderrPath: stderrArtifactPath,
    });
  } catch {
    processResult = { exitCode: null, signal: null, processError: true };
  }

  const artifactBytes = readFileSync(artifactPath);
  const artifactSha256 = createHash('sha256').update(artifactBytes).digest('hex');
  const countsResult = parseNpmAuditCounts(artifactBytes);
  const failureReason = determineFailure(processResult, countsResult);

  return {
    artifactPath,
    stderrArtifactPath,
    artifactSha256,
    counts: countsResult.counts,
    processExitCode: processResult.exitCode,
    processSignal: processResult.signal,
    passed: failureReason === undefined,
    failureReason,
  };
}

export function formatNpmAuditEvidence(evidence: NpmAuditEvidence): string[] {
  const lines = ['NPM_AUDIT_SCOPE=PRODUCTION_OMIT_DEV'];
  if (evidence.counts) {
    lines.push(
      `NPM_AUDIT_INFORMATIONAL=${evidence.counts.informational}`,
      `NPM_AUDIT_LOW=${evidence.counts.low}`,
      `NPM_AUDIT_MODERATE=${evidence.counts.moderate}`,
      `NPM_AUDIT_HIGH=${evidence.counts.high}`,
      `NPM_AUDIT_CRITICAL=${evidence.counts.critical}`,
      `NPM_AUDIT_TOTAL=${evidence.counts.total}`,
    );
  }
  lines.push(
    `NPM_AUDIT_PROCESS_EXIT_CODE=${evidence.processExitCode ?? 'UNAVAILABLE'}`,
    `NPM_AUDIT_ARTIFACT=${evidence.artifactPath}`,
    `NPM_AUDIT_ARTIFACT_SHA256=${evidence.artifactSha256}`,
    `NPM_AUDIT_STDERR_ARTIFACT=${evidence.stderrArtifactPath}`,
    `NPM_AUDIT_RESULT=${evidence.passed ? 'PASS' : 'FAIL'}`,
  );
  if (evidence.failureReason) {
    lines.push(`NPM_AUDIT_FAILURE_REASON=${evidence.failureReason}`);
  }
  return lines;
}

export async function runNpmAuditEvidenceCheck({
  writeLine = (line) => console.log(line),
  ...options
}: RunNpmAuditEvidenceCheckOptions = {}): Promise<boolean> {
  try {
    const evidence = await collectNpmAuditEvidence(options);
    for (const line of formatNpmAuditEvidence(evidence)) writeLine(line);
    return evidence.passed;
  } catch {
    writeLine('NPM_AUDIT_SCOPE=PRODUCTION_OMIT_DEV');
    writeLine('NPM_AUDIT_RESULT=FAIL');
    writeLine('NPM_AUDIT_FAILURE_REASON=EVIDENCE_CAPTURE_FAILED');
    return false;
  }
}

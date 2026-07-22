import { createHash } from 'node:crypto';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectNpmAuditEvidence,
  formatNpmAuditEvidence,
  NPM_AUDIT_ARGUMENTS,
  NPM_AUDIT_COMMAND,
  runNpmAuditEvidenceCheck,
  type NpmAuditProcessOptions,
} from '../../scripts/lib/npm-audit-evidence';
import {
  auditFixtureMode,
  cleanupAuditEvidenceTemporaryRoots,
  createAuditEvidenceTemporaryRoot,
  createAuditFixtureRunner,
  readAuditFixtureFile,
} from '../../scripts/tests/support/npm-audit-evidence-fixtures';

function auditJson(
  counts: Partial<Record<'info' | 'low' | 'moderate' | 'high' | 'critical' | 'total', unknown>>,
): string {
  return JSON.stringify({ metadata: { vulnerabilities: counts } });
}

function validAuditJson(overrides: Partial<Record<
  'info' | 'low' | 'moderate' | 'high' | 'critical', number
>> = {}): string {
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
    ...overrides,
  };
  return auditJson({
    ...counts,
    total: counts.info + counts.low + counts.moderate + counts.high + counts.critical,
  });
}

afterEach(() => {
  cleanupAuditEvidenceTemporaryRoots();
});

describe('npm audit evidence', () => {
  it('preserves exact bytes, reports exact non-blocking counts, and uses the fixed argument vector', async () => {
    const exactBytes = Buffer.from(
      '{\r\n  "metadata": {"vulnerabilities": '
      + '{"info":2,"low":3,"moderate":4,"high":0,"critical":0,"total":9}}\r\n}\r\n',
    );
    const stderrBytes = Buffer.from('fixture stderr\r\n');
    const invocations: Array<{
      command: string;
      args: readonly string[];
      options: NpmAuditProcessOptions;
    }> = [];

    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        exactBytes,
        { exitCode: 0, signal: null, processError: false },
        stderrBytes,
        (command, args, options) => {
          invocations.push({ command, args: [...args], options });
        },
      ),
    });

    expect(invocations).toHaveLength(1);
    const invocation = invocations[0];
    expect(invocation.command).toBe(NPM_AUDIT_COMMAND);
    expect(invocation.args).toEqual([...NPM_AUDIT_ARGUMENTS]);
    expect(invocation.args).toEqual([
      'audit',
      '--audit-level=high',
      '--omit=dev',
      '--json',
    ]);
    expect(invocation.options.shell).toBe(false);
    expect(evidence.passed).toBe(true);
    expect(evidence.counts).toEqual({
      informational: 2,
      low: 3,
      moderate: 4,
      high: 0,
      critical: 0,
      total: 9,
    });
    expect(path.isAbsolute(evidence.artifactPath)).toBe(true);
    const repositoryRelativeArtifact = path.relative(process.cwd(), evidence.artifactPath);
    expect(
      repositoryRelativeArtifact === '..'
      || repositoryRelativeArtifact.startsWith(`..${path.sep}`)
      || path.isAbsolute(repositoryRelativeArtifact),
    ).toBe(true);
    expect(readAuditFixtureFile(evidence.artifactPath)).toEqual(exactBytes);
    expect(readAuditFixtureFile(evidence.stderrArtifactPath)).toEqual(stderrBytes);
    if (process.platform !== 'win32') {
      expect(auditFixtureMode(path.dirname(evidence.artifactPath))).toBe(0o700);
      expect(auditFixtureMode(evidence.artifactPath)).toBe(0o600);
      expect(auditFixtureMode(evidence.stderrArtifactPath)).toBe(0o600);
    }
    expect(evidence.artifactSha256).toBe(
      createHash('sha256').update(exactBytes).digest('hex'),
    );
    expect(formatNpmAuditEvidence(evidence)).toEqual(expect.arrayContaining([
      'NPM_AUDIT_SCOPE=PRODUCTION_OMIT_DEV',
      'NPM_AUDIT_INFORMATIONAL=2',
      'NPM_AUDIT_LOW=3',
      'NPM_AUDIT_MODERATE=4',
      'NPM_AUDIT_HIGH=0',
      'NPM_AUDIT_CRITICAL=0',
      'NPM_AUDIT_TOTAL=9',
      `NPM_AUDIT_ARTIFACT=${evidence.artifactPath}`,
      `NPM_AUDIT_ARTIFACT_SHA256=${evidence.artifactSha256}`,
      'NPM_AUDIT_RESULT=PASS',
    ]));
  });

  it('retains and reports High findings while failing the policy check', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ low: 1, high: 2 }),
        { exitCode: 1, signal: null, processError: false },
      ),
    });

    expect(evidence.counts).toMatchObject({ low: 1, high: 2, critical: 0, total: 3 });
    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('VULNERABILITY_THRESHOLD_EXCEEDED');
    expect(formatNpmAuditEvidence(evidence)).toContain('NPM_AUDIT_HIGH=2');
  });

  it('retains and reports Critical findings while failing the policy check', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ moderate: 1, critical: 1 }),
        { exitCode: 1, signal: null, processError: false },
      ),
    });

    expect(evidence.counts).toMatchObject({ moderate: 1, high: 0, critical: 1, total: 2 });
    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('VULNERABILITY_THRESHOLD_EXCEEDED');
    expect(formatNpmAuditEvidence(evidence)).toContain('NPM_AUDIT_CRITICAL=1');
  });

  it('fails closed for malformed JSON without inventing severity counts', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        '{not-json}\n',
        { exitCode: 1, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('MALFORMED_JSON');
    expect(evidence.counts).toBeUndefined();
    expect(formatNpmAuditEvidence(evidence).some((line) => (
      line.startsWith('NPM_AUDIT_HIGH=')
    ))).toBe(false);
  });

  it('fails closed for a missing severity count', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        auditJson({ info: 0, low: 0, moderate: 0, high: 0, total: 0 }),
        { exitCode: 0, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('INVALID_VULNERABILITY_COUNTS');
    expect(evidence.counts).toBeUndefined();
  });

  it.each([
    ['negative', { info: 0, low: -1, moderate: 0, high: 0, critical: 0, total: -1 }],
    ['fractional', { info: 0, low: 0.5, moderate: 0, high: 0, critical: 0, total: 0.5 }],
    ['string', { info: 0, low: '0', moderate: 0, high: 0, critical: 0, total: 0 }],
    ['wrong total', { info: 1, low: 1, moderate: 1, high: 0, critical: 0, total: 2 }],
  ] as const)('fails closed for %s vulnerability counts', async (_scenario, counts) => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        auditJson(counts),
        { exitCode: 0, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('INVALID_VULNERABILITY_COUNTS');
  });

  it('fails closed for child execution or network failure and retains stderr', async () => {
    const stderrBytes = Buffer.from('registry unavailable fixture\n');
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        Buffer.alloc(0),
        { exitCode: null, signal: null, processError: true },
        stderrBytes,
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('PROCESS_ERROR');
    expect(readAuditFixtureFile(evidence.stderrArtifactPath)).toEqual(stderrBytes);
    expect(formatNpmAuditEvidence(evidence).join('\n')).not.toContain(
      stderrBytes.toString('utf8').trim(),
    );
  });

  it('fails closed when a nonzero process exit has no High or Critical findings', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ moderate: 2 }),
        { exitCode: 1, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('PROCESS_FAILURE_WITHOUT_HIGH_FINDINGS');
  });

  it('fails closed when High findings and the process exit code disagree', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ high: 1 }),
        { exitCode: 0, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('PROCESS_RESULT_INCONSISTENT');
  });

  it('fails closed when stdout is missing despite a zero process exit', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        Buffer.alloc(0),
        { exitCode: 0, signal: null, processError: false },
      ),
    });

    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('EMPTY_OUTPUT');
  });

  it('fails closed when an unexpected process exit accompanies valid High counts', async () => {
    const evidence = await collectNpmAuditEvidence({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ high: 1 }),
        { exitCode: 2, signal: null, processError: false },
      ),
    });

    expect(evidence.processExitCode).toBe(2);
    expect(evidence.passed).toBe(false);
    expect(evidence.failureReason).toBe('PROCESS_RESULT_INCONSISTENT');
  });

  it('propagates audit pass/fail decisions and stable summaries through the validator hook', async () => {
    const passingLines: string[] = [];
    const passed = await runNpmAuditEvidenceCheck({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ low: 1, moderate: 2 }),
        { exitCode: 0, signal: null, processError: false },
      ),
      writeLine: (line) => passingLines.push(line),
    });
    expect(passed).toBe(true);
    expect(passingLines).toEqual(expect.arrayContaining([
      'NPM_AUDIT_INFORMATIONAL=0',
      'NPM_AUDIT_LOW=1',
      'NPM_AUDIT_MODERATE=2',
      'NPM_AUDIT_HIGH=0',
      'NPM_AUDIT_CRITICAL=0',
      'NPM_AUDIT_TOTAL=3',
      'NPM_AUDIT_PROCESS_EXIT_CODE=0',
      'NPM_AUDIT_RESULT=PASS',
    ]));

    const failingLines: string[] = [];
    const passedWithHigh = await runNpmAuditEvidenceCheck({
      temporaryRoot: createAuditEvidenceTemporaryRoot(),
      runner: createAuditFixtureRunner(
        validAuditJson({ high: 1 }),
        { exitCode: 1, signal: null, processError: false },
      ),
      writeLine: (line) => failingLines.push(line),
    });
    expect(passedWithHigh).toBe(false);
    expect(failingLines).toEqual(expect.arrayContaining([
      'NPM_AUDIT_HIGH=1',
      'NPM_AUDIT_PROCESS_EXIT_CODE=1',
      'NPM_AUDIT_RESULT=FAIL',
      'NPM_AUDIT_FAILURE_REASON=VULNERABILITY_THRESHOLD_EXCEEDED',
    ]));
  });
});

import type { ExecFileException } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  POSTGRES_IMAGE_POLICY_FAILURE_CLASSES,
  POSTGRES_IMAGE_POLICY_STAGES,
  POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS,
  PostgresImagePolicyCommandError,
  postgresImagePolicyCommandDiagnostic,
  runPostgresImagePolicyCommand,
  type ExecFileRunner,
  type PostgresImagePolicyFailureClass,
} from '../../scripts/lib/postgres-image-policy-command';

const secret = 'Bearer fake-registry-secret-marker';

function commandError(
  failureClass: PostgresImagePolicyFailureClass,
): ExecFileException {
  const error = new Error(`${secret} raw stderr`) as ExecFileException;
  if (failureClass === 'TIMEOUT') {
    error.killed = true;
    error.signal = 'SIGKILL';
    return error;
  }
  if (failureClass === 'NONZERO_EXIT') {
    error.code = 17;
    return error;
  }
  error.code = 'ENOENT';
  return error;
}

function failingRunner(failureClass: PostgresImagePolicyFailureClass): ExecFileRunner {
  return (_file, _args, _options, callback) => {
    callback(commandError(failureClass), `${secret} stdout`, `${secret} stderr`);
    callback(commandError('NONZERO_EXIT'), `${secret} late stdout`, `${secret} late stderr`);
  };
}

const failureMatrix = POSTGRES_IMAGE_POLICY_STAGES.flatMap((stage) => (
  POSTGRES_IMAGE_POLICY_FAILURE_CLASSES.map((failureClass) => ({ failureClass, stage }))
));

describe('PostgreSQL image-policy command diagnostics', () => {
  it('defines the complete deterministic 4x3 failure matrix', () => {
    expect(failureMatrix).toHaveLength(12);
  });

  it.each(failureMatrix)(
    'classifies $stage $failureClass without leaking raw diagnostics',
    async ({ failureClass, stage }) => {
      const timeoutMs = POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS[stage];
      let failure: unknown;
      try {
        await runPostgresImagePolicyCommand({
          args: ['test-command'],
          cwd: process.cwd(),
          env: { NODE_ENV: 'test' },
          execFileRunner: failingRunner(failureClass),
          stage,
          timeoutMs,
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(PostgresImagePolicyCommandError);
      const classified = failure as PostgresImagePolicyCommandError;
      expect(classified.stage).toBe(stage);
      expect(classified.failureClass).toBe(failureClass);
      expect(classified.timeoutMs).toBe(
        failureClass === 'TIMEOUT' ? timeoutMs : undefined,
      );

      const diagnostic = postgresImagePolicyCommandDiagnostic(classified);
      expect(diagnostic).toContain(stage);
      expect(diagnostic).toContain(failureClass);
      if (failureClass === 'TIMEOUT') {
        expect(diagnostic).toContain(`timeout_ms=${timeoutMs}`);
      } else {
        expect(diagnostic).not.toContain('timeout_ms=');
      }
      expect(diagnostic).not.toContain(secret);
      expect(diagnostic).not.toContain('stdout');
      expect(diagnostic).not.toContain('stderr');
      expect(diagnostic).toContain('raw Docker diagnostics were withheld');
    },
  );

  it.each(POSTGRES_IMAGE_POLICY_STAGES)(
    'preserves successful stdout behavior for %s',
    async (stage) => {
      const calls: Array<{ file: string; timeout: number | undefined }> = [];
      const runner: ExecFileRunner = (file, _args, options, callback) => {
        calls.push({ file, timeout: options.timeout });
        callback(null, '  verified output  \n', '');
        callback(commandError('NONZERO_EXIT'), '', `${secret} late stderr`);
      };

      await expect(runPostgresImagePolicyCommand({
        args: ['test-command'],
        cwd: process.cwd(),
        env: { NODE_ENV: 'test' },
        execFileRunner: runner,
        stage,
        timeoutMs: POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS[stage],
      })).resolves.toBe('verified output');
      expect(calls).toEqual([{
        file: 'docker',
        timeout: POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS[stage],
      }]);
    },
  );

  it('classifies a synchronous process spawn throw without exposing it', async () => {
    const runner: ExecFileRunner = () => {
      throw new Error(secret);
    };

    let failure: unknown;
    try {
      await runPostgresImagePolicyCommand({
        args: ['test-command'],
        cwd: process.cwd(),
        env: { NODE_ENV: 'test' },
        execFileRunner: runner,
        stage: 'CONTEXT_INSPECT',
        timeoutMs: POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS.CONTEXT_INSPECT,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      failureClass: 'SPAWN_FAILURE',
      stage: 'CONTEXT_INSPECT',
    });
    expect(postgresImagePolicyCommandDiagnostic(failure)).not.toContain(secret);
  });
});

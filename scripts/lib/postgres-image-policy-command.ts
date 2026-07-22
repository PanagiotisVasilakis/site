import {
  execFile,
  type ExecFileException,
  type ExecFileOptionsWithStringEncoding,
} from 'node:child_process';

export const POSTGRES_IMAGE_POLICY_STAGES = [
  'CONTEXT_INSPECT',
  'OCI_INDEX_INSPECT',
  'IMAGE_PULL',
  'LOCAL_IMAGE_INSPECT',
] as const;

export type PostgresImagePolicyStage = typeof POSTGRES_IMAGE_POLICY_STAGES[number];

export const POSTGRES_IMAGE_POLICY_FAILURE_CLASSES = [
  'TIMEOUT',
  'NONZERO_EXIT',
  'SPAWN_FAILURE',
] as const;

export type PostgresImagePolicyFailureClass =
  typeof POSTGRES_IMAGE_POLICY_FAILURE_CLASSES[number];

export const POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS = {
  CONTEXT_INSPECT: 30_000,
  OCI_INDEX_INSPECT: 60_000,
  IMAGE_PULL: 120_000,
  LOCAL_IMAGE_INSPECT: 30_000,
} as const satisfies Record<PostgresImagePolicyStage, number>;

export interface ExecFileRunner {
  (
    file: string,
    args: readonly string[],
    options: ExecFileOptionsWithStringEncoding,
    callback: (
      error: ExecFileException | null,
      stdout: string,
      stderr: string,
    ) => void,
  ): void;
}

const nodeExecFileRunner: ExecFileRunner = (file, args, options, callback) => {
  execFile(file, [...args], options, callback);
};

export class PostgresImagePolicyCommandError extends Error {
  readonly stage: PostgresImagePolicyStage;
  readonly failureClass: PostgresImagePolicyFailureClass;
  readonly timeoutMs?: number;
  readonly exitCode?: number;
  readonly signal?: string;

  constructor(options: {
    stage: PostgresImagePolicyStage;
    failureClass: PostgresImagePolicyFailureClass;
    timeoutMs?: number;
    exitCode?: number;
    signal?: string;
  }) {
    super('The PostgreSQL image-policy external command failed.');
    this.name = 'PostgresImagePolicyCommandError';
    this.stage = options.stage;
    this.failureClass = options.failureClass;
    this.timeoutMs = options.timeoutMs;
    this.exitCode = options.exitCode;
    this.signal = options.signal;
  }
}

function boundedExitCode(code: unknown): number | undefined {
  return typeof code === 'number'
    && Number.isSafeInteger(code)
    && code >= 0
    && code <= 255
    ? code
    : undefined;
}

function boundedSignal(signal: unknown): string | undefined {
  return typeof signal === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(signal)
    ? signal
    : undefined;
}

function classifyFailure(
  stage: PostgresImagePolicyStage,
  timeoutMs: number,
  error: ExecFileException,
): PostgresImagePolicyCommandError {
  const signal = boundedSignal(error.signal);
  if (error.killed === true && signal === 'SIGKILL') {
    return new PostgresImagePolicyCommandError({
      failureClass: 'TIMEOUT',
      stage,
      timeoutMs,
    });
  }

  const exitCode = boundedExitCode(error.code);
  if (exitCode !== undefined || signal !== undefined) {
    return new PostgresImagePolicyCommandError({
      exitCode,
      failureClass: 'NONZERO_EXIT',
      signal,
      stage,
    });
  }

  return new PostgresImagePolicyCommandError({
    failureClass: 'SPAWN_FAILURE',
    stage,
  });
}

export async function runPostgresImagePolicyCommand(options: {
  stage: PostgresImagePolicyStage;
  args: readonly string[];
  timeoutMs: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
  trimOutput?: boolean;
  execFileRunner?: ExecFileRunner;
}): Promise<string> {
  const runner = options.execFileRunner ?? nodeExecFileRunner;

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (operation: () => void): void => {
      if (settled) return;
      settled = true;
      operation();
    };

    try {
      runner('docker', options.args, {
        cwd: options.cwd,
        encoding: 'utf8',
        env: options.env,
        killSignal: 'SIGKILL',
        maxBuffer: 2 * 1024 * 1024,
        timeout: options.timeoutMs,
      }, (error, stdout) => {
        if (error) {
          settle(() => reject(classifyFailure(options.stage, options.timeoutMs, error)));
          return;
        }
        settle(() => resolve(options.trimOutput === false ? stdout : stdout.trim()));
      });
    } catch {
      settle(() => reject(new PostgresImagePolicyCommandError({
        failureClass: 'SPAWN_FAILURE',
        stage: options.stage,
      })));
    }
  });
}

export function postgresImagePolicyCommandDiagnostic(error: unknown): string | undefined {
  if (!(error instanceof PostgresImagePolicyCommandError)) return undefined;

  const metadata: string[] = [error.failureClass];
  if (error.failureClass === 'TIMEOUT' && error.timeoutMs !== undefined) {
    metadata.push(`timeout_ms=${error.timeoutMs}`);
  }
  if (error.failureClass === 'NONZERO_EXIT') {
    if (error.exitCode !== undefined) metadata.push(`exit_code=${error.exitCode}`);
    if (error.signal !== undefined) metadata.push(`signal=${error.signal}`);
  }

  return `Disposable PostgreSQL image verification failed at ${error.stage} `
    + `(${metadata.join('; ')}); raw Docker diagnostics were withheld.`;
}

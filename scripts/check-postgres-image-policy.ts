import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  APPROVED_POSTGRES_IMAGE,
  POSTGRES_IMAGE_INSPECT_FORMAT,
  assertApprovedPostgresImageReference,
  assertApprovedPostgresOciIndex,
  postgresImagePolicyDiagnostic,
  validatePulledPostgresImageInspection,
} from '../tests/integration/support/postgres-image-policy';

const execFileAsync = promisify(execFile);

function dockerEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: 'test', TZ: 'UTC' };
  for (const name of [
    'PATH',
    'HOME',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'CI',
    'NO_COLOR',
    'DOCKER_CONTEXT',
    'DOCKER_HOST',
    'DOCKER_CONFIG',
  ] as const) {
    const value = process.env[name];
    if (value) environment[name] = value;
  }
  return environment;
}

async function docker(
  args: readonly string[],
  timeout: number,
  trimOutput = true,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('docker', [...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: dockerEnvironment(),
      killSignal: 'SIGKILL',
      maxBuffer: 2 * 1024 * 1024,
      timeout,
    });
    return trimOutput ? stdout.trim() : stdout;
  } catch {
    throw new Error(
      'The Docker verification command failed; raw Docker diagnostics were withheld.',
    );
  }
}

async function main(): Promise<void> {
  assertApprovedPostgresImageReference(APPROVED_POSTGRES_IMAGE);

  const rawIndex = await docker([
    'buildx',
    'imagetools',
    'inspect',
    APPROVED_POSTGRES_IMAGE,
    '--raw',
  ], 60_000, false);
  const index = assertApprovedPostgresOciIndex(rawIndex);

  await docker(['pull', '--quiet', APPROVED_POSTGRES_IMAGE], 120_000);
  const rawInspection = await docker([
    'image',
    'inspect',
    APPROVED_POSTGRES_IMAGE,
    '--format',
    POSTGRES_IMAGE_INSPECT_FORMAT,
  ], 30_000);
  const image = validatePulledPostgresImageInspection(rawInspection);

  console.log(
    `Disposable PostgreSQL image policy verified (${index.platforms.join(', ')}; ${image.platform}).`,
  );
}

main().catch((error) => {
  console.error(postgresImagePolicyDiagnostic(error));
  process.exitCode = 1;
});

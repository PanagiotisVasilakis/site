import {
  APPROVED_POSTGRES_IMAGE,
  POSTGRES_IMAGE_INSPECT_FORMAT,
  assertApprovedPostgresImageReference,
  assertApprovedPostgresOciIndex,
  assertLocalDockerEndpoint,
  postgresImagePolicyDiagnostic,
  validatePulledPostgresImageInspection,
} from '../tests/integration/support/postgres-image-policy';
import {
  POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS,
  postgresImagePolicyCommandDiagnostic,
  runPostgresImagePolicyCommand,
  type PostgresImagePolicyStage,
} from './lib/postgres-image-policy-command';

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
  stage: PostgresImagePolicyStage,
  args: readonly string[],
  trimOutput = true,
): Promise<string> {
  return runPostgresImagePolicyCommand({
    args,
    cwd: process.cwd(),
    env: dockerEnvironment(),
    stage,
    timeoutMs: POSTGRES_IMAGE_POLICY_STAGE_TIMEOUT_MS[stage],
    trimOutput,
  });
}

async function assertLocalDockerDaemon(): Promise<void> {
  const rawEndpoint = await docker('CONTEXT_INSPECT', [
    'context',
    'inspect',
    '--format',
    '{{json .Endpoints.docker.Host}}',
  ]);
  assertLocalDockerEndpoint(rawEndpoint);
}

async function main(): Promise<void> {
  assertApprovedPostgresImageReference(APPROVED_POSTGRES_IMAGE);
  await assertLocalDockerDaemon();

  const rawIndex = await docker('OCI_INDEX_INSPECT', [
    'buildx',
    'imagetools',
    'inspect',
    APPROVED_POSTGRES_IMAGE,
    '--raw',
  ], false);
  const index = assertApprovedPostgresOciIndex(rawIndex);

  await docker('IMAGE_PULL', ['pull', '--quiet', APPROVED_POSTGRES_IMAGE]);
  const rawInspection = await docker('LOCAL_IMAGE_INSPECT', [
    'image',
    'inspect',
    APPROVED_POSTGRES_IMAGE,
    '--format',
    POSTGRES_IMAGE_INSPECT_FORMAT,
  ]);
  const image = validatePulledPostgresImageInspection(rawInspection);

  console.log(
    `Disposable PostgreSQL image policy verified (${index.platforms.join(', ')}; ${image.platform}).`,
  );
}

main().catch((error) => {
  console.error(
    postgresImagePolicyCommandDiagnostic(error) ?? postgresImagePolicyDiagnostic(error),
  );
  process.exitCode = 1;
});

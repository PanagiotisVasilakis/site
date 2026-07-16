import { createHash } from 'node:crypto';

export const APPROVED_POSTGRES_REPOSITORY = 'postgres';
export const APPROVED_POSTGRES_TAG = '16-alpine';
export const APPROVED_POSTGRES_INDEX_DIGEST =
  'sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';
export const APPROVED_POSTGRES_IMAGE =
  `${APPROVED_POSTGRES_REPOSITORY}:${APPROVED_POSTGRES_TAG}@${APPROVED_POSTGRES_INDEX_DIGEST}`;
export const APPROVED_POSTGRES_REPO_DIGEST =
  `${APPROVED_POSTGRES_REPOSITORY}@${APPROVED_POSTGRES_INDEX_DIGEST}`;
const APPROVED_POSTGRES_REPO_DIGEST_ALIASES = new Set([
  APPROVED_POSTGRES_REPO_DIGEST,
  `docker.io/library/${APPROVED_POSTGRES_REPO_DIGEST}`,
]);

export const POSTGRES_IMAGE_INSPECT_FORMAT =
  '{"Id":{{json .Id}},"RepoDigests":{{json .RepoDigests}},' +
  '"Architecture":{{json .Architecture}},"Os":{{json .Os}}}';

const OCI_INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json';
const OCI_MANIFEST_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';
const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OFFICIAL_POSTGRES_SOURCE_PATTERN =
  /^https:\/\/github\.com\/docker-library\/postgres\.git#[a-f0-9]{40}:16\/alpine[0-9.]+$/;
const POSTGRES_16_ALPINE_VERSION_PATTERN = /^16\.[0-9]+-alpine[0-9.]+$/;

class PostgresImagePolicyError extends Error {
  constructor(reason: string) {
    super(`Disposable PostgreSQL image policy rejected ${reason}.`);
    this.name = 'PostgresImagePolicyError';
  }
}

function reject(reason: string): never {
  throw new PostgresImagePolicyError(reason);
}

export function assertLocalDockerEndpoint(rawEndpoint: string): void {
  let endpoint: unknown;
  try {
    endpoint = JSON.parse(rawEndpoint);
  } catch {
    return reject('an invalid Docker daemon endpoint');
  }
  if (typeof endpoint !== 'string'
    || (!endpoint.startsWith('unix://') && !endpoint.startsWith('npipe://'))) {
    return reject('a remote Docker daemon endpoint');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRawBytes(rawIndex: string | Uint8Array): Buffer {
  const bytes = typeof rawIndex === 'string'
    ? Buffer.from(rawIndex, 'utf8')
    : Buffer.from(rawIndex);
  if (bytes.length === 0) reject('an empty OCI index');
  return bytes;
}

function parseJsonObject(raw: string, subject: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return reject(`${subject} is not an object`);
    return parsed;
  } catch (error) {
    if (error instanceof PostgresImagePolicyError) throw error;
    return reject(`${subject} is malformed`);
  }
}

function requiredRecord(
  value: unknown,
  reason: string,
): Record<string, unknown> {
  if (!isRecord(value)) return reject(reason);
  return value;
}

function requiredStringRecord(
  value: unknown,
  reason: string,
): Record<string, string> {
  const record = requiredRecord(value, reason);
  if (Object.values(record).some((entry) => typeof entry !== 'string')) {
    return reject(reason);
  }
  return record as Record<string, string>;
}

export interface ApprovedPostgresImageReference {
  repository: typeof APPROVED_POSTGRES_REPOSITORY;
  tag: typeof APPROVED_POSTGRES_TAG;
  digest: typeof APPROVED_POSTGRES_INDEX_DIGEST;
  reference: typeof APPROVED_POSTGRES_IMAGE;
}

export interface ApprovedPostgresOciIndex {
  digest: string;
  mediaType: typeof OCI_INDEX_MEDIA_TYPE;
  platforms: readonly ['linux/amd64', 'linux/arm64/v8'];
}

export interface ApprovedPulledPostgresImage {
  imageId: string;
  repositoryDigest: typeof APPROVED_POSTGRES_REPO_DIGEST;
  platform: 'linux/amd64' | 'linux/arm64';
}

export function assertApprovedPostgresImageReference(
  reference: string,
): ApprovedPostgresImageReference {
  if (reference !== APPROVED_POSTGRES_IMAGE) {
    return reject('an image reference other than the exact approved tag and index digest');
  }
  return {
    repository: APPROVED_POSTGRES_REPOSITORY,
    tag: APPROVED_POSTGRES_TAG,
    digest: APPROVED_POSTGRES_INDEX_DIGEST,
    reference: APPROVED_POSTGRES_IMAGE,
  };
}

function assertPlatformDescriptor(
  descriptor: unknown,
  architecture: 'amd64' | 'arm64',
  variant: 'v8' | undefined,
  bashbrewArchitecture: 'amd64' | 'arm64v8',
): void {
  const manifest = requiredRecord(descriptor, `the linux/${architecture} manifest is malformed`);
  const platform = requiredRecord(
    manifest.platform,
    `the linux/${architecture} platform metadata is malformed`,
  );
  const annotations = requiredStringRecord(
    manifest.annotations,
    `the linux/${architecture} official-image annotations are malformed`,
  );

  if (manifest.mediaType !== OCI_MANIFEST_MEDIA_TYPE
    || typeof manifest.digest !== 'string'
    || !SHA256_DIGEST_PATTERN.test(manifest.digest)
    || !Number.isSafeInteger(manifest.size)
    || (manifest.size as number) <= 0) {
    reject(`the linux/${architecture} OCI manifest descriptor`);
  }
  if (platform.os !== 'linux'
    || platform.architecture !== architecture
    || platform.variant !== variant) {
    reject(`the linux/${architecture} platform identity`);
  }
  if (annotations['com.docker.official-images.bashbrew.arch'] !== bashbrewArchitecture
    || annotations['org.opencontainers.image.url'] !== 'https://hub.docker.com/_/postgres'
    || !OFFICIAL_POSTGRES_SOURCE_PATTERN.test(
      annotations['org.opencontainers.image.source'] ?? '',
    )
    || !POSTGRES_16_ALPINE_VERSION_PATTERN.test(
      annotations['org.opencontainers.image.version'] ?? '',
    )) {
    reject(`the linux/${architecture} official PostgreSQL 16 Alpine provenance`);
  }
}

/**
 * Validates exact registry bytes against a caller-supplied digest and then
 * enforces the semantic PostgreSQL index policy. Runtime callers must use the
 * approved wrapper below; the parameterized form exists for hermetic fixtures.
 */
export function validatePostgresOciIndexMetadata(
  rawIndex: string | Uint8Array,
  expectedDigest: string,
): ApprovedPostgresOciIndex {
  if (!SHA256_DIGEST_PATTERN.test(expectedDigest)) {
    return reject('a malformed expected OCI index digest');
  }
  const bytes = asRawBytes(rawIndex);
  const actualDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actualDigest !== expectedDigest) {
    return reject('OCI index bytes that do not match the approved digest');
  }

  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return reject('OCI index bytes that are not valid UTF-8');
  }
  const index = parseJsonObject(decoded, 'OCI index metadata');
  if (index.schemaVersion !== 2 || index.mediaType !== OCI_INDEX_MEDIA_TYPE) {
    return reject('metadata that is not an OCI image index');
  }
  if (!Array.isArray(index.manifests)) {
    return reject('OCI index manifests that are missing');
  }

  const descriptors = index.manifests.filter(isRecord);
  const amd64 = descriptors.filter((descriptor) => {
    const platform = descriptor.platform;
    return isRecord(platform)
      && platform.os === 'linux'
      && platform.architecture === 'amd64';
  });
  const arm64v8 = descriptors.filter((descriptor) => {
    const platform = descriptor.platform;
    return isRecord(platform)
      && platform.os === 'linux'
      && platform.architecture === 'arm64'
      && platform.variant === 'v8';
  });
  if (amd64.length !== 1 || arm64v8.length !== 1) {
    return reject('a unique linux/amd64 and linux/arm64/v8 platform pair');
  }
  assertPlatformDescriptor(amd64[0], 'amd64', undefined, 'amd64');
  assertPlatformDescriptor(arm64v8[0], 'arm64', 'v8', 'arm64v8');

  return {
    digest: actualDigest,
    mediaType: OCI_INDEX_MEDIA_TYPE,
    platforms: ['linux/amd64', 'linux/arm64/v8'],
  };
}

export function assertApprovedPostgresOciIndex(
  rawIndex: string | Uint8Array,
): ApprovedPostgresOciIndex {
  return validatePostgresOciIndexMetadata(rawIndex, APPROVED_POSTGRES_INDEX_DIGEST);
}

export function validatePulledPostgresImageInspection(
  rawInspection: string | Record<string, unknown>,
): ApprovedPulledPostgresImage {
  const inspection = typeof rawInspection === 'string'
    ? parseJsonObject(rawInspection, 'Docker image inspection')
    : requiredRecord(rawInspection, 'Docker image inspection is malformed');
  const imageId = inspection.Id;
  const repositoryDigests = inspection.RepoDigests;
  const architecture = inspection.Architecture;
  const os = inspection.Os;

  if (typeof imageId !== 'string' || !SHA256_DIGEST_PATTERN.test(imageId)) {
    return reject('a malformed pulled image ID');
  }
  if (!Array.isArray(repositoryDigests)
    || repositoryDigests.length === 0
    || repositoryDigests.some((entry) => (
      typeof entry !== 'string' || !APPROVED_POSTGRES_REPO_DIGEST_ALIASES.has(entry)
    ))) {
    return reject('a pulled image outside the canonical official repository digest');
  }
  if (os !== 'linux' || (architecture !== 'amd64' && architecture !== 'arm64')) {
    return reject('a pulled image outside the approved Linux architectures');
  }

  return {
    imageId,
    repositoryDigest: APPROVED_POSTGRES_REPO_DIGEST,
    platform: `linux/${architecture}`,
  };
}

export function postgresImagePolicyDiagnostic(error: unknown): string {
  if (error instanceof PostgresImagePolicyError) return error.message;
  return 'Disposable PostgreSQL image verification failed; Docker diagnostics were withheld.';
}

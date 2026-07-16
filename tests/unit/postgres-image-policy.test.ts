import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  APPROVED_POSTGRES_IMAGE,
  APPROVED_POSTGRES_INDEX_DIGEST,
  APPROVED_POSTGRES_REPO_DIGEST,
  assertApprovedPostgresImageReference,
  assertApprovedPostgresOciIndex,
  assertLocalDockerEndpoint,
  postgresImagePolicyDiagnostic,
  validatePostgresOciIndexMetadata,
  validatePulledPostgresImageInspection,
} from '../integration/support/postgres-image-policy';
import { startDisposablePostgres } from '../integration/support/database-lifecycle';

const imageId = `sha256:${'1'.repeat(64)}`;

function digest(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

function platformDescriptor(
  architecture: 'amd64' | 'arm64',
  options: { source?: string; variant?: string } = {},
) {
  const bashbrewArchitecture = architecture === 'amd64' ? 'amd64' : 'arm64v8';
  return {
    annotations: {
      'com.docker.official-images.bashbrew.arch': bashbrewArchitecture,
      'org.opencontainers.image.source': options.source
        ?? 'https://github.com/docker-library/postgres.git#' +
          `${'a'.repeat(40)}:16/alpine3.24`,
      'org.opencontainers.image.url': 'https://hub.docker.com/_/postgres',
      'org.opencontainers.image.version': '16.14-alpine3.24',
    },
    digest: `sha256:${architecture === 'amd64' ? '2' : '3'}`.padEnd(71, architecture === 'amd64' ? '2' : '3'),
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    platform: {
      architecture,
      os: 'linux',
      ...(architecture === 'arm64' ? { variant: options.variant ?? 'v8' } : {}),
    },
    size: 3_054,
  };
}

function ociIndex(manifests: unknown[] = [
  platformDescriptor('amd64'),
  platformDescriptor('arm64'),
]): string {
  return JSON.stringify({
    manifests,
    mediaType: 'application/vnd.oci.image.index.v1+json',
    schemaVersion: 2,
  });
}

function validImageInspection() {
  return {
    Architecture: 'amd64',
    Id: imageId,
    Os: 'linux',
    RepoDigests: [APPROVED_POSTGRES_REPO_DIGEST],
  };
}

describe('approved disposable PostgreSQL image reference', () => {
  it('accepts only the exact official tag plus full manifest-list digest', () => {
    expect(assertApprovedPostgresImageReference(APPROVED_POSTGRES_IMAGE)).toEqual({
      digest: APPROVED_POSTGRES_INDEX_DIGEST,
      reference: APPROVED_POSTGRES_IMAGE,
      repository: 'postgres',
      tag: '16-alpine',
    });
  });

  it.each([
    ['tag only', 'postgres:16-alpine'],
    ['digest without tag', `postgres@${APPROVED_POSTGRES_INDEX_DIGEST}`],
    ['short digest', 'postgres:16-alpine@sha256:57c72fd2'],
    [
      'uppercase digest',
      `postgres:16-alpine@sha256:${APPROVED_POSTGRES_INDEX_DIGEST.slice(7).toUpperCase()}`,
    ],
    [
      'wrong repository',
      `example.invalid/postgres:16-alpine@${APPROVED_POSTGRES_INDEX_DIGEST}`,
    ],
    ['wrong tag', `postgres:15-alpine@${APPROVED_POSTGRES_INDEX_DIGEST}`],
    ['well-formed wrong digest', `postgres:16-alpine@sha256:${'f'.repeat(64)}`],
  ])('rejects a %s reference', (_scenario, reference) => {
    expect(() => assertApprovedPostgresImageReference(reference)).toThrow(
      'exact approved tag and index digest',
    );
  });

  it('rejects a mutable runtime override before attempting Docker I/O', async () => {
    const previous = process.env.INTEGRATION_POSTGRES_IMAGE;
    process.env.INTEGRATION_POSTGRES_IMAGE = 'postgres:16-alpine';
    try {
      await expect(startDisposablePostgres()).rejects.toThrow(
        'exact approved tag and index digest',
      );
    } finally {
      if (previous === undefined) delete process.env.INTEGRATION_POSTGRES_IMAGE;
      else process.env.INTEGRATION_POSTGRES_IMAGE = previous;
    }
  });
});

describe('local Docker daemon boundary', () => {
  it.each(['unix:///var/run/docker.sock', 'npipe:////./pipe/docker_engine'])(
    'accepts a local %s endpoint',
    (endpoint) => {
      expect(() => assertLocalDockerEndpoint(JSON.stringify(endpoint))).not.toThrow();
    },
  );

  it.each([
    ['remote TCP endpoint', JSON.stringify('tcp://docker.example.invalid:2376')],
    ['remote SSH endpoint', JSON.stringify('ssh://docker.example.invalid')],
    ['non-string endpoint', JSON.stringify({ host: 'unix:///var/run/docker.sock' })],
    ['malformed response', 'not-json'],
  ])('rejects a %s without echoing it', (_scenario, rawEndpoint) => {
    let diagnostic = '';
    try {
      assertLocalDockerEndpoint(rawEndpoint);
    } catch (error) {
      diagnostic = postgresImagePolicyDiagnostic(error);
    }
    expect(diagnostic).toContain('image policy rejected');
    expect(diagnostic).not.toContain(rawEndpoint);
    expect(diagnostic).not.toContain('docker.example.invalid');
  });
});

describe('PostgreSQL OCI index metadata', () => {
  it('accepts an exact OCI index with official amd64 and arm64/v8 descriptors', () => {
    const raw = ociIndex();
    expect(validatePostgresOciIndexMetadata(raw, digest(raw))).toEqual({
      digest: digest(raw),
      mediaType: 'application/vnd.oci.image.index.v1+json',
      platforms: ['linux/amd64', 'linux/arm64/v8'],
    });
  });

  it('hashes the exact raw bytes before parsing metadata', () => {
    const raw = ociIndex();
    expect(() => validatePostgresOciIndexMetadata(`${raw}\n`, digest(raw))).toThrow(
      'do not match the approved digest',
    );
    expect(() => assertApprovedPostgresOciIndex(raw)).toThrow(
      'do not match the approved digest',
    );
  });

  it('rejects missing, duplicate, or wrongly-versioned required platforms', () => {
    const cases = [
      [platformDescriptor('amd64')],
      [platformDescriptor('amd64'), platformDescriptor('amd64'), platformDescriptor('arm64')],
      [platformDescriptor('amd64'), platformDescriptor('arm64', { variant: 'v7' })],
    ];
    for (const manifests of cases) {
      const raw = ociIndex(manifests);
      expect(() => validatePostgresOciIndexMetadata(raw, digest(raw))).toThrow(
        'unique linux/amd64 and linux/arm64/v8',
      );
    }
  });

  it('rejects platform descriptors without official PostgreSQL provenance', () => {
    const raw = ociIndex([
      platformDescriptor('amd64', { source: 'https://example.invalid/postgres.git' }),
      platformDescriptor('arm64'),
    ]);
    expect(() => validatePostgresOciIndexMetadata(raw, digest(raw))).toThrow(
      'official PostgreSQL 16 Alpine provenance',
    );
  });
});

describe('pulled PostgreSQL image inspection', () => {
  it.each(['amd64', 'arm64'] as const)(
    'accepts the exact canonical repository digest on linux/%s',
    (architecture) => {
      const inspection = { ...validImageInspection(), Architecture: architecture };
      expect(validatePulledPostgresImageInspection(JSON.stringify(inspection))).toEqual({
        imageId,
        platform: `linux/${architecture}`,
        repositoryDigest: APPROVED_POSTGRES_REPO_DIGEST,
      });
    },
  );

  it('accepts canonical Docker Hub aliases and duplicate canonical entries', () => {
    const canonicalAlias = `docker.io/library/${APPROVED_POSTGRES_REPO_DIGEST}`;
    expect(validatePulledPostgresImageInspection({
      ...validImageInspection(),
      RepoDigests: [
        APPROVED_POSTGRES_REPO_DIGEST,
        canonicalAlias,
        canonicalAlias,
      ],
    }).repositoryDigest).toBe(APPROVED_POSTGRES_REPO_DIGEST);
  });

  it.each([
    [
      'wrong repository',
      { RepoDigests: [`example.invalid/postgres@${APPROVED_POSTGRES_INDEX_DIGEST}`] },
    ],
    ['wrong digest', { RepoDigests: [`postgres@sha256:${'f'.repeat(64)}`] }],
    [
      'canonical alias mixed with an unapproved digest',
      { RepoDigests: [APPROVED_POSTGRES_REPO_DIGEST, `postgres@sha256:${'f'.repeat(64)}`] },
    ],
    ['short image ID', { Id: 'sha256:1234' }],
    ['unsupported platform', { Architecture: 's390x' }],
    ['non-Linux image', { Os: 'windows' }],
  ])('rejects a %s inspection', (_scenario, override) => {
    expect(() => validatePulledPostgresImageInspection({
      ...validImageInspection(),
      ...override,
    })).toThrow('image');
  });

  it('never returns raw Docker authentication diagnostics', () => {
    const secret = 'Bearer registry-auth-token-value';
    const diagnostic = postgresImagePolicyDiagnostic(new Error(secret));
    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).toContain('Docker diagnostics were withheld');
  });

  it('does not echo rejected references through policy diagnostics', () => {
    const rejected = 'registry.example.invalid/private/postgres:16-alpine@sha256:token-value';
    let diagnostic = '';
    try {
      assertApprovedPostgresImageReference(rejected);
    } catch (error) {
      diagnostic = postgresImagePolicyDiagnostic(error);
    }
    expect(diagnostic).not.toContain(rejected);
    expect(diagnostic).toContain('image policy rejected');
  });
});

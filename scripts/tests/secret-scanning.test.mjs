import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import { createServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';

import {
  enumerateArtifactPathForTest,
  evaluateHistoricalFindings,
  findForbiddenEnvironmentArtifact,
  formatFinding,
  scanPathForTest,
} from '../check-secrets.mjs';
import {
  buildGeneratedArtifactDispositionContext,
  classifyGeneratedArtifactFinding,
  GENERATED_ARTIFACT_CLASSIFICATIONS,
} from '../lib/generated-artifact-secret-disposition.mjs';

async function withFixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'secret-scanning-test-'));
  try {
    await mkdir(path.join(root, 'nested'), { recursive: true });
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function scanFixture(contents, name = 'nested/input.txt') {
  return withFixture(async (root) => {
    await writeFile(path.join(root, name), contents, { encoding: 'utf8', mode: 0o600 });
    return scanPathForTest(root);
  });
}

test('clean fixture passes', async () => {
  const result = await scanFixture('PUBLIC_LABEL=not-sensitive\n');
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.stale, []);
});

test('synthetic high-entropy credential assignment fails', async () => {
  const marker = [
    'SERVICE_', 'TOKEN="', 'glpat-', 'R1Synthetic7Kp9Vx2Qm4Nz8Wt6Rc3Ld5Hs', '"',
  ].join('');
  const result = await scanFixture(`${marker}\n`);
  assert.ok(result.unexpected.length >= 1);
  assert.ok(result.unexpected.every((finding) => finding.classification === 'secret-assignment'));
});

test('synthetic private key fails', async () => {
  const opening = ['-----BEGIN', ' PRIVATE KEY-----'].join('');
  const closing = ['-----END', ' PRIVATE KEY-----'].join('');
  const result = await scanFixture(`${opening}\n${'A1b2C3d4'.repeat(16)}\n${closing}\n`);
  assert.ok(result.unexpected.some((finding) => finding.classification === 'private-key'));
});

test('credential-bearing database URL fails', async () => {
  const url = [
    'postgresql', '://', 'fixture_operator', ':',
    'Synthetic9Credential7Only', '@', 'db.example.invalid', ':5432/fixture',
  ].join('');
  const result = await scanFixture(`DATABASE_URL=${url}\n`);
  assert.ok(
    result.unexpected.some(
      (finding) => finding.classification === 'credential-bearing-database-url',
    ),
  );
});

test('historical baseline suppresses only its six exact redacted fingerprints', () => {
  const baseline = Array.from({ length: 6 }, (_, index) => ({
    classification: `retired-${index}`,
    fingerprint: `immutable:redacted:${index}`,
  }));
  const exact = baseline.map(({ fingerprint }) => ({ fingerprint }));
  assert.deepEqual(evaluateHistoricalFindings(exact, baseline), {
    unexpected: [],
    missing: [],
  });
  const additional = [...exact, { fingerprint: 'new:unreviewed:finding' }];
  assert.deepEqual(
    evaluateHistoricalFindings(additional, baseline).unexpected,
    [{ fingerprint: 'new:unreviewed:finding' }],
  );
});

test('ignored environment files are rejected from release artifacts', () => {
  assert.equal(
    findForbiddenEnvironmentArtifact(['.next/standalone/.env.production']),
    '.next/standalone/.env.production',
  );
  assert.equal(
    findForbiddenEnvironmentArtifact(['.next/standalone/server.js']),
    undefined,
  );
});

test('finding output is stable and contains no detected material', () => {
  const raw = ['Never', 'Render', 'This', 'Synthetic', 'Credential'].join('');
  const fingerprint = ['01234567', '89abcdef'].join('');
  const output = formatFinding({
    path: 'fixture.txt',
    line: 4,
    column: 2,
    rule: 'assigned-high-entropy-credential',
    classification: 'high-entropy-credential',
    fingerprint,
    raw,
  });
  assert.equal(output.includes(raw), false);
  assert.equal(
    output,
    [
      'path=fixture.txt line=4 column=2 rule=assigned-high-entropy-credential',
      `classification=high-entropy-credential fingerprint=${fingerprint}`,
    ].join(' '),
  );
});

test('accepts an internal relative file symlink and scans its target once', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'z-target.txt'), 'PUBLIC_LABEL=clean\n');
    await symlink('z-target.txt', path.join(root, 'a-link.txt'));
    const artifact = await enumerateArtifactPathForTest(root);
    assert.deepEqual(artifact.symlinks, [{
      relative: 'a-link.txt',
      target: 'z-target.txt',
      targetType: 'file',
    }]);
    assert.deepEqual(
      artifact.files.map((file) => file.relative),
      ['a-link.txt'],
    );
    const result = await scanPathForTest(root);
    assert.deepEqual(result.unexpected, []);
  });
});

test('accepts an internal relative directory symlink', async () => {
  await withFixture(async (root) => {
    await mkdir(path.join(root, 'z-target'));
    await writeFile(path.join(root, 'z-target', 'clean.txt'), 'PUBLIC_LABEL=clean\n');
    await symlink('z-target', path.join(root, 'a-link'));
    const artifact = await enumerateArtifactPathForTest(root);
    assert.deepEqual(artifact.symlinks, [{
      relative: 'a-link',
      target: 'z-target',
      targetType: 'directory',
    }]);
    assert.deepEqual(
      artifact.files.map((file) => file.relative),
      ['a-link/clean.txt'],
    );
  });
});

test('detects and redacts a secret reached through an internal symlink', async () => {
  await withFixture(async (root) => {
    const raw = [
      'glpat-', 'S1Linked8Synthetic4Credential6Never2Render',
    ].join('');
    await mkdir(path.join(root, 'z-target'));
    await writeFile(
      path.join(root, 'z-target', 'input.txt'),
      `SERVICE_TOKEN=\"${raw}\"\n`,
    );
    await symlink('z-target', path.join(root, 'a-link'));
    const result = await scanPathForTest(root);
    assert.ok(result.unexpected.length >= 1);
    assert.ok(result.unexpected.every((finding) => finding.path.startsWith('a-link/')));
    assert.equal(JSON.stringify(result).includes(raw), false);
    assert.equal(
      result.unexpected.map((finding) => formatFinding(finding)).join('\n').includes(raw),
      false,
    );
  });
});

test('rejects a dangling symlink without printing its target', async () => {
  await withFixture(async (root) => {
    const rawTarget = 'missing-sensitive-target-name';
    await symlink(rawTarget, path.join(root, 'dangling'));
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      (error) => (
        /reason=DANGLING_SYMLINK/u.test(error.message)
        && !error.message.includes(rawTarget)
      ),
    );
  });
});

test('rejects an absolute symlink', async () => {
  await withFixture(async (root) => {
    await symlink(path.join(root, 'nested'), path.join(root, 'absolute'));
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      /reason=ABSOLUTE_SYMLINK/u,
    );
  });
});

test('rejects a relative out-of-root symlink and a path-prefix escape', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'secret-prefix-test-'));
  const root = path.join(parent, 'artifact');
  const escape = path.join(parent, 'artifact-escape');
  try {
    await mkdir(root);
    await mkdir(escape);
    await writeFile(path.join(escape, 'input.txt'), 'PUBLIC_LABEL=clean\n');
    await symlink('../artifact-escape', path.join(root, 'escape'));
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      /reason=OUT_OF_ROOT_SYMLINK/u,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('accepts a multi-hop chain that remains inside the artifact', async () => {
  await withFixture(async (root) => {
    await writeFile(path.join(root, 'z-target.txt'), 'PUBLIC_LABEL=clean\n');
    await symlink('z-target.txt', path.join(root, 'b-hop'));
    await symlink('b-hop', path.join(root, 'a-hop'));
    const artifact = await enumerateArtifactPathForTest(root);
    assert.deepEqual(
      artifact.symlinks.map((entry) => [entry.relative, entry.target]),
      [
        ['a-hop', 'z-target.txt'],
        ['b-hop', 'z-target.txt'],
      ],
    );
    assert.deepEqual(
      artifact.files.map((file) => file.relative),
      ['a-hop'],
    );
  });
});

test('rejects a chain whose intermediate hop escapes the artifact', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'secret-hop-test-'));
  const root = path.join(parent, 'artifact');
  const outside = path.join(parent, 'outside');
  try {
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(outside, 'input.txt'), 'PUBLIC_LABEL=clean\n');
    await symlink('../outside', path.join(root, 'b-hop'));
    await symlink('b-hop/input.txt', path.join(root, 'a-hop'));
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      /reason=OUT_OF_ROOT_SYMLINK/u,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('rejects a symlink cycle deterministically', async () => {
  await withFixture(async (root) => {
    await symlink('b-cycle', path.join(root, 'a-cycle'));
    await symlink('a-cycle', path.join(root, 'b-cycle'));
    let firstMessage;
    let secondMessage;
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      (error) => {
        firstMessage = error.message;
        return /reason=CYCLIC_SYMLINK/u.test(error.message);
      },
    );
    await assert.rejects(
      enumerateArtifactPathForTest(root),
      (error) => {
        secondMessage = error.message;
        return /reason=CYCLIC_SYMLINK/u.test(error.message);
      },
    );
    assert.equal(firstMessage, secondMessage);
  });
});

test('duplicate links cannot hide target contents', async () => {
  await withFixture(async (root) => {
    const raw = ['glpat-', 'S1Duplicate3Synthetic5Credential7Only'].join('');
    await mkdir(path.join(root, 'z-target'));
    await writeFile(
      path.join(root, 'z-target', 'input.txt'),
      `SERVICE_TOKEN=\"${raw}\"\n`,
    );
    await symlink('z-target', path.join(root, 'a-link'));
    await symlink('z-target', path.join(root, 'b-link'));
    const artifact = await enumerateArtifactPathForTest(root);
    assert.equal(artifact.symlinks.length, 2);
    assert.equal(artifact.files.length, 1);
    const result = await scanPathForTest(root);
    assert.ok(result.unexpected.length >= 1);
    assert.equal(JSON.stringify(result).includes(raw), false);
  });
});

test('rejects unsupported special filesystem nodes where supported', async () => {
  await withFixture(async (root) => {
    const socket = path.join(root, 'special.sock');
    const server = createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socket, () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      await assert.rejects(
        enumerateArtifactPathForTest(root),
        /reason=UNSUPPORTED_ARTIFACT_ENTRY/u,
      );
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    }
  });
});

test('traversal results and ordering remain stable across repeated runs', async () => {
  await withFixture(async (root) => {
    await mkdir(path.join(root, 'z-target'));
    await writeFile(path.join(root, 'z-target', 'b.txt'), 'PUBLIC_LABEL=b\n');
    await writeFile(path.join(root, 'z-target', 'a.txt'), 'PUBLIC_LABEL=a\n');
    await symlink('z-target', path.join(root, 'a-link'));
    const first = await enumerateArtifactPathForTest(root);
    const second = await enumerateArtifactPathForTest(root);
    const summarize = (artifact) => ({
      files: artifact.files.map((file) => file.relative),
      symlinks: artifact.symlinks,
    });
    assert.deepEqual(summarize(first), summarize(second));
    assert.deepEqual(
      first.files.map((file) => file.relative),
      ['a-link/a.txt', 'a-link/b.txt'],
    );
  });
});

test('the versioned incident baseline remains exactly six fingerprints', async () => {
  const baseline = JSON.parse(await readFile(
    new URL('../../config/secret-scanning/historical-incident-baseline.json', import.meta.url),
    'utf8',
  ));
  assert.equal(baseline.findings.length, 6);
  assert.equal(new Set(baseline.findings.map((finding) => finding.fingerprint)).size, 6);
});

const FRAMEWORK_IDENTIFIER = '1'.repeat(40);
const ACTION_IDENTIFIER = '2'.repeat(40);
const BUILD_IDENTIFIER = '3'.repeat(40);

function fixtureKey(byte) {
  return Buffer.alloc(32, byte).toString('base64');
}

function fixtureBaseline(overrides = []) {
  return {
    findings: Array.from({ length: 6 }, (_, index) => ({
      classification: `retired-fixture-${index}`,
      fingerprint: overrides[index] ?? `fixture:fingerprint:${index}`,
    })),
  };
}

async function writeFixtureFile(root, relative, contents) {
  const absolute = path.join(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, contents, { encoding: 'utf8', mode: 0o600 });
  return absolute;
}

async function withGeneratedArtifactPolicy(options, callback) {
  return withFixture(async (root) => {
    const serverKey = options.serverKey ?? fixtureKey(4);
    const previewModeId = options.previewModeId ?? '5'.repeat(32);
    const previewModeSigningKey = options.previewModeSigningKey ?? '6'.repeat(64);
    const previewModeEncryptionKey = options.previewModeEncryptionKey ?? '7'.repeat(64);
    const actionId = options.actionId === false ? null : ACTION_IDENTIFIER;
    const buildId = options.buildId ?? BUILD_IDENTIFIER;
    const nextVersion = options.nextVersion ?? '16.2.11';
    const serverReference = {
      node: actionId ? { [actionId]: { workers: {}, layer: {} } } : {},
      edge: {},
      encryptionKey: serverKey,
      ...(options.extraServerReferenceField ? { unexpected: true } : {}),
    };
    const preview = {
      previewModeId,
      previewModeSigningKey,
      previewModeEncryptionKey,
    };
    const prerender = {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview,
    };
    const frameworkSource =
      `* @see https://github.com/vercel/next.js/commit/${FRAMEWORK_IDENTIFIER} */`;
    const installedSourceMap = JSON.stringify({
      version: 3,
      sources: ['../../src/client/app-dir/link.tsx'],
      sourcesContent: [frameworkSource],
      names: [],
      mappings: '',
    });
    const artifactSourceMap = JSON.stringify({
      version: 3,
      sources: ['../../../../node_modules/next/src/client/app-dir/link.tsx'],
      sourcesContent: [frameworkSource],
      names: [],
      mappings: '',
    });

    await writeFixtureFile(
      root,
      'node_modules/next/package.json',
      `${JSON.stringify({ version: nextVersion })}\n`,
    );
    for (const relative of [
      'node_modules/next/dist/client/app-dir/link.js.map',
      'node_modules/next/dist/esm/client/app-dir/link.js.map',
    ]) {
      await writeFixtureFile(root, relative, installedSourceMap);
    }
    await writeFixtureFile(root, '.next/BUILD_ID', `${buildId}\n`);

    const artifactContents = new Map([
      [
        '.next/server/server-reference-manifest.js',
        `self.__RSC_SERVER_MANIFEST=${JSON.stringify(serverReference)}`
          + (options.duplicateServerKey ? serverKey : ''),
      ],
      [
        '.next/server/server-reference-manifest.json',
        `${JSON.stringify(serverReference)}\n`,
      ],
      [
        '.next/standalone/.next/server/server-reference-manifest.js',
        `self.__RSC_SERVER_MANIFEST=${JSON.stringify(serverReference)}`,
      ],
      [
        '.next/standalone/.next/server/server-reference-manifest.json',
        `${JSON.stringify(serverReference)}\n`,
      ],
      [
        '.next/standalone/.next/prerender-manifest.json',
        `${JSON.stringify(prerender)}\n`,
      ],
      [
        options.artifactMapPath ?? '.next/server/chunks/ssr/framework.js.map',
        artifactSourceMap,
      ],
      [
        '.next/server/build-identifier.json',
        `${JSON.stringify({ buildId })}\n`,
      ],
      [
        '.next/static/chunks/client.js',
        options.publicLeakPath === '.next/static'
          ? `window.fixture=${JSON.stringify(serverKey)};`
          : 'window.fixture=true;',
      ],
      [
        'public/generated-client.js',
        options.publicLeakPath === 'public'
          ? `window.fixture=${JSON.stringify(serverKey)};`
          : 'window.fixture=true;',
      ],
    ]);
    await writeFixtureFile(root, '.next/prerender-manifest.json', `${JSON.stringify(prerender)}\n`);

    const artifactFiles = [];
    for (const [relative, contents] of artifactContents) {
      const source = await writeFixtureFile(root, relative, contents);
      artifactFiles.push({ relative, source });
    }

    const incidentBaseline = options.incidentBaseline ?? fixtureBaseline();
    const context = buildGeneratedArtifactDispositionContext({
      repositoryRoot: root,
      artifactFiles,
      environment: options.environment ?? {},
      incidentBaseline,
    });
    return callback({
      root,
      context,
      serverKey,
      previewModeId,
      previewModeSigningKey,
      previewModeEncryptionKey,
      actionId,
      buildId,
      artifactContents,
      incidentBaseline,
    });
  });
}

function classifyFixture(context, {
  rule,
  secret,
  relativePath,
  source,
  rawFingerprint = 'fixture:raw:fingerprint',
}) {
  return classifyGeneratedArtifactFinding(context, {
    rule,
    secret,
    relativePath,
    source,
    rawFingerprint,
  });
}

test('valid supported Next internal fields receive framework dispositions', async () => {
  await withGeneratedArtifactPolicy({}, async ({
    context,
    serverKey,
    previewModeId,
    previewModeSigningKey,
    previewModeEncryptionKey,
    artifactContents,
  }) => {
    const cases = [
      [
        serverKey,
        '.next/server/server-reference-manifest.json',
        'server-actions-encryption-key',
      ],
      [
        previewModeId,
        '.next/standalone/.next/prerender-manifest.json',
        'preview-mode-id',
      ],
      [
        previewModeSigningKey,
        '.next/standalone/.next/prerender-manifest.json',
        'preview-mode-signing-key',
      ],
      [
        previewModeEncryptionKey,
        '.next/standalone/.next/prerender-manifest.json',
        'preview-mode-encryption-key',
      ],
    ];
    for (const [secret, relativePath, semanticClass] of cases) {
      const result = classifyFixture(context, {
        rule: 'generic-api-key',
        secret,
        relativePath,
        source: artifactContents.get(relativePath),
      });
      assert.equal(
        result.classification,
        GENERATED_ARTIFACT_CLASSIFICATIONS.INTERNAL_CLASSIFICATION,
      );
      assert.equal(result.semanticClass, semanticClass);
    }
  });
});

test('arbitrary generic key material outside a framework field remains actionable', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context }) => {
    assert.equal(classifyFixture(context, {
      rule: 'generic-api-key',
      secret: fixtureKey(8),
      relativePath: '.next/server/other.json',
      source: '{"ordinary":"field"}',
    }), null);
  });
});

test('unexpected Next manifest schema fails closed', async () => {
  await assert.rejects(
    withGeneratedArtifactPolicy({ extraServerReferenceField: true }, async () => {}),
    /server-reference manifest schema was invalid/u,
  );
});

test('malformed Next internal key encoding fails closed', async () => {
  await assert.rejects(
    withGeneratedArtifactPolicy({ serverKey: 'not-a-supported-key' }, async () => {}),
    /internal material was malformed/u,
  );
});

test('approved server-runtime duplicates receive the same semantic classification', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, serverKey, artifactContents }) => {
    const paths = [
      '.next/server/server-reference-manifest.json',
      '.next/standalone/.next/server/server-reference-manifest.json',
    ];
    const results = paths.map((relativePath) => classifyFixture(context, {
      rule: 'generic-api-key',
      secret: serverKey,
      relativePath,
      source: artifactContents.get(relativePath),
    }));
    assert.deepEqual(
      results.map((result) => result.classification),
      Array(2).fill(GENERATED_ARTIFACT_CLASSIFICATIONS.INTERNAL_CLASSIFICATION),
    );
  });
});

test('Next internal material in client or static output fails closed', async () => {
  for (const publicLeakPath of ['.next/static', 'public']) {
    await assert.rejects(
      withGeneratedArtifactPolicy({ publicLeakPath }, async () => {}),
      /outside its supported server contract/u,
    );
  }
});

test('Next internal material equal to an active application credential fails closed', async () => {
  const serverKey = fixtureKey(9);
  await assert.rejects(
    withGeneratedArtifactPolicy({
      serverKey,
      environment: { SYNTHETIC_APPLICATION_CREDENTIAL: serverKey },
    }, async () => {}),
    /overlapped protected credentials/u,
  );
});

test('Next internal material equal to an incident fingerprint fails closed', async () => {
  const serverKey = fixtureKey(10);
  const fingerprint = createHash('sha256').update(serverKey).digest('hex');
  await assert.rejects(
    withGeneratedArtifactPolicy({
      serverKey,
      incidentBaseline: fixtureBaseline([fingerprint]),
    }, async () => {}),
    /overlapped protected credentials/u,
  );
});

test('unknown Next version fails closed', async () => {
  await assert.rejects(
    withGeneratedArtifactPolicy({ nextVersion: '16.2.12-unknown' }, async () => {}),
    /do not support the installed Next version/u,
  );
});

test('an extra same-value occurrence in an approved file fails closed', async () => {
  await assert.rejects(
    withGeneratedArtifactPolicy({ duplicateServerKey: true }, async () => {}),
    /outside its supported server contract/u,
  );
});

test('prefixed Sourcegraph v2 tokens are never dispositioned', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context }) => {
    assert.equal(classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: `sgp_${'a'.repeat(40)}`,
      relativePath: '.next/server/chunks/ssr/framework.js.map',
      source: 'fixture',
    }), null);
  });
});

test('prefixed Sourcegraph v3 tokens are never dispositioned', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context }) => {
    assert.equal(classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: `sgp_v3_${'b'.repeat(40)}`,
      relativePath: '.next/server/chunks/ssr/framework.js.map',
      source: 'fixture',
    }), null);
  });
});

test('arbitrary unprefixed 40-hex material remains actionable', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context }) => {
    assert.equal(classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: '8'.repeat(40),
      relativePath: '.next/server/chunks/ssr/framework.js.map',
      source: 'fixture',
    }), null);
  });
});

test('known 40-hex material in Sourcegraph or authentication context remains actionable', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, buildId }) => {
    assert.equal(classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: buildId,
      relativePath: '.next/server/build-identifier.json',
      source: `SOURCEGRAPH_ACCESS_TOKEN=${buildId}`,
    }), null);
  });
});

test('exact dynamically derived Next Action IDs receive identifier disposition', async () => {
  await withGeneratedArtifactPolicy({}, async ({
    context,
    actionId,
    artifactContents,
  }) => {
    const result = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: actionId,
      relativePath: '.next/server/server-reference-manifest.json',
      source: artifactContents.get('.next/server/server-reference-manifest.json'),
    });
    assert.equal(
      result.classification,
      GENERATED_ARTIFACT_CLASSIFICATIONS.IDENTIFIER_CLASSIFICATION,
    );
    assert.equal(result.semanticClass, 'next-action-id');
  });
});

test('exact current-build identifiers receive identifier disposition', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, buildId, artifactContents }) => {
    const result = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: buildId,
      relativePath: '.next/server/build-identifier.json',
      source: artifactContents.get('.next/server/build-identifier.json'),
    });
    assert.equal(
      result.classification,
      GENERATED_ARTIFACT_CLASSIFICATIONS.IDENTIFIER_CLASSIFICATION,
    );
    assert.equal(result.semanticClass, 'next-build-id');
  });
});

test('installed Next framework commit provenance is derived without a value allowlist', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, artifactContents }) => {
    const relativePath = '.next/server/chunks/ssr/framework.js.map';
    const result = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: FRAMEWORK_IDENTIFIER,
      relativePath,
      source: artifactContents.get(relativePath),
    });
    assert.equal(
      result.classification,
      GENERATED_ARTIFACT_CLASSIFICATIONS.IDENTIFIER_CLASSIFICATION,
    );
    assert.equal(result.semanticClass, 'next-framework-commit');
  });
});

test('similar but non-identical framework identifiers remain actionable', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, artifactContents }) => {
    const relativePath = '.next/server/chunks/ssr/framework.js.map';
    assert.equal(classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: `${FRAMEWORK_IDENTIFIER.slice(0, -1)}9`,
      relativePath,
      source: artifactContents.get(relativePath),
    }), null);
  });
});

test('repeated known occurrences cannot conceal an unmatched identifier', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, artifactContents }) => {
    const relativePath = '.next/server/chunks/ssr/framework.js.map';
    const known = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: FRAMEWORK_IDENTIFIER,
      relativePath,
      source: artifactContents.get(relativePath),
    });
    const unknown = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: '9'.repeat(40),
      relativePath,
      source: artifactContents.get(relativePath),
    });
    assert.ok(known);
    assert.equal(unknown, null);
  });
});

test('semantic results never serialize raw keys or identifiers', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, serverKey, artifactContents }) => {
    const result = classifyFixture(context, {
      rule: 'generic-api-key',
      secret: serverKey,
      relativePath: '.next/server/server-reference-manifest.json',
      source: artifactContents.get('.next/server/server-reference-manifest.json'),
    });
    assert.equal(JSON.stringify(result).includes(serverKey), false);
    assert.equal(JSON.stringify(result).includes(FRAMEWORK_IDENTIFIER), false);
  });
});

test('semantic disposition output and ordering are deterministic', async () => {
  await withGeneratedArtifactPolicy({}, async ({ context, serverKey, artifactContents }) => {
    const input = {
      rule: 'generic-api-key',
      secret: serverKey,
      relativePath: '.next/server/server-reference-manifest.json',
      source: artifactContents.get('.next/server/server-reference-manifest.json'),
    };
    assert.deepEqual(
      classifyFixture(context, input),
      classifyFixture(context, input),
    );
    assert.deepEqual(
      context.summary.internalKeyClasses,
      [
        'server-actions-encryption-key',
        'preview-mode-id',
        'preview-mode-signing-key',
        'preview-mode-encryption-key',
      ],
    );
  });
});

test('different generated Next key values require no incident-baseline edit', async () => {
  const baseline = fixtureBaseline();
  const classifications = [];
  for (const byte of [11, 12]) {
    await withGeneratedArtifactPolicy({
      serverKey: fixtureKey(byte),
      incidentBaseline: baseline,
    }, async ({ context, serverKey, artifactContents }) => {
      classifications.push(classifyFixture(context, {
        rule: 'generic-api-key',
        secret: serverKey,
        relativePath: '.next/server/server-reference-manifest.json',
        source: artifactContents.get('.next/server/server-reference-manifest.json'),
      }).classification);
    });
  }
  assert.deepEqual(
    classifications,
    Array(2).fill(GENERATED_ARTIFACT_CLASSIFICATIONS.INTERNAL_CLASSIFICATION),
  );
  assert.equal(baseline.findings.length, 6);
});

test('framework identifier classification does not depend on hashed artifact filenames', async () => {
  const artifactMapPath = '.next/server/chunks/ssr/readable-framework-source.js.map';
  await withGeneratedArtifactPolicy({ artifactMapPath }, async ({ context, artifactContents }) => {
    const result = classifyFixture(context, {
      rule: 'sourcegraph-access-token',
      secret: FRAMEWORK_IDENTIFIER,
      relativePath: artifactMapPath,
      source: artifactContents.get(artifactMapPath),
    });
    assert.equal(
      result.classification,
      GENERATED_ARTIFACT_CLASSIFICATIONS.IDENTIFIER_CLASSIFICATION,
    );
  });
});

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  evaluateHistoricalFindings,
  findForbiddenEnvironmentArtifact,
  formatFinding,
  scanPathForTest,
} from '../check-secrets.mjs';

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

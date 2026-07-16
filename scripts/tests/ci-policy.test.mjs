import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { validateWorkflowFile, validateWorkflowText } from '../validate-ci-policy.mjs';

const baselinePath = path.resolve('.github/workflows/ci.yml');
const baseline = await readFile(baselinePath, 'utf8');

async function validateTemporaryFixture(transform) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ci-policy-'));
  const fixturePath = path.join(directory, 'ci.yml');
  try {
    await writeFile(fixturePath, transform(baseline), { encoding: 'utf8', mode: 0o600 });
    return await validateWorkflowFile(fixturePath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function assertRejected(errors, pattern) {
  assert.ok(errors.length > 0, 'fixture unexpectedly passed');
  assert.match(errors.join('\n'), pattern);
}

test('accepts the versioned baseline with full action SHAs and approved image digest', () => {
  assert.deepEqual(validateWorkflowText(baseline), []);
});

test('rejects a floating action tag', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', 'actions/checkout@v7'),
  );
  assertRejected(errors, /full 40-character SHA|restricted command profile/u);
});

test('rejects a non-allowlisted full action SHA', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0', `actions/checkout@${'a'.repeat(40)}`),
  );
  assertRejected(errors, /allowlisted official action commit/u);
});

test('rejects an action fork even when it uses an allowlisted commit text', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('actions/checkout@', 'untrusted/checkout@'));
  assertRejected(errors, /allowlisted official action commit/u);
});

test('rejects pull_request_target', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('  pull_request:', '  pull_request_target:'));
  assertRejected(errors, /pull_request_target|workflow\.on keys/u);
});

test('rejects write permissions', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('  contents: read', '  contents: write'));
  assertRejected(errors, /contents: read only/u);
});

test('rejects job-level token permissions on the aggregate', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('    permissions: {}', '    permissions:\n      contents: write'),
  );
  assertRejected(errors, /jobs\.required\.permissions/u);
});

test('rejects a deployment command', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('run: npm run validate:security', 'run: prisma migrate deploy'),
  );
  assertRejected(errors, /deployment and persistent migration|restricted command profile/u);
});

test('rejects a tag-only PostgreSQL image', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace(
      'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777',
      'postgres:16-alpine',
    ),
  );
  assertRejected(errors, /approved digest|digest-pinned/u);
});

test('rejects self-hosted execution', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('runs-on: ubuntu-24.04', 'runs-on: self-hosted'));
  assertRejected(errors, /self-hosted|ubuntu-24\.04/u);
});

test('rejects a missing timeout', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('    timeout-minutes: 10\n', ''));
  assertRejected(errors, /timeout-minutes|keys must be exactly/u);
});

test('rejects a disabled integration suite', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('run: npm run test:integration', 'run: echo integration-disabled'),
  );
  assertRejected(errors, /restricted command profile/u);
});

test('rejects continue-on-error on the integration suite', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace(
      '      - name: Run disposable PostgreSQL integration suite\n        run: npm run test:integration',
      '      - name: Run disposable PostgreSQL integration suite\n        continue-on-error: true\n        run: npm run test:integration',
    ),
  );
  assertRejected(errors, /keys must be exactly/u);
});

test('rejects a missing stable aggregate gate', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('    name: CI / required', '    name: CI / optional'));
  assertRejected(errors, /CI \/ required/u);
});

test('rejects a weakened aggregate condition', async () => {
  const errors = await validateTemporaryFixture((source) => {
    const requiredJob = source.indexOf('  required:\n');
    return `${source.slice(0, requiredJob)}${source.slice(requiredJob).replace('    if: ${{ always() }}', '    if: ${{ success() }}')}`;
  });
  assertRejected(errors, /jobs\.required\.if must be/u);
});

test('rejects an incomplete aggregate dependency set', async () => {
  const errors = await validateTemporaryFixture((source) => {
    const requiredJob = source.indexOf('  required:\n');
    return `${source.slice(0, requiredJob)}${source.slice(requiredJob).replace('      - production-build\n', '')}`;
  });
  assertRejected(errors, /jobs\.required\.needs/u);
});

test('rejects a weakened aggregate result expression', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('needs.production-build.result', 'needs.production-build.outcome'),
  );
  assertRejected(errors, /restricted command profile/u);
});

test('rejects repository secret access', async () => {
  const errors = await validateTemporaryFixture((source) =>
    source.replace('          BUILD_SITE_URL: https://ci.example.invalid', '          BUILD_SITE_URL: ${{ secrets.PRODUCTION_URL }}'),
  );
  assertRejected(errors, /secrets are forbidden|synthetic CI environment/u);
});

test('rejects unsupported YAML features fail-closed', async () => {
  const errors = await validateTemporaryFixture((source) => source.replace('permissions:', 'permissions: &permissions'));
  assertRejected(errors, /restricted YAML profile/u);
});

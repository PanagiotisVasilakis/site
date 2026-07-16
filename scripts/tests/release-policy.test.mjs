import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { RELEASE_GATES } from '../lib/release-gates.mjs';
import {
  releasePolicyInternals,
  validateReleasePolicy,
} from '../lib/release-policy.mjs';
import { runReleaseVerification } from '../verify-release.mjs';

const APPROVED_IMAGE =
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

async function writeRelative(root, relative, contents) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, contents, { encoding: 'utf8', mode: 0o600 });
}

async function createBaselineFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-policy-'));
  const packageJson = {
    scripts: { ...releasePolicyInternals.expectedPackageScripts },
    dependencies: {},
    devDependencies: {},
  };
  await writeRelative(root, 'package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeRelative(root, 'Makefile', 'PROFILE ?= development\n');
  await writeRelative(
    root,
    'scripts/system-orchestrator.sh',
    '#!/usr/bin/env bash\nPROFILE="development"\n# Runtime profile (default: development)\n',
  );
  await writeRelative(
    root,
    'scripts/verify-release.mjs',
    [
      "import { spawn } from 'node:child_process';",
      "import { RELEASE_GATES } from './lib/release-gates.mjs';",
      "spawn('node', ['--version'], { shell: false });",
      'void RELEASE_GATES;',
      '',
    ].join('\n'),
  );
  const compose = `services:\n  db:\n    image: ${APPROVED_IMAGE}\n`;
  await writeRelative(root, 'docker-compose.yml', compose);
  await writeRelative(root, 'docker/docker-compose.prod.yml', compose);
  await writeRelative(
    root,
    'tests/integration/support/postgres-image-policy.ts',
    [
      "export const APPROVED_POSTGRES_REPOSITORY = 'postgres';",
      "export const APPROVED_POSTGRES_TAG = '16-alpine';",
      "export const APPROVED_POSTGRES_INDEX_DIGEST =",
      "  'sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';",
      '',
    ].join('\n'),
  );
  return root;
}

async function withFixture(callback) {
  const root = await createBaselineFixture();
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function mutatePackage(root, mutate) {
  const filePath = path.join(root, 'package.json');
  const packageJson = JSON.parse(await readFile(filePath, 'utf8'));
  mutate(packageJson);
  await writeFile(filePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

function assertRejected(errors, pattern) {
  assert.ok(errors.length > 0, 'temporary fixture unexpectedly passed');
  assert.match(errors.join('\n'), pattern);
}

function memoryWriter() {
  let contents = '';
  return {
    write(value) {
      contents += String(value);
    },
    contents() {
      return contents;
    },
  };
}

function fixtureGate(id, environment = 'base') {
  return {
    id,
    label: `Fixture ${id}`,
    command: 'node',
    args: ['--version', id],
    environment,
  };
}

test('accepts the restricted local-only release fixture', async () => {
  await withFixture(async (root) => {
    assert.deepEqual(await validateReleasePolicy(root), []);
  });
});

test('rejects any GitHub Actions workflow', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.github/workflows/ci.yml', 'on: [push]\njobs: {}\n');
    assertRejected(await validateReleasePolicy(root), /active GitHub Actions workflows/u);
  });
});

test('rejects a GitHub Pages deployment workflow', async () => {
  await withFixture(async (root) => {
    await writeRelative(
      root,
      '.github/workflows/pages.yml',
      'on: [push]\njobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@0123456789012345678901234567890123456789\n',
    );
    assertRejected(await validateReleasePolicy(root), /workflows\/pages\.yml/u);
  });
});

test('rejects pull_request_target even outside the workflow directory', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, '.github/policy.yml', 'on: pull_request_target\n');
    assertRejected(await validateReleasePolicy(root), /pull_request_target/u);
  });
});

test('rejects a Vercel deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPreview = 'vercel deploy --prod';
    });
    assertRejected(await validateReleasePolicy(root), /Vercel deployment command/u);
  });
});

test('rejects a Wrangler deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishWorker = 'wrangler deploy';
    });
    assertRejected(await validateReleasePolicy(root), /Wrangler deployment command/u);
  });
});

test('rejects a Cloudflare Pages deployment command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPages = 'wrangler pages deploy ./out';
    });
    assertRejected(await validateReleasePolicy(root), /Wrangler Pages deployment command/u);
  });
});

test('rejects a GitHub Pages deployment path', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.publishPages = 'gh-pages -d out';
    });
    assertRejected(await validateReleasePolicy(root), /GitHub Pages deployment command/u);
  });
});

test('rejects a tracked-style GitHub Pages CNAME artifact', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'CNAME', 'www.example.invalid\n');
    assertRejected(await validateReleasePolicy(root), /deployment artifact CNAME/u);
  });
});

test('rejects a tag-only PostgreSQL image', async () => {
  await withFixture(async (root) => {
    await writeRelative(
      root,
      'docker/docker-compose.prod.yml',
      'services:\n  db:\n    image: postgres:16-alpine\n',
    );
    assertRejected(await validateReleasePolicy(root), /digest-pinned PostgreSQL image/u);
  });
});

test('rejects a production-default database mutation', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.migrateProduction =
        'bash scripts/system-orchestrator.sh migrate --profile production';
    });
    assertRejected(await validateReleasePolicy(root), /must not select production by default/u);
  });
});

test('rejects simultaneous staging and production credential consumption', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts.migrateBoth =
        'DATABASE_URL="$STAGING_DATABASE_URL" tool && DATABASE_URL="$PROD_DATABASE_URL" tool';
    });
    assertRejected(await validateReleasePolicy(root), /credentials together/u);
  });
});

test('rejects a deployment command inserted into verify:release', async () => {
  await withFixture(async (root) => {
    const gates = RELEASE_GATES.map((gate) => ({ ...gate, args: [...gate.args] }));
    gates[0] = {
      ...gates[0],
      command: 'vercel',
      args: ['deploy', '--prod'],
    };
    assertRejected(
      await validateReleasePolicy(root, { gates }),
      /forbidden inside verify:release|restricted release-policy profile/u,
    );
  });
});

test('rejects a persistent migration inserted into verify:release', async () => {
  await withFixture(async (root) => {
    const gates = RELEASE_GATES.map((gate) => ({ ...gate, args: [...gate.args] }));
    gates[0] = {
      ...gates[0],
      command: 'prisma',
      args: ['migrate', 'deploy'],
    };
    assertRejected(
      await validateReleasePolicy(root, { gates }),
      /persistent migration commands|restricted release-policy profile/u,
    );
  });
});

test('rejects redirecting a mandatory gate script to a no-op', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:integration'] = 'node --version';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:integration must be exactly/u);
  });
});

test('rejects a pre-hook on the canonical release command', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['preverify:release'] = 'prisma migrate deploy';
    });
    assertRejected(await validateReleasePolicy(root), /lifecycle hook preverify:release is forbidden/u);
  });
});

test('rejects a post-hook on a mandatory gate script', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['posttest:integration'] = 'vercel deploy --prod';
    });
    assertRejected(await validateReleasePolicy(root), /lifecycle hook posttest:integration is forbidden/u);
  });
});

test('rejects hiding a persistent migration behind a mandatory gate script', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:integration'] = 'prisma migrate deploy';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:integration must be exactly/u);
  });
});

test('release orchestrator executes every gate in order with restricted environments', async () => {
  const inheritedName = 'RELEASE_POLICY_TEST_SECRET';
  const previous = process.env[inheritedName];
  process.env[inheritedName] = 'must-not-reach-child';
  try {
    const gates = [
      fixtureGate('base'),
      fixtureGate('integration', 'integration'),
      fixtureGate('production', 'production'),
    ];
    const calls = [];
    const stdout = memoryWriter();
    const stderr = memoryWriter();
    let clock = 0;
    const result = await runReleaseVerification({
      gates,
      runner: async (command, args, environment) => {
        calls.push({ command, args: [...args], environment });
      },
      stdout,
      stderr,
      now: () => {
        clock += 100;
        return clock;
      },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((call) => call.args.at(-1)), ['base', 'integration', 'production']);
    assert.ok(calls.every((call) => call.environment[inheritedName] === undefined));
    assert.equal(calls[0].environment.PGHOST, 'hostile.invalid');
    assert.equal(calls[0].environment.VALID_API_KEYS, '');
    assert.equal(calls[0].environment.GIT_PAGER, 'cat');
    assert.equal(calls[0].environment.GIT_TERMINAL_PROMPT, '0');
    assert.equal(calls[1].environment.INTEGRATION_POSTGRES_IMAGE, APPROVED_IMAGE);
    assert.equal(calls[2].environment.NODE_ENV, 'production');
    assert.equal(calls[2].environment.NEXT_PUBLIC_SITE_URL, 'https://release.example.invalid');
    assert.equal(calls[2].environment.VALID_API_KEYS, '');
    assert.match(stdout.contents(), /PASSED: 3\/3 gates/u);
    assert.equal(stderr.contents(), '');
  } finally {
    if (previous === undefined) delete process.env[inheritedName];
    else process.env[inheritedName] = previous;
  }
});

test('release orchestrator stops at the first failed mandatory gate', async () => {
  const calls = [];
  const stdout = memoryWriter();
  const stderr = memoryWriter();
  const result = await runReleaseVerification({
    gates: [fixtureGate('first'), fixtureGate('second'), fixtureGate('third')],
    runner: async (_command, args) => {
      calls.push(args.at(-1));
      if (args.at(-1) === 'second') throw new Error('synthetic command failure');
    },
    stdout,
    stderr,
  });
  assert.equal(result.ok, false);
  assert.equal(result.failedGate, 'second');
  assert.deepEqual(calls, ['first', 'second']);
  assert.match(stderr.contents(), /Failed gate: Fixture second/u);
  assert.doesNotMatch(stdout.contents(), /Fixture third/u);
});

test('release orchestrator verifies orphan state after an integration failure', async () => {
  const calls = [];
  const result = await runReleaseVerification({
    gates: [fixtureGate('integration', 'integration'), fixtureGate('later')],
    runner: async (command, args) => {
      calls.push([command, ...args].join(' '));
      if (calls.length === 1) throw new Error('synthetic integration failure');
    },
    stdout: memoryWriter(),
    stderr: memoryWriter(),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(calls, [
    'node --version integration',
    'npm --ignore-scripts run check:integration-orphans',
  ]);
});

test('release orchestrator cannot report PASS after an interruption between gates', async () => {
  const calls = [];
  let receivedSignal;
  const result = await runReleaseVerification({
    gates: [fixtureGate('first'), fixtureGate('second')],
    runner: async (_command, args) => {
      calls.push(args.at(-1));
      receivedSignal = 'SIGTERM';
    },
    abortSignal: () => receivedSignal,
    stdout: memoryWriter(),
    stderr: memoryWriter(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.interruptedBy, 'SIGTERM');
  assert.deepEqual(calls, ['first']);
});

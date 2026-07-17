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
    '#!/usr/bin/env bash\nPROFILE="development"\n# Runtime profile (default: development)\nexport HOSTNAME="127.0.0.1"\n',
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
  await writeRelative(root, 'deploy/nginx/cloudflare-ips.json', JSON.stringify({
    version: 1,
    ipv4: ['203.0.113.0/24'],
    ipv6: ['2001:db8::/32'],
  }));
  await writeRelative(root, 'deploy/nginx/includes/cloudflare-realip.conf', 'set_real_ip_from 203.0.113.0/24;\n');
  await writeRelative(root, 'deploy/nginx/includes/cloudflare-geo.conf', '203.0.113.0/24 1;\n');
  await writeRelative(root, 'deploy/nginx/image.lock.json', JSON.stringify({
    repository: 'docker.io/library/nginx',
    digest: 'sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236',
    mediaType: 'application/vnd.oci.image.index.v1+json',
  }));
  await writeRelative(root, 'deploy/nginx/nginx.conf.template', [
    'include /etc/nginx/trusted-ingress/cloudflare-realip.conf;',
    'real_ip_header CF-Connecting-IP;',
    'geo $realip_remote_addr $cloudflare_source {',
    '  include /etc/nginx/trusted-ingress/cloudflare-geo.conf;',
    '}',
    'upstream next_app { server 127.0.0.1:3000; }',
    'proxy_set_header CF-Connecting-IP $verified_client_ip;',
    'proxy_set_header X-Real-IP $verified_client_ip;',
    'proxy_set_header X-Forwarded-For $verified_client_ip;',
    'proxy_set_header Forwarded "";',
    'proxy_set_header X-Origin-Verified-Client-IP $verified_client_ip;',
    'proxy_set_header X-Origin-Proxy-Attestation $origin_proxy_attestation;',
    'ssl_client_certificate /etc/nginx/tls/cloudflare-origin-pull-ca.pem;',
    'ssl_verify_client on;',
    'limit_req_zone $auth_rate_key zone=auth_operations:10m rate=5r/s;',
    'limit_req_zone $public_write_rate_key zone=public_writes:10m rate=10r/s;',
    'limit_req_zone $broad_api_rate_key zone=broad_api:10m rate=30r/s;',
    'limit_conn_zone $binary_remote_addr zone=per_client_connections:10m;',
    'limit_req zone=auth_operations burst=20 nodelay;',
    'limit_req zone=public_writes burst=40 nodelay;',
    'limit_req zone=broad_api burst=60 nodelay;',
    'limit_req_dry_run on;',
    'limit_conn_dry_run on;',
    'limit_req_status 429;',
    'limit_conn per_client_connections 20;',
    'limit_conn_status 429;',
    'log_format safe "limit_req=$limit_req_status limit_conn=$limit_conn_status";',
    '',
  ].join('\n'));
  await writeRelative(root, 'deploy/systemd/qr-city-guide.service', [
    'Environment=HOSTNAME=127.0.0.1',
    'Environment=PORT=3000',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/runtime-env-schema.js', [
    'ORIGIN_PROXY_SHARED_SECRET',
    '64-character hexadecimal secret non-placeholder',
    '',
  ].join('\n'));
  await writeRelative(root, 'src/lib/net/getClientIp.ts', [
    "import { timingSafeEqual } from 'node:crypto';",
    "const ip = 'x-origin-verified-client-ip';",
    "const attestation = 'x-origin-proxy-attestation';",
    'void timingSafeEqual; void ip; void attestation;',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'src/app/api/health/ready/route.ts',
    'async function databaseReady() { return true; }\nfunction checkReadiness() { return databaseReady(); }\n',
  );
  await writeRelative(root, 'src/lib/sensitiveRateLimit.ts', [
    'const prisma = { $transaction: async (callback) => callback({}) };',
    'const ApiErrorCode = { SERVICE_UNAVAILABLE: 503 };',
    'void prisma.$transaction; void ApiErrorCode.SERVICE_UNAVAILABLE;',
    '',
  ].join('\n'));
  await writeRelative(
    root,
    'src/lib/operationalMonitor.ts',
    'const prisma = { rateLimit: { deleteMany() {} } }; void prisma.rateLimit.deleteMany;\n',
  );
  await writeRelative(root, 'docs/security/layered-rate-limiting.md', [
    'Cloudflare Free public reads PostgreSQL dry-run 429 503 key cardinality',
    'false positives new reviewed ADR',
    '',
  ].join('\n'));
  await writeRelative(root, 'docs/deployment/origin-ingress-runbook.md', [
    'firewall IPv4 IPv6 Authenticated Origin Pull Full (strict) rollback rotation',
    '',
  ].join('\n'));
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

test('rejects missing private attestation overwrite', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace(
      'proxy_set_header X-Origin-Proxy-Attestation $origin_proxy_attestation;\n',
      '',
    ));
    assertRejected(await validateReleasePolicy(root), /X-Origin-Proxy-Attestation/u);
  });
});

test('rejects wildcard Nginx proxy trust', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/includes/cloudflare-realip.conf', 'set_real_ip_from 0.0.0.0/0;\n');
    assertRejected(await validateReleasePolicy(root), /wildcard trusted proxy/u);
  });
});

test('rejects canonical X-Forwarded-For append behavior', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, `${config}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n`);
    assertRejected(await validateReleasePolicy(root), /proxy_add_x_forwarded_for/u);
  });
});

test('rejects a Cloudflare manifest without IPv6', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/cloudflare-ips.json', JSON.stringify({
      version: 1,
      ipv4: ['203.0.113.0/24'],
      ipv6: [],
    }));
    assertRejected(await validateReleasePolicy(root), /must contain IPv6/u);
  });
});

test('rejects public publication of the application port', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'docker/docker-compose.prod.yml', [
      'services:',
      '  db:',
      `    image: ${APPROVED_IMAGE}`,
      '  app:',
      '    ports:',
      '      - "3000:3000"',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /application port must not be publicly published/u);
  });
});

test('rejects certificate or private-key material under deploy/nginx', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'deploy/nginx/origin.key', 'synthetic forbidden key material\n');
    assertRejected(await validateReleasePolicy(root), /secret or certificate material is forbidden/u);
  });
});

test('rejects application identity reads from public forwarding headers', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/net/getClientIp.ts', [
      "import { timingSafeEqual } from 'node:crypto';",
      "const ip = 'x-origin-verified-client-ip';",
      "const attestation = 'x-origin-proxy-attestation';",
      "request.headers.get('x-forwarded-for');",
      'void timingSafeEqual; void ip; void attestation;',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /must not read public forwarding headers/u);
  });
});

test('rejects removal of the Nginx syntax integration gate', async () => {
  await withFixture(async (root) => {
    await mutatePackage(root, (packageJson) => {
      packageJson.scripts['test:nginx-ingress'] = 'node --version';
    });
    assertRejected(await validateReleasePolicy(root), /package script test:nginx-ingress must be exactly/u);
  });
});

test('rejects reintroduction of mandatory Upstash configuration', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/external-limiter.ts', 'const value = process.env.UPSTASH_REDIS_REST_URL;\n');
    assertRejected(await validateReleasePolicy(root), /mandatory external rate-limiter configuration/u);
  });
});

test('rejects removal of Nginx rate-limit enforcement semantics', async () => {
  await withFixture(async (root) => {
    const configPath = path.join(root, 'deploy/nginx/nginx.conf.template');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace('limit_req_status 429;\n', ''));
    assertRejected(await validateReleasePolicy(root), /limit_req_status 429/u);
  });
});

test('rejects a non-atomic sensitive PostgreSQL limiter', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/lib/sensitiveRateLimit.ts', [
      'const ApiErrorCode = { SERVICE_UNAVAILABLE: 503 };',
      'void ApiErrorCode.SERVICE_UNAVAILABLE;',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /atomic and fail closed/u);
  });
});

test('rejects an external limiter readiness dependency', async () => {
  await withFixture(async (root) => {
    await writeRelative(root, 'src/app/api/health/ready/route.ts', [
      'async function databaseReady() { return true; }',
      'async function checkReadiness() { await pingUpstash(); return databaseReady(); }',
      '',
    ].join('\n'));
    assertRejected(await validateReleasePolicy(root), /external rate-limiting service/u);
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

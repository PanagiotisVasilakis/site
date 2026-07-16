import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPrismaIntegrityManifest,
  calculatePrismaIntegrity,
  checkPrismaIntegrity,
  parsePrismaIntegrityManifest,
  serializePrismaIntegrityManifest,
  writePrismaIntegrityManifest,
} from '../lib/prisma-integrity.mjs';

function createFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'prisma-integrity-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(path.join(root, 'prisma/migrations/002_second'), { recursive: true });
  mkdirSync(path.join(root, 'prisma/migrations/001_first'), { recursive: true });
  writeFileSync(path.join(root, 'prisma/schema.prisma'), 'model Example {\n  id String @id\n}\n');
  writeFileSync(path.join(root, 'prisma/migrations/002_second/migration.sql'), 'SELECT 2;\n');
  writeFileSync(path.join(root, 'prisma/migrations/001_first/migration.sql'), 'SELECT 1;\n');
  writeFileSync(path.join(root, 'prisma/migrations/migration_lock.toml'), 'provider = "postgresql"\n');
  writePrismaIntegrityManifest(root);
  return root;
}

function manifestPath(root) {
  return path.join(root, 'prisma/integrity-manifest.json');
}

function readManifest(root) {
  return JSON.parse(readFileSync(manifestPath(root), 'utf8'));
}

function replaceManifest(root, mutate) {
  const manifest = readManifest(root);
  mutate(manifest);
  writeFileSync(manifestPath(root), serializePrismaIntegrityManifest(manifest));
}

function expectIntegrityFailure(root, pattern) {
  assert.throws(() => checkPrismaIntegrity(root), pattern);
}

test('generates a deterministic canonical manifest and verifies it', (t) => {
  const root = createFixture(t);
  const first = readFileSync(manifestPath(root), 'utf8');
  const firstManifest = parsePrismaIntegrityManifest(Buffer.from(first));
  writePrismaIntegrityManifest(root);
  const second = readFileSync(manifestPath(root), 'utf8');

  assert.equal(second, first);
  assert.deepEqual(firstManifest, buildPrismaIntegrityManifest(root));
  assert.equal(firstManifest.migrations.fileCount, 3);
  assert.deepEqual(
    firstManifest.migrations.files.map((file) => file.path),
    [
      '001_first/migration.sql',
      '002_second/migration.sql',
      'migration_lock.toml',
    ],
  );
  assert.doesNotThrow(() => checkPrismaIntegrity(root));
});

test('keeps the established migration-tree hashing algorithm deterministic', (t) => {
  const root = createFixture(t);
  const first = calculatePrismaIntegrity(root);
  const copy = path.join(root, 'copy');
  mkdirSync(copy);
  cpSync(path.join(root, 'prisma'), path.join(copy, 'prisma'), { recursive: true });
  unlinkSync(path.join(copy, 'prisma/integrity-manifest.json'));
  const second = calculatePrismaIntegrity(copy);

  assert.equal(first.schema.sha256, second.schema.sha256);
  assert.equal(first.migrations.sha256, second.migrations.sha256);
  assert.equal(first.migrations.fileCount, second.migrations.fileCount);
});

test('rejects a changed Prisma schema', (t) => {
  const root = createFixture(t);
  writeFileSync(path.join(root, 'prisma/schema.prisma'), 'model Changed { id String @id }\n');
  expectIntegrityFailure(root, /schema hash mismatch/u);
});

test('rejects a changed migration', (t) => {
  const root = createFixture(t);
  writeFileSync(path.join(root, 'prisma/migrations/001_first/migration.sql'), 'SELECT 999;\n');
  expectIntegrityFailure(root, /migration file content mismatch: 001_first\/migration\.sql/u);
});

test('rejects a missing migration', (t) => {
  const root = createFixture(t);
  unlinkSync(path.join(root, 'prisma/migrations/001_first/migration.sql'));
  expectIntegrityFailure(root, /migration files are missing: 001_first\/migration\.sql/u);
});

test('rejects an unexpected migration', (t) => {
  const root = createFixture(t);
  mkdirSync(path.join(root, 'prisma/migrations/003_unexpected'));
  writeFileSync(path.join(root, 'prisma/migrations/003_unexpected/migration.sql'), 'SELECT 3;\n');
  expectIntegrityFailure(root, /unexpected migration files exist: 003_unexpected\/migration\.sql/u);
});

test('requires an explicit baseline update for an authorized new migration', (t) => {
  const root = createFixture(t);
  const originalManifest = readFileSync(manifestPath(root), 'utf8');
  mkdirSync(path.join(root, 'prisma/migrations/003_authorized'));
  writeFileSync(path.join(root, 'prisma/migrations/003_authorized/migration.sql'), 'SELECT 3;\n');

  expectIntegrityFailure(root, /unexpected migration files exist: 003_authorized\/migration\.sql/u);
  assert.equal(readFileSync(manifestPath(root), 'utf8'), originalManifest);

  writePrismaIntegrityManifest(root);
  assert.doesNotThrow(() => checkPrismaIntegrity(root));
  assert.equal(readManifest(root).migrations.fileCount, 4);
});

test('rejects a mismatched migration tree hash', (t) => {
  const root = createFixture(t);
  replaceManifest(root, (manifest) => {
    manifest.migrations.sha256 = '0'.repeat(64);
  });
  expectIntegrityFailure(root, /migration tree hash mismatch/u);
});

test('rejects malformed and non-canonical JSON', async (t) => {
  await t.test('malformed JSON', (subtest) => {
    const root = createFixture(subtest);
    writeFileSync(manifestPath(root), '{not-json}\n');
    expectIntegrityFailure(root, /manifest is not valid JSON/u);
  });

  await t.test('non-canonical whitespace', (subtest) => {
    const root = createFixture(subtest);
    writeFileSync(manifestPath(root), `${readFileSync(manifestPath(root), 'utf8')}\n`);
    expectIntegrityFailure(root, /manifest JSON is not in canonical generated form/u);
  });

  await t.test('invalid UTF-8', (subtest) => {
    const root = createFixture(subtest);
    writeFileSync(manifestPath(root), Buffer.from([0xff, 0xfe]));
    expectIntegrityFailure(root, /manifest is not valid UTF-8/u);
  });
});

test('rejects duplicate, unsorted, ambiguous, and count-inconsistent manifest paths', async (t) => {
  await t.test('duplicate path', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.migrations.files.push({ ...manifest.migrations.files[0] });
      manifest.migrations.fileCount += 1;
    });
    expectIntegrityFailure(root, /duplicate migration manifest path/u);
  });

  await t.test('unsorted path', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.migrations.files.reverse();
    });
    expectIntegrityFailure(root, /migration manifest paths are not strictly byte-sorted/u);
  });

  await t.test('ambiguous path', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.migrations.files[0].path = '../migration.sql';
    });
    expectIntegrityFailure(root, /ambiguous migration path segment/u);
  });

  await t.test('inconsistent file count', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.migrations.fileCount += 1;
    });
    expectIntegrityFailure(root, /migration file count does not match the file list/u);
  });
});

test('rejects unsupported versions, unknown fields, and invalid hashes', async (t) => {
  await t.test('unsupported checker version', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.checkerVersion = '2.0.0';
    });
    expectIntegrityFailure(root, /manifest checker version must equal "1\.0\.0"/u);
  });

  await t.test('unknown field', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.unexpected = true;
    });
    expectIntegrityFailure(root, /manifest keys or key order are not canonical/u);
  });

  await t.test('short hash', (subtest) => {
    const root = createFixture(subtest);
    replaceManifest(root, (manifest) => {
      manifest.schema.sha256 = 'abc123';
    });
    expectIntegrityFailure(root, /schema hash must be a lowercase full SHA-256 value/u);
  });
});

test('rejects migration symbolic links', (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic-link creation requires platform-specific privileges on Windows');
    return;
  }
  const root = createFixture(t);
  symlinkSync(
    path.join(root, 'prisma/migrations/001_first/migration.sql'),
    path.join(root, 'prisma/migrations/linked.sql'),
  );
  expectIntegrityFailure(root, /migration symbolic links are not allowed: linked\.sql/u);
});

test('rejects migration special files', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Unix-domain socket fixtures are not supported on Windows');
    return;
  }
  const root = createFixture(t);
  const socketPath = path.join(root, 'prisma/migrations/special.sock');
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    expectIntegrityFailure(root, /migration special files are not allowed: special\.sock/u);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('rejects a symbolic-link manifest instead of following it', (t) => {
  if (process.platform === 'win32') {
    t.skip('symbolic-link creation requires platform-specific privileges on Windows');
    return;
  }
  const root = createFixture(t);
  const realManifest = path.join(root, 'real-manifest.json');
  writeFileSync(realManifest, readFileSync(manifestPath(root)));
  unlinkSync(manifestPath(root));
  symlinkSync(realManifest, manifestPath(root));
  expectIntegrityFailure(root, /Prisma integrity manifest must not be a symbolic link/u);
});

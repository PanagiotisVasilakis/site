import { createHash } from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';

const MANIFEST_FORMAT = 'prisma-integrity-manifest';
const MANIFEST_FORMAT_VERSION = 1;
const GENERATOR_VERSION = '1.0.0';
const CHECKER_VERSION = '1.0.0';
const SCHEMA_RELATIVE_PATH = 'prisma/schema.prisma';
const MIGRATIONS_RELATIVE_ROOT = 'prisma/migrations';
const MANIFEST_RELATIVE_PATH = 'prisma/integrity-manifest.json';

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MIGRATIONS_DOMAIN = Buffer.from('prisma-migrations-v1\0', 'utf8');
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

function fail(message) {
  throw new Error(`Prisma integrity check failed: ${message}`);
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function assertRegularFile(absolutePath, label) {
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    fail(`${label} is missing (${error instanceof Error ? error.message : String(error)})`);
  }

  if (stat.isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
  if (!stat.isFile()) {
    fail(`${label} must be a regular file`);
  }
}

function assertDirectory(absolutePath, label) {
  let stat;
  try {
    stat = lstatSync(absolutePath);
  } catch (error) {
    fail(`${label} is missing (${error instanceof Error ? error.message : String(error)})`);
  }

  if (stat.isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
  if (!stat.isDirectory()) {
    fail(`${label} must be a directory`);
  }
}

function validatePathSegment(segment) {
  if (segment.length === 0 || segment === '.' || segment === '..') {
    fail(`ambiguous migration path segment: ${JSON.stringify(segment)}`);
  }
  if (/[\\/\0\r\n]/u.test(segment)) {
    fail(`ambiguous migration path segment: ${JSON.stringify(segment)}`);
  }
}

function decodePathSegment(rawName) {
  let segment;
  try {
    segment = UTF8_DECODER.decode(rawName);
  } catch {
    fail(`migration path segment is not valid UTF-8: ${rawName.toString('hex')}`);
  }
  if (!Buffer.from(segment, 'utf8').equals(rawName)) {
    fail(`migration path segment has an ambiguous UTF-8 representation: ${rawName.toString('hex')}`);
  }
  validatePathSegment(segment);
  return segment;
}

function validateManifestRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    fail('migration manifest paths must be non-empty strings');
  }
  const segments = relativePath.split('/');
  for (const segment of segments) {
    validatePathSegment(segment);
  }
  return Buffer.from(relativePath, 'utf8');
}

function collectMigrationFiles(migrationsRoot) {
  assertDirectory(migrationsRoot, 'migration root');
  const files = [];

  function visit(directory, prefix = '') {
    const rawNames = readdirSync(directory, { encoding: 'buffer' });
    for (const rawName of rawNames) {
      const name = decodePathSegment(rawName);
      const relativePath = prefix ? `${prefix}/${name}` : name;
      const absolutePath = path.join(directory, name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        fail(`migration symbolic links are not allowed: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath, relativePath);
        continue;
      }
      if (!stat.isFile()) {
        fail(`migration special files are not allowed: ${relativePath}`);
      }

      const content = readFileSync(absolutePath);
      files.push({
        absolutePath,
        relativePath,
        pathBytes: Buffer.from(relativePath, 'utf8'),
        content,
        bytes: content.length,
        sha256: sha256(content),
      });
    }
  }

  visit(migrationsRoot);
  files.sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));

  const seenPathIdentities = new Set();
  for (const file of files) {
    const identity = file.pathBytes.toString('hex');
    if (seenPathIdentities.has(identity)) {
      fail(`duplicate migration relative path: ${file.relativePath}`);
    }
    seenPathIdentities.add(identity);
  }

  return files;
}

function hashMigrationFiles(files) {
  const hash = createHash('sha256');
  hash.update(MIGRATIONS_DOMAIN);
  for (const file of files) {
    hash.update(u64(file.pathBytes.length));
    hash.update(file.pathBytes);
    hash.update(u64(file.content.length));
    hash.update(file.content);
  }
  return hash.digest('hex');
}

export function calculatePrismaIntegrity(repositoryRoot = process.cwd()) {
  const schemaPath = path.join(repositoryRoot, SCHEMA_RELATIVE_PATH);
  const migrationsRoot = path.join(repositoryRoot, MIGRATIONS_RELATIVE_ROOT);
  assertRegularFile(schemaPath, 'Prisma schema');
  const schemaContent = readFileSync(schemaPath);
  const migrationFiles = collectMigrationFiles(migrationsRoot);

  return {
    schema: {
      sha256: sha256(schemaContent),
      bytes: schemaContent.length,
    },
    migrations: {
      sha256: hashMigrationFiles(migrationFiles),
      fileCount: migrationFiles.length,
      files: migrationFiles.map((file) => ({
        path: file.relativePath,
        sha256: file.sha256,
        bytes: file.bytes,
      })),
    },
  };
}

export function buildPrismaIntegrityManifest(repositoryRoot = process.cwd()) {
  const integrity = calculatePrismaIntegrity(repositoryRoot);
  return {
    format: MANIFEST_FORMAT,
    formatVersion: MANIFEST_FORMAT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    checkerVersion: CHECKER_VERSION,
    schema: {
      path: SCHEMA_RELATIVE_PATH,
      sha256: integrity.schema.sha256,
      bytes: integrity.schema.bytes,
    },
    migrations: {
      root: MIGRATIONS_RELATIVE_ROOT,
      treeHashAlgorithm: 'sha256-prisma-migrations-v1',
      sha256: integrity.migrations.sha256,
      fileCount: integrity.migrations.fileCount,
      files: integrity.migrations.files,
    },
  };
}

export function serializePrismaIntegrityManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(`${label} keys or key order are not canonical`);
  }
}

function assertExactValue(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function assertHash(value, label) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail(`${label} must be a lowercase full SHA-256 value`);
  }
}

function assertByteCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer`);
  }
}

function validatePrismaIntegrityManifestShape(manifest) {
  assertExactKeys(
    manifest,
    ['format', 'formatVersion', 'generatorVersion', 'checkerVersion', 'schema', 'migrations'],
    'manifest',
  );
  assertExactValue(manifest.format, MANIFEST_FORMAT, 'manifest format');
  assertExactValue(manifest.formatVersion, MANIFEST_FORMAT_VERSION, 'manifest format version');
  assertExactValue(manifest.generatorVersion, GENERATOR_VERSION, 'manifest generator version');
  assertExactValue(manifest.checkerVersion, CHECKER_VERSION, 'manifest checker version');

  assertExactKeys(manifest.schema, ['path', 'sha256', 'bytes'], 'schema record');
  assertExactValue(manifest.schema.path, SCHEMA_RELATIVE_PATH, 'schema path');
  assertHash(manifest.schema.sha256, 'schema hash');
  assertByteCount(manifest.schema.bytes, 'schema byte count');

  assertExactKeys(
    manifest.migrations,
    ['root', 'treeHashAlgorithm', 'sha256', 'fileCount', 'files'],
    'migrations record',
  );
  assertExactValue(manifest.migrations.root, MIGRATIONS_RELATIVE_ROOT, 'migration root');
  assertExactValue(
    manifest.migrations.treeHashAlgorithm,
    'sha256-prisma-migrations-v1',
    'migration tree hash algorithm',
  );
  assertHash(manifest.migrations.sha256, 'migration tree hash');
  assertByteCount(manifest.migrations.fileCount, 'migration file count');
  if (!Array.isArray(manifest.migrations.files)) {
    fail('migration files must be an array');
  }
  if (manifest.migrations.fileCount !== manifest.migrations.files.length) {
    fail('migration file count does not match the file list');
  }

  let previousPathBytes;
  const seenPaths = new Set();
  for (const [index, file] of manifest.migrations.files.entries()) {
    assertExactKeys(file, ['path', 'sha256', 'bytes'], `migration file ${index}`);
    const pathBytes = validateManifestRelativePath(file.path);
    const pathIdentity = pathBytes.toString('hex');
    if (seenPaths.has(pathIdentity)) {
      fail(`duplicate migration manifest path: ${file.path}`);
    }
    if (previousPathBytes && Buffer.compare(previousPathBytes, pathBytes) >= 0) {
      fail(`migration manifest paths are not strictly byte-sorted at: ${file.path}`);
    }
    seenPaths.add(pathIdentity);
    previousPathBytes = pathBytes;
    assertHash(file.sha256, `migration file hash for ${file.path}`);
    assertByteCount(file.bytes, `migration file byte count for ${file.path}`);
  }

  return manifest;
}

export function parsePrismaIntegrityManifest(content) {
  let text;
  try {
    text = UTF8_DECODER.decode(content);
  } catch {
    fail('manifest is not valid UTF-8');
  }

  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    fail(`manifest is not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }

  validatePrismaIntegrityManifestShape(manifest);
  if (text !== serializePrismaIntegrityManifest(manifest)) {
    fail('manifest JSON is not in canonical generated form');
  }
  return manifest;
}

function compareManifestToCurrentState(manifest, current) {
  if (manifest.schema.sha256 !== current.schema.sha256) {
    fail('Prisma schema hash mismatch');
  }
  if (manifest.schema.bytes !== current.schema.bytes) {
    fail('Prisma schema byte count mismatch');
  }

  const expectedFiles = new Map(manifest.migrations.files.map((file) => [file.path, file]));
  const actualFiles = new Map(current.migrations.files.map((file) => [file.path, file]));

  const missing = [...expectedFiles.keys()].filter((filePath) => !actualFiles.has(filePath));
  if (missing.length > 0) {
    fail(`migration files are missing: ${missing.join(', ')}`);
  }
  const unexpected = [...actualFiles.keys()].filter((filePath) => !expectedFiles.has(filePath));
  if (unexpected.length > 0) {
    fail(`unexpected migration files exist: ${unexpected.join(', ')}`);
  }

  for (const [filePath, expected] of expectedFiles) {
    const actual = actualFiles.get(filePath);
    if (expected.sha256 !== actual.sha256 || expected.bytes !== actual.bytes) {
      fail(`migration file content mismatch: ${filePath}`);
    }
  }

  if (manifest.migrations.fileCount !== current.migrations.fileCount) {
    fail('migration file count mismatch');
  }
  if (manifest.migrations.sha256 !== current.migrations.sha256) {
    fail('migration tree hash mismatch');
  }
}

export function checkPrismaIntegrity(repositoryRoot = process.cwd(), manifestPath) {
  const resolvedManifestPath = manifestPath ?? path.join(repositoryRoot, MANIFEST_RELATIVE_PATH);
  assertRegularFile(resolvedManifestPath, 'Prisma integrity manifest');
  const manifest = parsePrismaIntegrityManifest(readFileSync(resolvedManifestPath));
  const current = calculatePrismaIntegrity(repositoryRoot);
  compareManifestToCurrentState(manifest, current);
  return { manifest, current };
}

export function writePrismaIntegrityManifest(repositoryRoot = process.cwd(), manifestPath) {
  const resolvedManifestPath = manifestPath ?? path.join(repositoryRoot, MANIFEST_RELATIVE_PATH);
  const manifest = buildPrismaIntegrityManifest(repositoryRoot);
  const temporaryPath = `${resolvedManifestPath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, serializePrismaIntegrityManifest(manifest), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
    renameSync(temporaryPath, resolvedManifestPath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // Nothing to clean up when the temporary file was never created.
    }
    throw error;
  }
  return manifest;
}

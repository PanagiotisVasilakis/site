import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const schemaPath = path.join(repositoryRoot, 'prisma/schema.prisma');
const migrationsRoot = path.join(repositoryRoot, 'prisma/migrations');
const migrationsDomain = Buffer.from('prisma-migrations-v1\0', 'utf8');

function u64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(value));
  return bytes;
}

function collectMigrationFiles(directory, prefix = '', files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (/[\0\r\n]/u.test(entry.name)) {
      throw new Error(`Ambiguous migration path segment: ${JSON.stringify(entry.name)}`);
    }

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Migration symbolic links are not hashable: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      collectMigrationFiles(absolutePath, relativePath, files);
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath,
        pathBytes: Buffer.from(relativePath, 'utf8'),
      });
    } else {
      throw new Error(`Migration special files are not hashable: ${relativePath}`);
    }
  }
  return files;
}

function hashMigrationTree() {
  const files = collectMigrationFiles(migrationsRoot);
  files.sort((left, right) => Buffer.compare(left.pathBytes, right.pathBytes));

  const seenPaths = new Set();
  const hash = createHash('sha256');
  hash.update(migrationsDomain);
  for (const file of files) {
    const pathIdentity = file.pathBytes.toString('hex');
    if (seenPaths.has(pathIdentity)) {
      throw new Error(`Duplicate migration relative path: ${file.relativePath}`);
    }
    seenPaths.add(pathIdentity);

    const content = readFileSync(file.absolutePath);
    hash.update(u64(file.pathBytes.length));
    hash.update(file.pathBytes);
    hash.update(u64(content.length));
    hash.update(content);
  }

  return { hash: hash.digest('hex'), fileCount: files.length };
}

const schemaHash = createHash('sha256').update(readFileSync(schemaPath)).digest('hex');
const migrations = hashMigrationTree();
process.stdout.write([
  `prisma_schema_sha256=${schemaHash}`,
  `prisma_migrations_sha256=${migrations.hash}`,
  `prisma_migration_files=${migrations.fileCount}`,
  '',
].join('\n'));

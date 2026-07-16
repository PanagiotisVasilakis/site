import { calculatePrismaIntegrity } from './lib/prisma-integrity.mjs';

const integrity = calculatePrismaIntegrity(process.cwd());
process.stdout.write([
  `prisma_schema_sha256=${integrity.schema.sha256}`,
  `prisma_migrations_sha256=${integrity.migrations.sha256}`,
  `prisma_migration_files=${integrity.migrations.fileCount}`,
  '',
].join('\n'));

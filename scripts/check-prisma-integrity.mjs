#!/usr/bin/env node

import { checkPrismaIntegrity } from './lib/prisma-integrity.mjs';

try {
  const result = checkPrismaIntegrity(process.cwd());
  process.stdout.write(
    `Prisma integrity manifest verified (${result.current.migrations.fileCount} migration files).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

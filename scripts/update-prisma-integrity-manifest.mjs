#!/usr/bin/env node

import { writePrismaIntegrityManifest } from './lib/prisma-integrity.mjs';

try {
  const manifest = writePrismaIntegrityManifest(process.cwd());
  process.stdout.write(
    `Updated prisma/integrity-manifest.json (${manifest.migrations.fileCount} migration files).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

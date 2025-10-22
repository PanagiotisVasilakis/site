import { createHash } from 'node:crypto';

export type MigrationStatus =
  | { status: 'applied'; lastAppliedMigration: string; hash: string }
  | { status: 'none'; message: string }
  | { status: 'unknown'; message: string };

const APPLYING_MIGRATION_REGEX = /Applying migration [`'"]?([^`'"\s]+)[`'"\s]?/i;
const FINISHED_MIGRATION_REGEX = /Migration [`'"]?([^`'"\s]+)[`'"\s]+was successfully applied/i;
const SUCCESSFUL_STEP_REGEX = /✔\s+Applied migration [`'"]?([^`'"\s]+)[`'"\s]?/i;
const ROLLBACK_REGEX = /Rolling back migration [`'"]?([^`'"\s]+)[`'"\s]?/i;
const NO_PENDING_REGEX = /(All migrations have been applied|No pending migrations to deploy)/i;

export function extractLastAppliedMigration(logContent: string): MigrationStatus {
  const lines = logContent.split(/\r?\n/);
  const applied: string[] = [];
  let rolledBack = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (NO_PENDING_REGEX.test(line)) {
      if (applied.length === 0) {
        return {
          status: 'none',
          message: line,
        };
      }
      continue;
    }

    const applyingMatch = line.match(APPLYING_MIGRATION_REGEX);
    if (applyingMatch) {
      applied.push(applyingMatch[1]);
      continue;
    }

    const finishedMatch = line.match(FINISHED_MIGRATION_REGEX);
    if (finishedMatch) {
      applied.push(finishedMatch[1]);
      continue;
    }

    const successMatch = line.match(SUCCESSFUL_STEP_REGEX);
    if (successMatch) {
      applied.push(successMatch[1]);
      continue;
    }

    if (ROLLBACK_REGEX.test(line)) {
      rolledBack = true;
    }
  }

  if (applied.length === 0) {
    const nonEmpty = lines.find((line) => line.trim().length > 0);
    return {
      status: 'unknown',
      message:
        nonEmpty?.trim() ??
        'No migration markers found in Prisma migrate output. Check the log for details.',
    };
  }

  if (rolledBack) {
    return {
      status: 'unknown',
      message:
        'Migrations appear to have been rolled back. Inspect the log for corrective actions.',
    };
  }

  const lastAppliedMigration = applied[applied.length - 1];
  const hash = createHash('sha256').update(lastAppliedMigration).digest('hex');
  return {
    status: 'applied',
    lastAppliedMigration,
    hash,
  };
}

export function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function prefixWithTimestamp(line: string, date: Date = new Date()): string {
  return `[${date.toISOString()}] ${line}`;
}

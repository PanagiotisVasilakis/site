import fs from 'node:fs';
import path from 'node:path';

// Git-ignored scratch parent inside the repository: scripts started from a directory below it still
// find the repository's tsconfig. Resolved when the module loads, while the cwd is the repository root.
const SCRATCH_ROOT = path.resolve('.runtime');
const REPOSITORY_ROOT = process.cwd();

/**
 * Creates a directory that no other test file or vitest run shares (fs.mkdtemp under `.runtime/`),
 * so overlapping runs cannot delete each other's files, and makes it the working directory.
 *
 * The scripts under test read `.env.local`, `package-lock.json` or `node_modules` from their cwd.
 * Entering the directory lets the test address those files by constant relative names, which the
 * `security/detect-non-literal-fs-filename` rule can verify, instead of by a per-run path. Vitest
 * runs every test file in its own process, so the change cannot reach another file; callers restore
 * the cwd with leaveScratchDir.
 */
export function enterScratchDir(prefix: string): string {
  fs.mkdirSync(SCRATCH_ROOT, { recursive: true });
  const directory = fs.mkdtempSync(path.join(SCRATCH_ROOT, `${prefix}-`));
  process.chdir(directory);
  return directory;
}

/** Restores the repository root as the working directory and removes the scratch directory. */
export function leaveScratchDir(directory: string): void {
  process.chdir(REPOSITORY_ROOT);
  fs.rmSync(directory, { recursive: true, force: true });
}

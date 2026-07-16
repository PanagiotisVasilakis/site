#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function git(args) {
  return spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}
function requireCleanCheck(args, subject) {
  const result = git(args);
  if (result.status !== 0) {
    throw new Error(`${subject} contains whitespace errors or could not be inspected.`);
  }
}

try {
  requireCleanCheck(['diff', '--check'], 'Unstaged candidate diff');
  requireCleanCheck(['diff', '--cached', '--check'], 'Staged candidate diff');

  const listed = git(['ls-files', '--others', '--exclude-standard', '-z']);
  if (listed.status !== 0) throw new Error('Untracked candidate files could not be listed.');
  const untracked = listed.stdout.split('\0').filter(Boolean).sort();
  for (const file of untracked) {
    const checked = git(['diff', '--no-index', '--check', '--', '/dev/null', file]);
    const diagnostic = `${checked.stdout ?? ''}${checked.stderr ?? ''}`;
    if ((checked.status !== 0 && checked.status !== 1) || diagnostic.trim() !== '') {
      throw new Error('An untracked candidate file contains whitespace errors or is unreadable.');
    }
  }

  process.stdout.write(
    `Candidate diff whitespace verified (unstaged, staged, ${untracked.length} untracked files).\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Candidate diff check failed.'}\n`);
  process.exitCode = 1;
}

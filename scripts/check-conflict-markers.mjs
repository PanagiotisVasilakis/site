#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tracked = spawnSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (tracked.status !== 0) {
  process.stderr.write(tracked.stderr || 'Unable to list tracked files.\n');
  process.exit(2);
}

function isConflictMarker(line) {
  const markerCharacter = line[0];
  if (!['<', '=', '>', '|'].includes(markerCharacter)) return false;
  const marker = markerCharacter.repeat(7);
  if (!line.startsWith(marker)) return false;
  const suffix = line.slice(marker.length);
  return suffix.length === 0 || suffix.startsWith(' ');
}
const failures = [];

for (const file of tracked.stdout.split('\0').filter(Boolean)) {
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue;
  }

  if (content.includes(0)) continue;

  const lines = content.toString('utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (isConflictMarker(line)) {
      failures.push(`${file}:${index + 1}`);
    }
  });
}

if (failures.length > 0) {
  console.error('Unresolved merge conflict markers found:');
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}

console.log('No unresolved merge conflict markers found.');

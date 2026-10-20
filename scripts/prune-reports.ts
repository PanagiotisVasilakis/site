#!/usr/bin/env tsx
/**
 * Prune old axe report JSON files, keeping the most recent N for each type.
 * Default keep = 5; override with KEEP_REPORTS env var.
 */
import fs from 'node:fs';
import path from 'node:path';

// Digits only: Number() alone accepts " " (0 would delete every report), "0x5" and "1e1".
const rawKeep = process.env.KEEP_REPORTS || '5';
const KEEP = /^\d+$/.test(rawKeep) ? Number(rawKeep) : Number.NaN;
if (!Number.isInteger(KEEP) || KEEP < 0) {
  console.error(`[prune] KEEP_REPORTS must be a whole number >= 0, got "${process.env.KEEP_REPORTS}"`);
  process.exit(1);
}
const cwd = process.cwd();

interface Group { pattern: RegExp; label: string; }
const groups: Group[] = [
  { pattern: /^axe-a11y-report-.*\.json$/, label: 'a11y' },
];

function prune(pattern: RegExp, label: string) {
  const files = fs.readdirSync(cwd)
    .filter(f => pattern.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(cwd, f)).mtime.getTime() }))
    .sort((a,b) => b.mtime - a.mtime);
  if (files.length <= KEEP) {
    console.log(`[prune] ${label}: ${files.length} <= keep(${KEEP}) no action`);
    return;
  }
  const toDelete = files.slice(KEEP);
  for (const d of toDelete) {
    fs.unlinkSync(path.join(cwd, d.f));
    console.log(`[prune] removed ${d.f}`);
  }
  console.log(`[prune] kept ${KEEP} newest ${label} reports (removed ${toDelete.length})`);
}

for (const g of groups) prune(g.pattern, g.label);

#!/usr/bin/env node
/*
 * Lightweight predev checker: warns if SECURITY_PEPPER is not present in env
 * This should not block `npm run dev`; it only prints guidance.
 */
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');

function fileHasPepper(p) {
  try {
    const s = fs.readFileSync(p, 'utf8');
    return /^\s*SECURITY_PEPPER\s*=\s*/m.test(s);
  } catch {
    return false;
  }
}

if (process.env.SECURITY_PEPPER) {
  // Already provided via environment — good.
  process.exit(0);
}

if (fileHasPepper(envPath)) {
  process.exit(0);
}

// No pepper found — warn but do not fail.
console.warn('\n⚠️  SECURITY_PEPPER not found for local development.');
console.warn('Run `npm run ensure-pepper` to generate a local .env.local with a secure value.');
console.warn('Alternatively, set SECURITY_PEPPER in your environment or in .env.local.');
console.warn('This is a development-time helper only — do NOT commit secrets to the repository.\n');

process.exit(0);

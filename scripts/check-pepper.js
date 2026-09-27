#!/usr/bin/env node
/*
 * Lightweight predev checker: warns if SECURITY_PEPPER or CLAIM_TOKEN_PEPPER is
 * missing. It does not block `npm run dev` (the server's environment validation
 * does); it only prints guidance.
 */
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');

function readEnvFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

const envFile = readEnvFile(envPath);
const inEnvFile = {
  SECURITY_PEPPER: /^\s*SECURITY_PEPPER\s*=\s*\S/m,
  CLAIM_TOKEN_PEPPER: /^\s*CLAIM_TOKEN_PEPPER\s*=\s*\S/m,
};
const missing = Object.keys(inEnvFile).filter((name) => !process.env[name] && !inEnvFile[name].test(envFile));

if (missing.length === 0) {
  process.exit(0);
}

// Missing values — warn but do not fail.
console.warn(`\n⚠️  ${missing.join(' and ')} not found for local development.`);
console.warn('Run `npm run ensure-pepper` to generate a local .env.local with a secure value.');
console.warn('Alternatively, set them in your environment or in .env.local.');
console.warn('This is a development-time helper only — do NOT commit secrets to the repository.\n');

process.exit(0);

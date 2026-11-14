import fs from 'fs';
import path from 'path';

export const envPath = path.resolve(process.cwd(), '.env.local');

export function readEnv(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

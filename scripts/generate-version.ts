import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Generate a small version metadata file consumed by client + service worker.
// Strategy: use package.json version + timestamp + optional GIT_COMMIT env.
const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const outFile = path.join(root, 'public', 'version.json');

function main() {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    const version = pkg.version || '0.0.0';
    // Hash precache manifest (ensures cache bust when URL set changes even if version unchanged)
    let precacheHash = '';
    try {
      const precachePath = path.join(root, 'public', 'precache.json');
      const precacheContent = fs.readFileSync(precachePath);
      precacheHash = crypto.createHash('sha256').update(precacheContent).digest('hex');
    } catch {}
    const commit = process.env.GIT_COMMIT || '';
    const ts = new Date().toISOString();
    const data = { version, commit, timestamp: ts, precacheHash };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outFile}: ${JSON.stringify(data)}`);
  } catch (e) {
    console.error('Failed to write version.json', e);
    process.exit(1);
  }
}

main();

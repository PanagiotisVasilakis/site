import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Version metadata for the client (public/version.json). PwaManager registers
// `/sw.js?v=<version>&build=<build>`, so a new build installs a new service
// worker and cache. `build` is the release commit when GIT_COMMIT is set
// (reproducible), otherwise a hash of the version and build time.
const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const outFile = path.join(root, 'public', 'version.json');

function main() {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    const version = pkg.version || '0.0.0';
    const commit = process.env.GIT_COMMIT || '';
    const timestamp = new Date().toISOString();
    const build = commit
      ? commit.slice(0, 12)
      : crypto.createHash('sha256').update(`${version}:${timestamp}`).digest('hex').slice(0, 12);
    const data = { version, commit, build, timestamp };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`Wrote ${outFile}: ${JSON.stringify(data)}`);
  } catch (e) {
    console.error('Failed to write version.json', e);
    process.exit(1);
  }
}

main();

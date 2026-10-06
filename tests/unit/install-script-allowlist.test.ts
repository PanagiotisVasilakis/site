import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
  allowScripts?: Record<string, boolean>;
}

interface Lockfile {
  packages: Record<string, { name?: string; version?: string; hasInstallScript?: boolean }>;
}

// Vitest runs with the repository root as cwd.
const manifests: Array<[string, Manifest, Lockfile]> = [
  [
    'package.json',
    JSON.parse(readFileSync('package.json', 'utf8')) as Manifest,
    JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile,
  ],
  [
    'docker/migrate/package.json',
    JSON.parse(readFileSync('docker/migrate/package.json', 'utf8')) as Manifest,
    JSON.parse(readFileSync('docker/migrate/package-lock.json', 'utf8')) as Lockfile,
  ],
];

// The `name@version` keys npm matches in allowScripts, for every dependency the lockfile marks
// with install scripts (the root entry is the project itself and is never checked). npm matches
// by name and version, not by path, so one key covers every nested copy of the same package.
const scriptBearingPackages = (lock: Lockfile): string[] => [
  ...new Set(
    Object.entries(lock.packages)
      .filter(([path, entry]) => path !== '' && entry.hasInstallScript === true)
      .map(([path, entry]) => {
        const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
        return `${name}@${entry.version}`;
      }),
  ),
].sort();

describe('install-script allowlist (strict-allow-scripts)', () => {
  it.each(manifests)('%s lists exactly the script-bearing packages of its lockfile', (_path, manifest, lock) => {
    expect(Object.keys(manifest.allowScripts ?? {}).sort()).toEqual(scriptBearingPackages(lock));
  });

  it('fails local installs and both image npm ci runs on an unlisted install script', () => {
    expect(readFileSync('.npmrc', 'utf8').split('\n')).toContain('strict-allow-scripts=true');
    const npmCiLines = readFileSync('docker/Dockerfile.security', 'utf8')
      .split('\n')
      .filter((line) => /\bnpm ci\b/.test(line));
    expect(npmCiLines).toHaveLength(2);
    for (const line of npmCiLines) {
      expect(line).toContain('--strict-allow-scripts');
    }
  });
});

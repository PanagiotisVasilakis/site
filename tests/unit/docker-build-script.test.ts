import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const SCRIPTS = ['docker-build.sh', 'image-tag.sh'];

// Stand-in `git`: HEAD is a fixed commit, and the tree is dirty only when FAKE_DIRTY=1.
const GIT_STUB = `#!/bin/sh
case "$1" in
  rev-parse) echo ${COMMIT} ;;
  status) if [ "$FAKE_DIRTY" = 1 ]; then echo ' M file.txt'; fi ;;
esac
exit 0
`;

// Stand-in `docker`: `docker image inspect` answers an image ID; any other call records its arguments.
const DOCKER_STUB = `#!/bin/sh
if [ "$1" = image ]; then echo sha256:fake; exit 0; fi
for arg in "$@"; do printf '%s\\n' "$arg"; done > "$DOCKER_ARGS_FILE"
`;

const BASH = execFileSync('/bin/sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();

let TMP = '';
let BIN = '';
let ARGS = '';

beforeEach(() => {
  TMP = mkdtempSync(path.join(os.tmpdir(), 'docker-build-test-'));
  BIN = path.join(TMP, 'bin');
  ARGS = path.join(TMP, 'docker-args.txt');

  mkdirSync(path.join(TMP, 'scripts'));
  mkdirSync(BIN);
  for (const script of SCRIPTS) {
    copyFileSync(path.join(process.cwd(), 'scripts', script), path.join(TMP, 'scripts', script));
  }
  writeFileSync(path.join(BIN, 'git'), GIT_STUB, { mode: 0o755 });
  writeFileSync(path.join(BIN, 'docker'), DOCKER_STUB, { mode: 0o755 });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function runBuild(env: Record<string, string>) {
  const result = spawnSync(BASH, [path.join(TMP, 'scripts', 'docker-build.sh')], {
    env: {
      PATH: `${BIN}:${process.env.PATH}`,
      NODE_ENV: 'test',
      NEXT_PUBLIC_SITE_URL: 'https://guest.example',
      DOCKER_ARGS_FILE: ARGS,
      ...env,
    },
    encoding: 'utf8',
  });
  const args = existsSync(ARGS) ? readFileSync(ARGS, 'utf8').split('\n') : [];
  return { status: result.status, stderr: result.stderr, args };
}

describe('docker:build script (scripts/docker-build.sh)', () => {
  it('builds a clean tree at the HEAD commit and tags it with the short commit', () => {
    const { status, args } = runBuild({});

    expect(status).toBe(0);
    expect(args).toContain('villa-app:0123456789ab');
    expect(args).toContain(`GIT_COMMIT=${COMMIT}`);
  });

  it('refuses an uncommitted tree without ALLOW_DIRTY=1 and builds nothing', () => {
    const { status, stderr } = runBuild({ FAKE_DIRTY: '1' });

    expect(status).toBe(1);
    expect(stderr).toContain('ALLOW_DIRTY');
    expect(existsSync(ARGS)).toBe(false);
  });

  it('builds a -dirty trial image from an uncommitted tree only with ALLOW_DIRTY=1', () => {
    const { status, args } = runBuild({ FAKE_DIRTY: '1', ALLOW_DIRTY: '1' });

    expect(status).toBe(0);
    expect(args).toContain('villa-app:0123456789ab-dirty');
  });
});

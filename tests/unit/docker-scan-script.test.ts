import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Approved in PROGRESS.md O33: the official Trivy 0.69.3 image by its multi-platform index digest
// (published before the 0.69.4-0.69.6 compromise, GHSA-69fq-xp46-6x23).
const TRIVY_IMAGE = 'aquasec/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c';
const SCRIPT = path.resolve('scripts/docker-scan.sh');
const IMAGE_REF = 'villa-app:0123456789ab';

// Stand-in `docker` CLI: records every invocation (a marker line, then one argument per line),
// emulates `docker save --output <file>` (the real CLI writes the file with mode 0600), records
// the modes of the mounted tarball and its directory at `docker run`, reports the engine and the
// Scout plugin as available, and exits from `docker run` with the status the test asks for.
const DOCKER_STUB = `#!/bin/sh
{ printf '%s\\n' '@@'; for arg in "$@"; do printf '%s\\n' "$arg"; done; } >> "$DOCKER_STUB_LOG"
case "$1" in
  info|scout) exit 0 ;;
  save)
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --output ] || [ "$1" = -o ]; then (umask 077 && printf 'tar' > "$2"); fi
      shift
    done
    exit 0 ;;
  run)
    for arg in "$@"; do
      case "$arg" in
        *:/scan/image.tar:ro)
          tarball="\${arg%:/scan/image.tar:ro}"
          file=$(ls -ln "$tarball") && dir=$(ls -lnd "\${tarball%/*}") &&
            printf '%s %s\\n' "\${dir%% *}" "\${file%% *}" > "$DOCKER_STUB_MODES" ;;
      esac
    done
    exit "$DOCKER_STUB_RUN_EXIT" ;;
esac
exit 99
`;

const BASH = execFileSync('/bin/sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();

// Fixed, git-ignored scratch directory. The bin directories are written once for the file
// (the first exec of a newly written script is slow on some hosts); TMP and the stub's
// records are recreated for every test.
const WORK = path.resolve('.runtime/docker-scan-test');
const BIN = path.join(WORK, 'bin');
const DOCKER_BIN = path.join(WORK, 'docker-bin');
const TMP = path.join(WORK, 'tmp');
const LOG = path.join(WORK, 'docker.log');
const MODES = path.join(WORK, 'modes.txt');

// The script's PATH is BIN alone (plus DOCKER_BIN, which holds only the stub, when a test wants
// Docker), so neither a host Trivy nor the real Docker CLI can be found. These wrappers expose
// only the system tools the script and the stub need.
const TOOL_WRAPPER = '#!/bin/sh\nexport PATH=/usr/bin:/bin\nexec "${0##*/}" "$@"\n';

beforeAll(() => {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(BIN, { recursive: true });
  mkdirSync(DOCKER_BIN);
  writeFileSync(path.join(BIN, 'mktemp'), TOOL_WRAPPER, { mode: 0o755 });
  writeFileSync(path.join(BIN, 'rm'), TOOL_WRAPPER, { mode: 0o755 });
  writeFileSync(path.join(BIN, 'chmod'), TOOL_WRAPPER, { mode: 0o755 });
  writeFileSync(path.join(BIN, 'ls'), TOOL_WRAPPER, { mode: 0o755 });
  writeFileSync(path.join(DOCKER_BIN, 'docker'), DOCKER_STUB, { mode: 0o755 });
});

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  rmSync(LOG, { force: true });
  rmSync(MODES, { force: true });
  mkdirSync(TMP);
});

afterAll(() => rmSync(WORK, { recursive: true, force: true }));

function runScan(scanner: string, { runExit = 0, docker = true }: { runExit?: number; docker?: boolean } = {}) {
  const result = spawnSync(BASH, [SCRIPT, IMAGE_REF], {
    env: {
      ...process.env,
      PATH: docker ? `${DOCKER_BIN}:${BIN}` : BIN,
      TMPDIR: TMP,
      DOCKER_SCAN_SCANNER: scanner,
      DOCKER_STUB_LOG: LOG,
      DOCKER_STUB_MODES: MODES,
      DOCKER_STUB_RUN_EXIT: String(runExit),
    },
    encoding: 'utf8',
  });
  const calls = existsSync(LOG)
    ? readFileSync(LOG, 'utf8').split('@@\n').filter(Boolean).map((call) => call.replace(/\n$/u, '').split('\n'))
    : [];
  return { status: result.status, stderr: result.stderr, calls };
}

function valuesOf(args: string[], ...flags: string[]) {
  return args.flatMap((arg, index) => (flags.includes(arg) ? [args[index + 1]] : []));
}

describe('docker:scan script (scripts/docker-scan.sh)', () => {
  it('pins the approved Trivy image by digest and never references the Docker socket', () => {
    const source = readFileSync(SCRIPT, 'utf8');

    expect(source.match(/aquasec\/trivy[^\s'"]*/gu)).toEqual([TRIVY_IMAGE]);
    expect(source).not.toMatch(/docker\.sock/u);
  });

  it('scans a private docker save tarball, mounted read-only, in the pinned container without the Docker socket', () => {
    const { status, calls } = runScan('trivy-container');

    expect(status).toBe(0);
    expect(calls.map((call) => call[0])).toEqual(['info', 'save', 'run']);

    const [, save, run] = calls;
    const [tarball] = valuesOf(save, '--output', '-o');
    expect(path.basename(tarball)).toBe('image.tar');
    expect(path.dirname(path.dirname(tarball))).toBe(TMP);
    expect(save.at(-1)).toBe(IMAGE_REF);
    // Private directory; the file itself is readable by the container's root, which has no
    // CAP_DAC_OVERRIDE (--cap-drop ALL) and does not own it on a Linux host.
    expect(readFileSync(MODES, 'utf8')).toMatch(/^drwx------\S* -rw-r--r--\S*\n$/u);

    expect(valuesOf(run, '-v', '--volume')).toEqual([
      `${tarball}:/scan/image.tar:ro`,
      'qr-city-guide-trivy-cache:/root/.cache/trivy',
    ]);
    expect(valuesOf(run, '--mount')).toEqual([]);
    expect(run.filter((arg) => arg.includes('docker.sock'))).toEqual([]);
    expect(run).toContain('--read-only');
    expect(valuesOf(run, '--cap-drop')).toEqual(['ALL']);
    expect(valuesOf(run, '--security-opt')).toEqual(['no-new-privileges']);
    expect(run).not.toContain('--privileged');

    const trivyArgs = run.slice(run.indexOf(TRIVY_IMAGE) + 1);
    expect(run.indexOf(TRIVY_IMAGE)).toBeGreaterThan(0);
    expect(trivyArgs[0]).toBe('image');
    expect(valuesOf(trivyArgs, '--input')).toEqual(['/scan/image.tar']);
    expect(valuesOf(trivyArgs, '--exit-code')).toEqual(['1']);
    expect(valuesOf(trivyArgs, '--severity')).toEqual(['HIGH,CRITICAL']);
    expect(valuesOf(trivyArgs, '--scanners')).toEqual(['vuln']);
    expect(trivyArgs).toEqual(expect.arrayContaining(['--skip-version-check', '--disable-telemetry', '--offline-scan']));

    // The tarball and its private directory are removed on exit.
    expect(readdirSync(TMP)).toEqual([]);
  });

  it('fails when Trivy reports HIGH or CRITICAL findings and still removes the tarball', () => {
    const { status, calls } = runScan('trivy-container', { runExit: 1 });

    expect(status).toBe(1);
    expect(calls.map((call) => call[0])).toEqual(['info', 'save', 'run']);
    expect(readdirSync(TMP)).toEqual([]);
  });

  it('prefers the Trivy container over Docker Scout in auto mode when no host Trivy exists', () => {
    const { status, calls } = runScan('auto');

    expect(status).toBe(0);
    expect(calls.map((call) => call[0])).toEqual(['info', 'save', 'run']);
    expect(calls[2]).toContain(TRIVY_IMAGE);
  });

  it('refuses to pass without a scanner', () => {
    for (const scanner of ['trivy-container', 'auto']) {
      const { status, stderr, calls } = runScan(scanner, { docker: false });

      expect(status, scanner).toBe(127);
      expect(stderr, scanner).toContain('Refusing to pass without a scanner.');
      expect(calls, scanner).toEqual([]);
    }
  });
});

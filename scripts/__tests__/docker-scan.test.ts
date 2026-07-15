import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const scanScript = path.join(process.cwd(), 'scripts/docker-scan.sh');

describe('docker scan contract', () => {
  let binDirectory: string;

  beforeEach(async () => {
    binDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'docker-scan-'));
  });

  afterEach(async () => {
    await fs.rm(binDirectory, { recursive: true, force: true });
  });

  async function installMock(name: string, source: string): Promise<void> {
    const file = path.join(binDirectory, name);
    await fs.writeFile(file, `#!/bin/sh\n${source}\n`);
    await fs.chmod(file, 0o755);
  }

  function runScan(extraEnvironment: Record<string, string | undefined> = {}) {
    return spawnSync('/bin/bash', [scanScript, 'fixture:latest'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: binDirectory, ...extraEnvironment },
    });
  }

  it('uses Trivy with an explicit HIGH/CRITICAL exit threshold', async () => {
    const logFile = path.join(binDirectory, 'trivy.log');
    await installMock('trivy', 'printf "%s\\n" "$*" > "$SCAN_LOG"');

    const result = runScan({ SCAN_LOG: logFile });

    expect(result.status).toBe(0);
    expect(await fs.readFile(logFile, 'utf8')).toBe(
      'image --exit-code 1 --severity HIGH,CRITICAL --scanners vuln fixture:latest\n',
    );
  });

  it('uses Docker Scout with its vulnerability exit code when Trivy is unavailable', async () => {
    const logFile = path.join(binDirectory, 'scout.log');
    await installMock('docker', [
      'if [ "$1" = scout ] && [ "$2" = version ]; then exit 0; fi',
      'printf "%s\\n" "$*" > "$SCAN_LOG"',
    ].join('\n'));

    const result = runScan({ SCAN_LOG: logFile });

    expect(result.status).toBe(0);
    expect(await fs.readFile(logFile, 'utf8')).toBe(
      'scout cves --exit-code --only-severity high,critical local://fixture:latest\n',
    );
  });

  it('propagates scanner failures instead of falling back to another tool', async () => {
    const dockerLog = path.join(binDirectory, 'docker.log');
    await installMock('trivy', 'exit 1');
    await installMock('docker', 'touch "$DOCKER_LOG"');

    const result = runScan({ DOCKER_LOG: dockerLog });

    expect(result.status).toBe(1);
    await expect(fs.access(dockerLog)).rejects.toThrow();
  });

  it('fails closed when no supported scanner is installed', () => {
    const result = runScan();

    expect(result.status).toBe(127);
    expect(result.stderr).toContain('Refusing to pass without a scanner');
  });

  it('rejects unknown scanner selections', () => {
    const result = runScan({ DOCKER_SCAN_SCANNER: 'unknown' });

    expect(result.status).toBe(64);
    expect(result.stderr).toContain('expected auto, trivy, or scout');
  });

  it('uses a current pinned base and excludes package managers from the runtime image', async () => {
    const dockerfile = await fs.readFile(path.join(process.cwd(), 'docker/Dockerfile.security'), 'utf8');

    expect(dockerfile).toContain(
      'node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2',
    );
    expect(dockerfile).toContain('apk add --no-cache dumb-init=1.2.5-r4');
    expect(dockerfile).not.toContain('apk upgrade');
    expect(dockerfile).toContain('/usr/local/lib/node_modules/npm');
    expect(dockerfile).toContain('/usr/local/lib/node_modules/corepack');
    expect(dockerfile).toContain('/opt/yarn-*');
  });
});

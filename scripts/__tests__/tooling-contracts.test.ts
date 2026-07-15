import fs from 'node:fs';
import path from 'node:path';

const readRepoFile = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('production tooling contracts', () => {
  it('installs the build toolchain explicitly before authoritative env validation', () => {
    const orchestrator = readRepoFile('scripts/system-orchestrator.sh');
    const bootstrap = orchestrator.slice(
      orchestrator.indexOf('run_bootstrap_sequence()'),
      orchestrator.indexOf('cmd_bootstrap()'),
    );

    expect(orchestrator).toContain('npm ci --include=dev');
    expect(orchestrator).toContain("runtimeEnvSchema.parse(process.env)");
    expect(orchestrator).toContain('node scripts/start-standalone.mjs .next/standalone/server.js');
    expect(orchestrator).toContain('validate_standalone_runtime_tree');
    expect(bootstrap.indexOf('ensure_dependencies')).toBeGreaterThanOrEqual(0);
    expect(bootstrap.indexOf('validate_runtime_environment_contract')).toBeGreaterThan(bootstrap.indexOf('ensure_dependencies'));
  });

  it('keeps the image optimizer cache writable in hardened deployments', () => {
    const dockerfile = readRepoFile('docker/Dockerfile.security');
    const systemdUnit = readRepoFile('deploy/systemd/qr-city-guide.service');

    expect(dockerfile).toContain('mkdir -p /app/.next/cache/images');
    expect(dockerfile).toContain('chmod 0750 /app/.next/cache/images');
    expect(dockerfile).toContain('/app/node_modules/zod ./node_modules/zod');
    expect(dockerfile).toContain('apk add --no-cache dumb-init=1.2.5-r4');
    expect(dockerfile).not.toContain('apk upgrade');
    expect(systemdUnit).toContain('.next/standalone/.next/cache/images');
  });

  it('runs the served PWA asset gate in browser CI', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');

    expect(workflow).toContain('name: Verify served PWA assets');
    expect(workflow).toContain('OFFLINE_CHECK_ORIGIN: http://localhost:3000');
    expect(workflow).toContain('name: Verify real browser offline navigation');
    expect(workflow).toContain('OFFLINE_BROWSER_ORIGIN: http://localhost:3000');
  });

  it('makes the strict container scan part of the required CI gate', () => {
    const workflow = readRepoFile('.github/workflows/ci.yml');
    const deployWorkflow = readRepoFile('.github/workflows/deploy.yml');
    const securityWorkflow = readRepoFile('.github/workflows/security.yml');

    expect(workflow).toContain('name: Container build and strict vulnerability gate');
    expect(workflow).toContain('needs: [build-test, database, browser, container]');
    expect(workflow).toContain('ignore-unfixed: false');
    expect(deployWorkflow).toContain('ignore-unfixed: false');
    expect(securityWorkflow).toContain('ignore-unfixed: false');
    expect(deployWorkflow).not.toContain('ignore-unfixed: true');
    expect(securityWorkflow).not.toContain('ignore-unfixed: true');
  });

  it('uses a real desktop Lighthouse profile instead of mobile throttling defaults', () => {
    const matrix = readRepoFile('scripts/lighthouse-matrix.ts');
    const desktopRunner = readRepoFile('scripts/run-lighthouse-desktop.ts');
    const packageJson = readRepoFile('package.json');

    expect(matrix).toContain('throttling.desktopDense4G');
    expect(matrix).toContain('screenEmulationMetrics.desktop');
    expect(matrix).toContain('deviceScaleFactor');
    expect(matrix).toContain('emulatedUserAgent: true');
    expect(matrix).not.toContain('deviceScaleRatio');
    expect(desktopRunner).toContain('throttling.desktopDense4G');
    expect(desktopRunner).toContain('screenEmulationMetrics.desktop');
    expect(packageJson).toContain('LH_MATRIX_MIN_SCORE=90');
  });
});

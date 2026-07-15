import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('PWA update contract', () => {
  const worker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const manager = readFileSync(resolve(process.cwd(), 'src/components/PwaManager.tsx'), 'utf8');

  it('lets updated workers wait until the user accepts activation', () => {
    const installHandler = worker.slice(
      worker.indexOf("self.addEventListener('install'"),
      worker.indexOf("self.addEventListener('activate'"),
    );
    expect(installHandler).not.toContain('skipWaiting');
    expect(worker).toContain("event.data.type === 'SKIP_WAITING'");
  });

  it('waits for controllerchange before reloading and has no dead install prompt interception', () => {
    expect(manager).toContain("addEventListener('controllerchange'");
    expect(manager.indexOf("addEventListener('controllerchange'")).toBeLessThan(manager.indexOf('window.location.reload()'));
    expect(manager).not.toContain("addEventListener('beforeinstallprompt'");
    expect(manager).not.toContain("getElementById('install-btn'");
  });
});

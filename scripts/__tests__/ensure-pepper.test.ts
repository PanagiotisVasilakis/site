import fs from 'fs';
import path from 'path';
import os from 'os';
import child_process from 'child_process';

test('ensure-pepper creates .env.local with required local secrets when missing and is idempotent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pepper-test-'));
  const script = path.resolve(process.cwd(), 'scripts/ensure-pepper.js');

  // First run: should create .env.local with required local-only values.
  const r1 = child_process.spawnSync(process.execPath, [script], { cwd: tmp, encoding: 'utf8' });
  expect(r1.status === 0 || r1.status === null).toBeTruthy();
  const envPath = path.join(tmp, '.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  expect(/SECURITY_PEPPER=[0-9a-f]{64}/.test(content)).toBeTruthy();
  expect(/SECURITY_ENC_KEY_HEX=[0-9a-f]{64}/.test(content)).toBeTruthy();
  expect(/GUEST_JWT_SECRET=[0-9a-f]{64}/.test(content)).toBeTruthy();
  expect(/GUEST_WIFI_NETWORK=local-guest-network/.test(content)).toBeTruthy();
  expect(/GUEST_WIFI_PASSWORD=[A-Za-z0-9_-]{20,}/.test(content)).toBeTruthy();

  // Second run: should be idempotent and mention already present
  const r2 = child_process.spawnSync(process.execPath, [script], { cwd: tmp, encoding: 'utf8' });
  // r2.stdout may contain 'already present' message
  expect(r2.stdout + r2.stderr).toMatch(/All expected secrets present/);

  // cleanup
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

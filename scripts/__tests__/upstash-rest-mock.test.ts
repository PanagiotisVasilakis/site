import type { AddressInfo } from 'node:net';
import { startUpstashRestMock } from '../upstash-rest-mock';

const token = 'test-upstash-token-at-least-20-characters';

describe('CI Upstash REST mock', () => {
  it('requires authentication and preserves atomic counter semantics', async () => {
    const server = await startUpstashRestMock({ token });

    try {
      const address = server.address() as AddressInfo;
      const base = `http://127.0.0.1:${address.port}`;
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

      expect((await fetch(`${base}/healthz`)).status).toBe(200);
      expect((await fetch(`${base}/ping`, { headers })).status).toBe(200);
      expect((await fetch(`${base}/ping`)).status).toBe(401);

      const command = ['EVAL', 'script contents are intentionally ignored by the mock', 1, 'rate:test', 60_000];
      const first = await fetch(base, { method: 'POST', headers, body: JSON.stringify(command) });
      const second = await fetch(base, { method: 'POST', headers, body: JSON.stringify(command) });

      await expect(first.json()).resolves.toEqual({ result: [1, expect.any(Number)] });
      await expect(second.json()).resolves.toEqual({ result: [2, expect.any(Number)] });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});

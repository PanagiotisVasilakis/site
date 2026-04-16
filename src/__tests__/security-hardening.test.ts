import { NextRequest } from 'next/server';

function makeReq(url: string, init?: RequestInit & { cookies?: Record<string, string> }) {
  const base = new URL(url, 'http://localhost');
  const headers = new Headers(init?.headers);
  if (init?.cookies) {
    const cookie = Object.entries(init.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers.set('cookie', cookie);
  }

  return new NextRequest(base, {
    method: init?.method,
    headers,
    body: init?.body,
  });
}

describe('Security hardening regressions', () => {
  it('requires auth to read check-in preferences', async () => {
    const { GET } = await import('@/app/api/check-in/preferences/route');
    const res = await GET(makeReq('/api/check-in/preferences') as any, { params: {} } as any);
    expect(res.status).toBe(401);
  });

  it('requires admin to update check-in preferences', async () => {
    const { POST } = await import('@/app/api/check-in/preferences/route');
    const req = makeReq('/api/check-in/preferences', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checkInTime: '15:00', checkOutTime: '11:00' }),
    });

    const res = await POST(req as any, { params: {} } as any);
    expect(res.status).toBe(403);
  });

  it('requires admin to access alerts API', async () => {
    const { GET } = await import('@/app/api/alerts/route');
    const res = await GET(makeReq('/api/alerts') as any, { params: {} } as any);
    expect(res.status).toBe(403);
  });

  it('requires admin or API key to access metrics API', async () => {
    const { GET } = await import('@/app/api/metrics/route');
    const res = await GET(makeReq('/api/metrics') as any, { params: {} } as any);
    expect(res.status).toBe(403);
  });

  it('fails closed when webhook token is not configured', async () => {
    const previous = process.env.ALERT_WEBHOOK_TOKEN;
    delete process.env.ALERT_WEBHOOK_TOKEN;

    try {
      const { POST } = await import('@/app/api/alerts/webhook/route');
      const req = makeReq('/api/alerts/webhook', {
        method: 'POST',
        headers: {
          authorization: 'Bearer anything',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ alert: { id: 'a1' }, timestamp: Date.now() }),
      });

      const res = await POST(req as any, { params: {} } as any);
      expect(res.status).toBe(503);
    } finally {
      if (previous) {
        process.env.ALERT_WEBHOOK_TOKEN = previous;
      }
    }
  });

  it('rejects invalid webhook token', async () => {
    const previous = process.env.ALERT_WEBHOOK_TOKEN;
    process.env.ALERT_WEBHOOK_TOKEN = 'correct-secret';

    try {
      const { POST } = await import('@/app/api/alerts/webhook/route');
      const req = makeReq('/api/alerts/webhook', {
        method: 'POST',
        headers: {
          authorization: 'Bearer wrong-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ alert: { id: 'a1' }, timestamp: Date.now() }),
      });

      const res = await POST(req as any, { params: {} } as any);
      expect(res.status).toBe(401);
    } finally {
      if (previous) {
        process.env.ALERT_WEBHOOK_TOKEN = previous;
      } else {
        delete process.env.ALERT_WEBHOOK_TOKEN;
      }
    }
  });
});

import { describe, expect, it } from 'vitest';

import { GET as getLive, HEAD as headLive } from '@/app/api/health/live/route';

describe('public route contracts', () => {
  it('returns a timestamped liveness response without dependency details', async () => {
    const response = getLive();
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.status).toBe('alive');
    expect(Date.parse(String(body.timestamp))).not.toBeNaN();
    expect(body).not.toHaveProperty('database');
    expect(headLive().status).toBe(200);
  });
});

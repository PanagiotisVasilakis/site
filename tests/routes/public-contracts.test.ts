import { describe, expect, it } from 'vitest';

import { GET as getCategories } from '@/app/api/categories/route';
import { GET as getOpenApi } from '@/app/api/docs/openapi/route';
import { GET as getHealth, HEAD as headHealth } from '@/app/api/health/route';
import { GET as getLive, HEAD as headLive } from '@/app/api/health/live/route';

describe('public route contracts', () => {
  it('keeps the compatibility health endpoint minimal and non-cacheable', async () => {
    const response = getHealth();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'alive' });
    const head = headHealth();
    expect(head.status).toBe(200);
    expect(head.headers.get('cache-control')).toBe('no-store');
    expect(await head.text()).toBe('');
  });

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

  it('publishes a valid OpenAPI document with bounded caching', async () => {
    const response = await getOpenApi();
    const body = await response.json() as { openapi: string; paths: Record<string, unknown> };
    expect(body.openapi).toMatch(/^3\.\d+\.\d+$/);
    expect(Object.keys(body.paths).length).toBeGreaterThan(20);
    expect(body.paths).toHaveProperty('/health');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('returns only public category summary fields', async () => {
    const response = await getCategories();
    const body = await response.json() as { categories: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
    expect(body.categories.length).toBeGreaterThan(0);
    body.categories.forEach((category) => {
      expect(Object.keys(category).sort()).toEqual(['count', 'id', 'slug', 'title']);
      expect(category.count).toEqual(expect.any(Number));
    });
  });
});

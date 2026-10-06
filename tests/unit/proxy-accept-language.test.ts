import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://guide.example';

// The proxy builds its security middleware when it is imported, from NODE_ENV,
// so each request re-imports it under the production configuration.
async function runProxy(path: string, headers: Record<string, string> = {}) {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const { proxy } = await import('@/proxy');
  return proxy(new NextRequest(`${ORIGIN}${path}`, { headers }));
}

// identity §12 R3-V9: a first visit without a `lang` cookie gets Greek when Accept-Language prefers it.
describe('proxy locale for a first visit (Accept-Language)', () => {
  it.each([
    ['el-GR,el;q=0.9,en;q=0.8', 'el'],
    ['EL-gr', 'el'],
    ['en-US,en;q=0.9,el;q=0.8', 'en'],
    ['en;q=0.5,el;q=0.8', 'el'],
    ['el;q=0.3,en;q=0.7', 'en'],
    ['de-DE,el;q=0.5', 'el'],
    ['fr,el;q=0', 'en'],
    ['*', 'en'],
    ['el;q=0.8,en;q=0.8', 'el'],
    ['en;q=0.8,el;q=0.8', 'en'],
    ['el;q=abc,en;q=0.5', 'en'],
  ])('sends "/" with Accept-Language %j to /%s and stores that choice', async (acceptLanguage, locale) => {
    const response = await runProxy('/', { 'accept-language': acceptLanguage });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/${locale}`);
    expect(response.cookies.get('lang')?.value).toBe(locale);
  });

  it('uses the default locale without an Accept-Language header', async () => {
    const response = await runProxy('/moments');

    expect(response.headers.get('location')).toBe(`${ORIGIN}/en/moments`);
  });

  it('applies the preference to unlocalized paths and keeps the query', async () => {
    const response = await runProxy('/moments?q=museum', { 'accept-language': 'el-GR' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/el/moments?q=museum`);
  });

  it('lets an existing lang cookie win over Accept-Language', async () => {
    const response = await runProxy('/', { 'accept-language': 'el-GR,el;q=0.9', cookie: 'lang=en' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/en`);
  });

  it('falls back to Accept-Language when the lang cookie is not a supported locale', async () => {
    const response = await runProxy('/', { 'accept-language': 'el', cookie: 'lang=fr' });

    expect(response.headers.get('location')).toBe(`${ORIGIN}/el`);
  });

  it.each(['/en', '/en/moments'])('never redirects an explicit locale path (%s)', async (path) => {
    const response = await runProxy(path, { 'accept-language': 'el-GR,el;q=0.9' });

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.cookies.get('lang')?.value).toBe('en');
  });
});

import { readdirSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ touched: [] as string[] }));

// An unauthenticated request must not get as far as the database: any use of it fails the sweep.
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, {
    get(_target, property) {
      database.touched.push(String(property));
      throw new Error('An unauthenticated admin request reached the database');
    },
  }),
}));

const ADMIN_API_DIRECTORY = 'src/app/api/admin';
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
const SEGMENT_VALUE = '5e8b1c3a-2d44-4f6e-9a07-3c1f0b7d9e21';

// Open on purpose: login takes the credential in its body, and logout ends a session that may be gone
// already (it revokes what the cookie names and always clears the cookie). A new route that is not
// authenticated must be added here in review, with its reason, or it fails the sweep below.
const OPEN_BY_DESIGN: Record<string, readonly string[]> = {
  'login/route.ts': ['POST'],
  'logout/route.ts': ['POST'],
};

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

const routeFiles = readdirSync(ADMIN_API_DIRECTORY, { recursive: true, encoding: 'utf8' })
  .map((entry) => entry.split(path.sep).join('/'))
  .filter((entry) => /^route\.[cm]?[jt]sx?$/u.test(entry.split('/').at(-1) ?? ''))
  .sort();

// `bookings/[id]/claim-grants/route.ts` becomes /api/admin/bookings/<uuid>/claim-grants.
function urlFor(routeFile: string): string {
  const segments = routeFile.split('/').slice(0, -1)
    .map((segment) => (/^\[\w+\]$/u.test(segment) ? SEGMENT_VALUE : segment));
  return ['http://localhost:3000/api/admin', ...segments].join('/');
}

function paramsFor(routeFile: string): Record<string, string> {
  return Object.fromEntries([...routeFile.matchAll(/\[(\w+)\]/gu)].map(([, name]) => [name, SEGMENT_VALUE]));
}

describe('admin API authentication sweep', () => {
  beforeEach(() => {
    database.touched.length = 0;
  });

  it('finds the admin routes and every open-by-design route among them', () => {
    expect(routeFiles).toEqual(expect.arrayContaining(Object.keys(OPEN_BY_DESIGN)));
    expect(routeFiles.length).toBeGreaterThan(Object.keys(OPEN_BY_DESIGN).length);
  });

  it.each(routeFiles)('%s answers 401 or 403 to every method without a valid admin session', async (routeFile) => {
    // Variable import path: resolved by the test runner at run time, one module per case.
    const routeModule = await import(/* @vite-ignore */ `@/app/api/admin/${routeFile.replace(/\.[a-z]+$/u, '')}`) as Record<string, unknown>;
    const handlers = METHODS.filter((method) => typeof routeModule[method] === 'function');
    expect(handlers.length, `${routeFile} exports no HTTP handler`).toBeGreaterThan(0);

    const open = OPEN_BY_DESIGN[routeFile] ?? [];
    for (const method of handlers.filter((candidate) => !open.includes(candidate))) {
      // No body and no content type: authentication has to come before the body is read.
      for (const [label, headers] of [['no cookie', {}], ['a forged cookie', { cookie: 'admin_jwt=forged' }]] as const) {
        const response = await (routeModule[method] as RouteHandler)(
          new NextRequest(urlFor(routeFile), { method, headers }),
          { params: Promise.resolve(paramsFor(routeFile)) },
        );
        expect([401, 403], `${method} /api/admin/${routeFile} with ${label} answered ${response.status}`).toContain(response.status);
      }
    }
    expect(database.touched).toEqual([]);
  });
});

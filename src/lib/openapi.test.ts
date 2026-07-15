import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { openApiSpec, validateOpenAPISpec } from './openapi';

const intentionallyInternalOrUiRoutes = new Set([
  '/dev/alerts/verify-spike',
  '/docs',
  '/docs/openapi',
  '/og',
  '/portal/dev-mint-session',
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : entry.name === 'route.ts' ? [path] : [];
  });
}

describe('OpenAPI contract', () => {
  it('is structurally valid', () => {
    expect(validateOpenAPISpec()).toBe(true);
  });

  it('documents every supported production API route and exported method', () => {
    const root = join(process.cwd(), 'src/app/api');
    const missing: string[] = [];

    for (const file of routeFiles(root)) {
      const path = `/${relative(root, dirname(file)).replaceAll('\\', '/').split('/').map((segment) => (
        segment.startsWith('[') && segment.endsWith(']') ? `{${segment.slice(1, -1)}}` : segment
      )).join('/')}`;
      if (intentionallyInternalOrUiRoutes.has(path)) continue;
      const source = readFileSync(file, 'utf8');
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].filter((method) => (
        source.includes(`export const ${method}`)
        || source.includes(`export function ${method}`)
        || source.includes(`export async function ${method}`)
      )).map((method) => method.toLowerCase());
      const documented = openApiSpec.paths[path as keyof typeof openApiSpec.paths] as Record<string, unknown> | undefined;
      if (!documented) {
        missing.push(`${path} (route)`);
        continue;
      }
      for (const method of methods) {
        if (!(method in documented)) missing.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(missing).toEqual([]);
  });
});

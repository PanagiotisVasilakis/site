import { fileURLToPath } from 'node:url';
import path from 'node:path';

type OfflineAssetSpec = {
  path: string;
  contentTypes: readonly string[];
  validateBody: (body: string) => string | null;
};

export type OfflineAssetResult = {
  path: string;
  url: string;
  status: number;
  contentType: string;
  ok: boolean;
  error?: string;
};

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function validateUrlList(body: string): string | null {
  const value = parseJson(body);
  if (!Array.isArray(value) || value.length === 0) {
    return 'expected a non-empty JSON URL array';
  }
  if (!value.every((entry) => typeof entry === 'string' && entry.startsWith('/'))) {
    return 'URL manifest contains a non-root-relative entry';
  }
  return null;
}

const ASSETS: readonly OfflineAssetSpec[] = [
  {
    path: '/sw.js',
    contentTypes: ['text/javascript', 'application/javascript'],
    validateBody: (body) => body.includes('addEventListener')
      ? null
      : 'service worker payload does not contain an event listener',
  },
  {
    path: '/precache.json',
    contentTypes: ['application/json'],
    validateBody: validateUrlList,
  },
  {
    path: '/critical-precache.json',
    contentTypes: ['application/json'],
    validateBody: validateUrlList,
  },
  {
    path: '/version.json',
    contentTypes: ['application/json'],
    validateBody: (body) => {
      const value = parseJson(body);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'expected a JSON version object';
      }
      const version = value as Record<string, unknown>;
      if (typeof version.version !== 'string' || version.version.length === 0) {
        return 'version field is missing';
      }
      if (typeof version.timestamp !== 'string' || Number.isNaN(Date.parse(version.timestamp))) {
        return 'timestamp field is invalid';
      }
      if (typeof version.precacheHash !== 'string' || !/^[0-9a-f]{64}$/i.test(version.precacheHash)) {
        return 'precacheHash field is invalid';
      }
      return null;
    },
  },
  {
    path: '/app.webmanifest',
    contentTypes: ['application/manifest+json', 'application/json'],
    validateBody: (body) => {
      const value = parseJson(body);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return 'expected a JSON web manifest';
      }
      const manifest = value as Record<string, unknown>;
      if (typeof manifest.name !== 'string' || typeof manifest.start_url !== 'string') {
        return 'web manifest is missing name or start_url';
      }
      if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
        return 'web manifest does not declare icons';
      }
      return null;
    },
  },
];

export function resolveOfflineOrigin(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.OFFLINE_CHECK_ORIGIN
    ?? env.OFFLINE_CHECK_HOST
    ?? `http://127.0.0.1:${env.PORT || '3000'}`;
  const url = new URL(raw);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Offline check origin must use http or https');
  }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Offline check origin must be an origin without credentials, path, query, or fragment');
  }

  return url.origin;
}

export async function checkOfflineAssets(
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OfflineAssetResult[]> {
  return Promise.all(ASSETS.map(async (asset): Promise<OfflineAssetResult> => {
    const url = new URL(asset.path, origin).toString();
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

      if (response.status !== 200) {
        return {
          path: asset.path,
          url,
          status: response.status,
          contentType,
          ok: false,
          error: `expected HTTP 200, received ${response.status}`,
        };
      }

      if (!asset.contentTypes.includes(contentType)) {
        return {
          path: asset.path,
          url,
          status: response.status,
          contentType,
          ok: false,
          error: `unexpected content-type ${contentType || '(missing)'}`,
        };
      }

      const bodyError = asset.validateBody(await response.text());
      return {
        path: asset.path,
        url,
        status: response.status,
        contentType,
        ok: bodyError === null,
        ...(bodyError ? { error: bodyError } : {}),
      };
    } catch (error) {
      return {
        path: asset.path,
        url,
        status: 0,
        contentType: '',
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}

async function main() {
  const origin = resolveOfflineOrigin();
  console.log(`Checking offline assets at ${origin}`);
  const results = await checkOfflineAssets(origin);

  for (const result of results) {
    if (result.ok) {
      console.log(`[OK] ${result.path} -> ${result.status} ${result.contentType}`);
    } else {
      console.error(`[FAIL] ${result.path} -> ${result.error ?? `HTTP ${result.status}`}`);
    }
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 2;
  }
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isMain) {
  main().catch((error) => {
    console.error('[offline-assets] Fatal error:', error);
    process.exitCode = 2;
  });
}

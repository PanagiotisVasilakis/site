#!/usr/bin/env tsx

import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

type Counter = { count: number; expiresAt: number };

export type UpstashRestMockOptions = {
  host?: string;
  port?: number;
  token: string;
};

function jsonResponse(response: import('node:http').ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('request body exceeds 64 KiB');
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function startUpstashRestMock(options: UpstashRestMockOptions): Promise<Server> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 0;
  const counters = new Map<string, Counter>();

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/healthz') {
      jsonResponse(response, 200, { status: 'ok' });
      return;
    }

    if (request.headers.authorization !== `Bearer ${options.token}`) {
      jsonResponse(response, 401, { error: 'unauthorized' });
      return;
    }

    const url = new URL(request.url ?? '/', `http://${host}`);

    try {
      if (request.method === 'GET' && url.pathname === '/ping') {
        jsonResponse(response, 200, { result: 'PONG' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/') {
        const command = await readJsonBody(request);
        if (!Array.isArray(command) || String(command[0]).toUpperCase() !== 'EVAL') {
          jsonResponse(response, 400, { error: 'only EVAL is supported by the CI mock' });
          return;
        }

        const key = String(command[3] ?? '');
        const windowMs = Number(command[4]);
        if (!key || !Number.isSafeInteger(windowMs) || windowMs <= 0) {
          jsonResponse(response, 400, { error: 'invalid EVAL arguments' });
          return;
        }

        const now = Date.now();
        const current = counters.get(key);
        const next = !current || current.expiresAt <= now
          ? { count: 1, expiresAt: now + windowMs }
          : { count: current.count + 1, expiresAt: current.expiresAt };
        counters.set(key, next);
        jsonResponse(response, 200, { result: [next.count, Math.max(1, next.expiresAt - now)] });
        return;
      }

      const getMatch = request.method === 'GET' && url.pathname.match(/^\/get\/(.+)$/);
      if (getMatch) {
        const key = decodeURIComponent(getMatch[1]);
        const current = counters.get(key);
        if (current && current.expiresAt <= Date.now()) counters.delete(key);
        jsonResponse(response, 200, { result: counters.get(key)?.count ?? null });
        return;
      }

      const deleteMatch = request.method === 'POST' && url.pathname.match(/^\/del\/(.+)$/);
      if (deleteMatch) {
        counters.delete(decodeURIComponent(deleteMatch[1]));
        jsonResponse(response, 200, { result: 1 });
        return;
      }

      jsonResponse(response, 404, { error: 'not found' });
    } catch (error) {
      jsonResponse(response, 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  return server;
}

async function main() {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token || token.length < 20) {
    throw new Error('UPSTASH_REDIS_REST_TOKEN must contain at least 20 characters');
  }

  const port = Number(process.env.UPSTASH_MOCK_PORT ?? '8079');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('UPSTASH_MOCK_PORT must be an integer from 1 to 65535');
  }

  const server = await startUpstashRestMock({ port, token });
  console.log(`[upstash-mock] listening on http://127.0.0.1:${port}`);

  const stop = () => server.close(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

const isMain = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isMain) {
  main().catch((error) => {
    console.error('[upstash-mock] Fatal error:', error);
    process.exitCode = 1;
  });
}

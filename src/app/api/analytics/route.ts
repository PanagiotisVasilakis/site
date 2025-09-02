import { NextRequest } from 'next/server';
import { addHits, getHits } from '@/lib/analyticsStore';

// Very lightweight in-memory rate limit / bot filter (non-production grade)
const recentByIp: Record<string, number[]> = {};
let lastPersist = 0;
import fs from 'node:fs';
import { logger } from '@/lib/logger';
function persistRateLimit() {
  if (process.env.ANALYTICS_PERSIST !== '1') return;
  const now = Date.now();
  if (now - lastPersist < 30_000) return; // throttle
  lastPersist = now;
  try { fs.writeFileSync(process.cwd() + '/analytics-ratelimit.json', JSON.stringify(recentByIp)); } catch (err) { logger.error('Persist ratelimit failed', err); }
}
function loadRateLimit() {
  if (process.env.ANALYTICS_PERSIST !== '1') return;
  try {
    const p = process.cwd() + '/analytics-ratelimit.json';
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p,'utf-8'));
      if (data && typeof data === 'object') {
        for (const k of Object.keys(data as Record<string, unknown>)) {
          const arr = (data as Record<string, unknown>)[k];
          if (Array.isArray(arr)) recentByIp[k] = (arr as number[]).filter((t)=> Date.now()-t < WINDOW_MS);
        }
      }
    }
  } catch (err) { logger.error('Load ratelimit failed', err); }
}
loadRateLimit();
const WINDOW_MS = 60_000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 120; // generous
const BOT_PATTERNS = /(bot|crawl|spider|slurp|headless|instrumented)/i;

export async function POST(req: NextRequest) {
  try {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const ua = req.headers.get('user-agent') || '';
  if (BOT_PATTERNS.test(ua)) return new Response('ignored', { status: 202 });
  const now = Date.now();
  const arrTimes = (recentByIp[ip] = (recentByIp[ip] || []).filter(t => now - t < WINDOW_MS));
  if (arrTimes.length >= MAX_EVENTS_PER_WINDOW) return new Response('rate limited', { status: 429 });
  const body = await req.text();
    if (!body) return new Response('empty', { status: 400 });
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const normalized = arr
      .filter(d => d && typeof (d as { path?: unknown }).path === 'string')
      .map(d => {
        const rec = d as { path: string; ts?: unknown; locale?: unknown; event?: { name?: unknown; props?: unknown } };
        return {
          path: rec.path,
          ts: typeof rec.ts === 'number' ? rec.ts : Date.now(),
          locale: typeof rec.locale === 'string' ? rec.locale : undefined,
          // events are accepted but not persisted to hits; could extend store later
          event: (rec.event && typeof rec.event === 'object' && typeof rec.event.name === 'string') ? { name: rec.event.name, props: rec.event.props } : undefined,
        };
      });
  const accepted = addHits(normalized, ua);
  for (let i = 0; i < accepted; i++) arrTimes.push(now);
  persistRateLimit();
    return new Response(JSON.stringify({ accepted }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    logger.error('Analytics POST failed', err);
    return new Response('error', { status: 500 });
  }
}

// Lightweight stats endpoint (not listed in sitemap)
export async function GET() {
  return Response.json({ count: getHits().length });
}

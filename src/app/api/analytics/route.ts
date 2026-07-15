import { NextRequest } from 'next/server';

import {
  recordAnalyticsHits,
  recentAnalytics,
  vitalsRecent,
  type AnalyticsInput,
} from '@/lib/analyticsRepository';
import { logger } from '@/lib/logger-enterprise';
import { isAdminRequest } from '@/lib/rbac';
import { checkSensitiveRateLimit } from '@/lib/sensitiveRateLimit';
import { ApiError, readJsonBody } from '@/lib/apiErrorHandler';

const BOT_PATTERN = /(bot|crawl|spider|slurp|headless|instrumented)/i;
const ALLOWED_EVENTS = new Set([
  'portal_opened',
  'origin_selected',
  'form_submitted',
  'auth_mode_changed',
  'no_booking_cta_clicked',
  'checkin_viewed',
  'checkin_completed',
  'booking_submitted',
  'booking_check_availability',
  'mobile_nav_house',
  'mobile_nav_book',
  'mobile_nav_booking_details',
  'mobile_nav_about',
  'mobile_nav_favorites',
  'mobile_nav_moments',
  'mobile_nav_phones',
  'mobile_nav_checkin',
]);

function normalizePath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return null;
  try {
    const pathname = new URL(value, 'https://analytics.invalid').pathname;
    if (!pathname.startsWith('/') || pathname.length > 512) return null;
    return pathname.replace(/\/{2,}/g, '/');
  } catch {
    return null;
  }
}

function safeLocale(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const [language, region, extra] = value.split('-');
  const lowercaseLanguage = language.length === 2 && language.split('').every((character) => character >= 'a' && character <= 'z');
  const uppercaseRegion = !region || (region.length === 2 && region.split('').every((character) => character >= 'A' && character <= 'Z'));
  return !extra && lowercaseLanguage && uppercaseRegion ? value : undefined;
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function sanitizeEvent(value: unknown): Pick<AnalyticsInput, 'eventName' | 'properties'> | null {
  if (!value || typeof value !== 'object') return null;
  const event = value as { name?: unknown; props?: unknown };
  if (typeof event.name !== 'string' || !ALLOWED_EVENTS.has(event.name)) return null;
  const raw = event.props && typeof event.props === 'object' && !Array.isArray(event.props)
    ? event.props as Record<string, unknown>
    : {};

  let properties: Record<string, unknown> = {};
  switch (event.name) {
    case 'portal_opened':
      if (typeof raw.source === 'string' && /^[a-z0-9_-]{1,20}$/i.test(raw.source)) {
        properties = { source: raw.source };
      }
      break;
    case 'origin_selected':
      if (raw.origin === 'GR' || raw.origin === 'ABROAD') properties.origin = raw.origin;
      if (raw.mode === 'signup') properties.mode = raw.mode;
      break;
    case 'form_submitted':
      if (raw.form === 'sign-in' || raw.form === 'sign-up') properties.form = raw.form;
      break;
    case 'auth_mode_changed':
      if (raw.mode === 'signin' || raw.mode === 'signup') properties.mode = raw.mode;
      break;
    case 'no_booking_cta_clicked':
      if (raw.from === 'guest' || raw.from === 'home') properties.from = raw.from;
      break;
    case 'booking_submitted': {
      const nights = integer(raw.nights, 0, 365);
      if (nights !== undefined) properties.nights = nights;
      if (typeof raw.hasArrivalTime === 'boolean') properties.hasArrivalTime = raw.hasArrivalTime;
      break;
    }
    case 'booking_check_availability': {
      const nights = integer(raw.nights, 0, 365);
      if (nights !== undefined) properties.nights = nights;
      if (typeof raw.hasDates === 'boolean') properties.hasDates = raw.hasDates;
      break;
    }
  }

  return { eventName: event.name, properties };
}

function normalizeHit(value: unknown): AnalyticsInput | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { path?: unknown; locale?: unknown; event?: unknown; ts?: unknown; eventId?: unknown };
  const path = normalizePath(record.path);
  if (!path) return null;
  const now = Date.now();
  const oldestAllowed = now - 90 * 24 * 60 * 60 * 1_000;
  const occurredAt = typeof record.ts === 'number'
    && Number.isInteger(record.ts)
    && record.ts >= oldestAllowed
    && record.ts <= now + 5 * 60_000
    ? new Date(Math.min(record.ts, now))
    : undefined;
  const eventId = typeof record.eventId === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(record.eventId)
    ? record.eventId
    : undefined;
  const event = record.event === undefined ? {} : sanitizeEvent(record.event);
  if (event === null) return null;
  return {
    path,
    locale: safeLocale(record.locale),
    occurredAt,
    eventId,
    ...event,
  };
}

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || '';
  if (BOT_PATTERN.test(userAgent)) return new Response(null, { status: 202 });

  const contentLength = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 100 * 1_024) {
    return Response.json({ error: 'Payload too large' }, { status: 413 });
  }

  const decision = await checkSensitiveRateLimit(request, {
    scope: 'analytics-ingest',
    limit: 120,
    windowMs: 60_000,
  });
  if (!decision.allowed) {
    return Response.json(
      { error: 'Rate limited' },
      { status: 429, headers: { 'retry-after': String(Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1_000))) } },
    );
  }

  try {
    const parsed = await readJsonBody(request, 100 * 1_024);
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    if (entries.length > 50) return Response.json({ error: 'Too many entries' }, { status: 413 });

    const normalized = entries.map(normalizeHit).filter((hit): hit is AnalyticsInput => hit !== null);
    if (normalized.length === 0) return Response.json({ error: 'No valid entries' }, { status: 422 });
    const accepted = await recordAnalyticsHits(normalized);
    return Response.json({ accepted }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    logger.error('Analytics ingestion failed', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: 'Analytics temporarily unavailable' }, { status: 503 });
  }
}

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return Response.json({ error: 'Admin credentials required' }, { status: 403 });
  }

  const [hits, groupedVitals] = await Promise.all([recentAnalytics(), vitalsRecent()]);
  const vitals = Object.values(groupedVitals).flat().sort((a, b) => a.ts - b.ts).slice(-500);
  return Response.json({
    hits: hits.reverse().map((hit) => ({
      path: hit.path,
      locale: hit.locale ?? undefined,
      eventName: hit.eventName ?? undefined,
      ts: hit.occurredAt.getTime(),
    })),
    vitals,
  }, { headers: { 'cache-control': 'no-store, private' } });
}

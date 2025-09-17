import { NextRequest } from 'next/server';
import { addHits, getHits, vitalsRecent } from '@/lib/analyticsStore';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@/lib/logger';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 120; // generous limit
const RATE_LIMIT_PERSIST_INTERVAL_MS = 30_000; // 30 seconds

// Bot detection patterns
const BOT_PATTERNS = /(bot|crawl|spider|slurp|headless|instrumented)/i;

// IP validation constants
const MAX_IP_LENGTH = 45; // Maximum length for IPv6 addresses

// Very lightweight in-memory rate limit / bot filter (non-production grade)
const recentByIp: Record<string, number[]> = {};
let lastPersist = 0;

/**
 * Extract client IP from request headers, handling various proxy configurations
 * and IPv6 addresses properly
 */
function extractClientIP(req: NextRequest): string {
  // Try various headers in order of preference
  const headers = [
    'x-forwarded-for',
    'x-real-ip', 
    'cf-connecting-ip', // Cloudflare
    'x-client-ip',
    'x-forwarded',
    'forwarded-for',
    'forwarded'
  ];
  
  for (const header of headers) {
    const value = req.headers.get(header);
    if (value) {
      // Handle comma-separated IPs (take the first one)
      const ip = value.split(',')[0]?.trim();
      if (ip && isValidIP(ip)) {
        return normalizeIP(ip);
      }
    }
  }
  
  return 'unknown';
}

/**
 * Basic IP validation for both IPv4 and IPv6
 */
function isValidIP(ip: string): boolean {
  if (!ip || ip.length > MAX_IP_LENGTH) return false; // Max IPv6 length
  
  // IPv4 pattern
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 pattern (simplified)
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  
  if (ipv4Pattern.test(ip)) {
    // Validate IPv4 octets
    const octets = ip.split('.');
    return octets.every(octet => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }
  
  if (ipv6Pattern.test(ip) || ip.includes('::')) {
    return true; // Accept IPv6 (more complex validation could be added)
  }
  
  return false;
}

/**
 * Normalize IP for consistent rate limiting
 */
function normalizeIP(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 - normalize compressed notation and case
    try {
      // Basic IPv6 normalization - expand :: and lowercase
      const normalized = ip.toLowerCase();
      
      // Handle IPv6 mapped IPv4 addresses
      if (normalized.includes('::ffff:')) {
        const ipv4Part = normalized.split('::ffff:')[1];
        if (ipv4Part && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Part)) {
          return ipv4Part; // Use IPv4 part for consistency
        }
      }
      
      return normalized;
    } catch {
      return ip.toLowerCase();
    }
  }
  return ip; // IPv4
}

// Use path.join for safe file operations
const RATE_LIMIT_FILE = path.join(process.cwd(), 'analytics-ratelimit.json');
const RATE_LIMIT_TEMP_FILE = path.join(process.cwd(), 'analytics-ratelimit.json.tmp');

// Add memory cleanup for rate limiting data
function cleanupRateLimit() {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  
  for (const ip of Object.keys(recentByIp)) {
    recentByIp[ip] = recentByIp[ip].filter(t => t > cutoff);
    
    // Remove IPs with no recent requests to prevent memory leaks
    if (recentByIp[ip].length === 0) {
      delete recentByIp[ip];
    }
  }
}

function persistRateLimit() {
  if (process.env.ANALYTICS_PERSIST !== '1') return;
  const now = Date.now();
  if (now - lastPersist < RATE_LIMIT_PERSIST_INTERVAL_MS) return; // throttle
  lastPersist = now;
  
  try {
    // Clean up before persisting to avoid saving stale data
    cleanupRateLimit();
    
    // Atomic write using temp file
    fs.writeFileSync(RATE_LIMIT_TEMP_FILE, JSON.stringify(recentByIp));
    fs.renameSync(RATE_LIMIT_TEMP_FILE, RATE_LIMIT_FILE);
  } catch (err) { 
    logger.error('Persist ratelimit failed', err);
    // Clean up temp file on error
    try {
      if (fs.existsSync(RATE_LIMIT_TEMP_FILE)) {
        fs.unlinkSync(RATE_LIMIT_TEMP_FILE);
      }
    } catch {}
  }
}

function loadRateLimit() {
  if (process.env.ANALYTICS_PERSIST !== '1') return;
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE,'utf-8'));
      if (data && typeof data === 'object') {
        const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
        for (const k of Object.keys(data as Record<string, unknown>)) {
          const arr = (data as Record<string, unknown>)[k];
          if (Array.isArray(arr)) {
            // Filter out stale entries during load
            const validTimes = (arr as number[]).filter((t) => typeof t === 'number' && t > cutoff);
            if (validTimes.length > 0) {
              recentByIp[k] = validTimes;
            }
          }
        }
      }
    }
  } catch (err) { logger.error('Load ratelimit failed', err); }
}
loadRateLimit();

export async function POST(req: NextRequest) {
  const ip = extractClientIP(req);
  
  try {
    const ua = req.headers.get('user-agent') || '';
    if (BOT_PATTERNS.test(ua)) return new Response('ignored', { status: 202 });
    
    const now = Date.now();
    
    // Thread-safe rate limiting with atomic operations
    const currentTimes = recentByIp[ip] || [];
    const validTimes = currentTimes.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    
    // Check rate limit BEFORE modifying state
    if (validTimes.length >= MAX_EVENTS_PER_WINDOW) {
      recentByIp[ip] = validTimes; // Update with filtered times
      return new Response('rate limited', { status: 429 });
    }
    
    const body = await req.text();
    if (!body) return new Response('empty', { status: 400 });
    
    // Prevent memory amplification attacks
    if (body.length > 1024 * 100) { // 100KB limit
      return new Response('payload too large', { status: 413 });
    }
    
    let parsed: unknown;
    try { 
      parsed = JSON.parse(body); 
    } catch { 
      return new Response('bad json', { status: 400 }); 
    }
    
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    
    // Prevent DOS via large arrays
    if (arr.length > 50) {
      return new Response('too many entries', { status: 413 });
    }
    
    const normalized = arr
      .filter(d => d && typeof d === 'object' && typeof (d as { path?: unknown }).path === 'string')
      .slice(0, 50) // Hard limit to prevent memory exhaustion
      .map(d => {
        const rec = d as { path: string; ts?: unknown; locale?: unknown; event?: { name?: unknown; props?: unknown } };
        
        // Validate and sanitize path
        const path = typeof rec.path === 'string' && rec.path.length <= 500 ? rec.path : '/';
        
        return {
          path,
          ts: typeof rec.ts === 'number' && rec.ts > 0 ? rec.ts : Date.now(),
          locale: typeof rec.locale === 'string' && rec.locale.length <= 10 ? rec.locale : undefined,
          // Validate event data more strictly
          event: (rec.event && 
                  typeof rec.event === 'object' && 
                  typeof rec.event.name === 'string' && 
                  rec.event.name.length <= 100) 
                  ? { 
                      name: rec.event.name, 
                      props: rec.event.props && typeof rec.event.props === 'object' ? rec.event.props : undefined 
                    } 
                  : undefined,
        };
      });
    
    // Atomic operation: only update rate limit after successful processing
    const accepted = addHits(normalized, ua);
    
    // Update rate limit state atomically after successful processing
    const newTimes = [...validTimes];
    for (let i = 0; i < accepted; i++) {
      newTimes.push(now);
    }
    recentByIp[ip] = newTimes;
    
    persistRateLimit();
    return new Response(JSON.stringify({ accepted }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    logger.error('Analytics POST failed', { 
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      endpoint: '/api/analytics',
      ip
    });
    return new Response('internal_server_error', { status: 500 });
  }
}

// Lightweight stats endpoint (not listed in sitemap)
export async function GET() {
  // Provide a lightweight analytics view for internal dashboards
  const hits = getHits();
  const vitals = vitalsRecent();

  // Flatten vitals into array shape for dashboard consumption
  const vitalsArr = Object.entries(vitals).flatMap(([name, arr]) => arr.map(v => ({ name, value: v.value, ts: v.ts, id: v.id })));

  // Return anonymized hits summary; include only path and optional locale
  const response = {
    hits: hits.slice(-1000).map(h => ({ path: h.path, locale: h.locale })),
    vitals: vitalsArr.slice(-500),
  };
  return Response.json(response, { headers: { 'cache-control': 'no-store' } });
}

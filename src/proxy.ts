import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { createSecurityMiddleware } from '@/lib/security-middleware-edge';
import { tracer, SpanStatus } from '@/lib/distributed-tracing-lite';
import { metrics } from '@/lib/metrics-lite';
// Guest session auto-mint is handled in page routes (Node runtime) rather than middleware (Edge)

function hasLocale(pathname: string) {
  return locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
}

const NON_LOCALIZED_ROUTE_PREFIXES = [
  '/admin',
  '/offline',
];

function isNonLocalizedRoute(pathname: string) {
  return NON_LOCALIZED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const nonceSecurityMiddleware = createSecurityMiddleware({
  skipPaths: ['/favicon.ico', '/_next'],
  enableNonce: true,
});

export async function proxy(req: NextRequest) {
  const startTime = Date.now();
  const { pathname } = req.nextUrl;
  
  // Extract trace context from headers
  const traceHeaders: Record<string, string> = {};
  const traceparent = req.headers.get('traceparent');
  const legacyTrace = req.headers.get('x-trace-id');
  if (traceparent) traceHeaders.traceparent = traceparent;
  if (legacyTrace) traceHeaders['x-trace-id'] = legacyTrace;
  
  const parentContext = tracer.extractTraceContext(traceHeaders);
  
  // Start middleware span
  const span = tracer.startSpan('middleware', parentContext || undefined, {
    'http.method': req.method,
    'http.url': pathname,
    'http.pathname': pathname,
    component: 'middleware',
  });

  try {
    // Track middleware invocation
    metrics.counter('middleware.invocations', 1, {
      pathname: pathname.substring(0, 50), // Limit length
      method: req.method,
    });

    // Apply security headers first (will skip if path is in skipPaths) - now async
    const response = await nonceSecurityMiddleware(req);
    
    // Add tracing headers to response
    const traceHeaders = tracer.injectTraceContext({
      traceId: span.traceId,
      spanId: span.spanId,
      flags: 1,
    });
    
    Object.entries(traceHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Note: Do not use next/headers cookies() in middleware (Edge runtime). Any session refresh is handled in pages/APIs.

    // Add X-Robots-Tag for localized /check-in route (defense-in-depth)
    if (/^\/(?:en|el)\/(?:check-in)\/?$/.test(pathname)) {
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    }

    // Skip locale routing for Next.js internals, API routes, and root-level operational pages.
    if (pathname.startsWith("/_next") || pathname.startsWith("/api") || isNonLocalizedRoute(pathname)) {
      tracer.addTags(span, { 'middleware.action': 'skip_routing' });
      tracer.finishSpan(span);
      
      // Track performance
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'skip_routing' });
      
      return response;
    }

    const cookieLocale = req.cookies.get("lang")?.value as string | undefined;
    const isValidCookie = cookieLocale ? (locales as readonly string[]).includes(cookieLocale) : false;

  if (!hasLocale(pathname)) {
      tracer.addTags(span, { 'middleware.action': 'locale_redirect' });
      
      const target = (isValidCookie ? cookieLocale : defaultLocale) as string;
      const url = req.nextUrl.clone();
      // Always redirect to home page for root "/"
      if (pathname === "/") {
        url.pathname = `/${target}`;
      } else {
        url.pathname = `/${target}${pathname}`;
      }
      // Temporary locale selection redirect.
      const redirectResponse = NextResponse.redirect(url, 302);
      
      // Copy security headers to redirect response
      response.headers.forEach((value, key) => {
        redirectResponse.headers.set(key, value);
      });
      
      redirectResponse.cookies.set("lang", target, { 
        path: "/", 
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax", // Allow cross-origin for language detection
        secure: process.env.NODE_ENV === 'production'
      });
      
      tracer.addTags(span, { 'locale.target': target });
      tracer.finishSpan(span);
      
      metrics.counter('middleware.locale_redirects', 1, { target });
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'locale_redirect' });
      
      return redirectResponse;
    }

  // Legacy /[locale]/house redirect to /[locale]/apartment (permanent for clients/SEO)
    if (/^\/[a-zA-Z-]+\/house(\/)?$/.test(pathname)) {
      tracer.addTags(span, { 'middleware.action': 'legacy_redirect' });
      
      const segs = pathname.split('/');
      const loc = segs[1];
      const url2 = req.nextUrl.clone();
  url2.pathname = `/${loc}/apartment`;
      const redirectResponse = NextResponse.redirect(url2, 308);
      
      // Copy security headers to redirect response
      response.headers.forEach((value, key) => {
        redirectResponse.headers.set(key, value);
      });
      
      tracer.addTags(span, { 'redirect.from': pathname, 'redirect.to': url2.pathname });
      tracer.finishSpan(span);
      
      metrics.counter('middleware.legacy_redirects', 1, { locale: loc });
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'legacy_redirect' });
      
      return redirectResponse;
    }

    // When a locale is present in URL, ensure cookie matches it
    const current = pathname.split("/")[1] as string;
    if ((locales as readonly string[]).includes(current) && cookieLocale !== current) {
      tracer.addTags(span, { 'middleware.action': 'cookie_update' });
      
      // Copy security headers to response with updated cookie
      response.cookies.set("lang", current, { 
        path: "/", 
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax", // Allow cross-origin for language detection
        secure: process.env.NODE_ENV === 'production'
      });
      
      tracer.addTags(span, { 'locale.updated': current });
      tracer.finishSpan(span);
      
      metrics.counter('middleware.cookie_updates', 1, { locale: current });
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'cookie_update' });
      
      return response;
    }
    
    tracer.addTags(span, { 'middleware.action': 'passthrough' });
    tracer.finishSpan(span);
    
    const duration = Date.now() - startTime;
    metrics.timer('middleware.duration', duration, { action: 'passthrough' });
    
    return response;
    
  } catch (error) {
    tracer.addLog(span, 'error', 'Middleware error', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);
    
    metrics.counter('middleware.errors', 1);
    
    // Re-throw to maintain Next.js error handling
    throw error;
  }
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

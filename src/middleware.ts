import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { createSecurityMiddleware } from '@/lib/security-middleware';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import { metrics } from '@/lib/metrics-collector';
// Guest session auto-mint is handled in page routes (Node runtime) rather than middleware (Edge)

function hasLocale(pathname: string) {
  return locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
}

// Initialize security middleware
const securityMiddleware = createSecurityMiddleware({
  skipPaths: ['/api/health', '/favicon.ico', '/_next'],
  enableNonce: true,
});

export function middleware(req: NextRequest) {
  const startTime = Date.now();
  const { pathname } = req.nextUrl;
  
  // Extract trace context from headers
  const traceHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    traceHeaders[key] = value;
  });
  
  const parentContext = tracer.extractTraceContext(traceHeaders);
  
  // Start middleware span
  const span = tracer.startSpan('middleware', parentContext || undefined, {
    'http.method': req.method,
    'http.url': req.url,
    'http.pathname': pathname,
    component: 'middleware',
  });

  try {
    // Track middleware invocation
    metrics.counter('middleware.invocations', 1, {
      pathname: pathname.substring(0, 50), // Limit length
      method: req.method,
    });

    // Apply security headers first (will skip if path is in skipPaths)
    const response = securityMiddleware(req);
    
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

    // Skip routing logic for Next.js internals, API routes, and QR page
    if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/qr") {
      tracer.addTags(span, { 'middleware.action': 'skip_routing' });
      tracer.finishSpan(span);
      
      // Track performance
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'skip_routing' });
      
      return response;
    }
    
    const url = new URL(req.url);
    // Basic auth gate for /admin/analytics - requires secret, JWT validation happens server-side
    if (url.pathname.startsWith('/admin/analytics')) {
      tracer.addTags(span, { 'middleware.action': 'admin_auth_basic' });
      
      const secret = process.env.ADMIN_DASH_SECRET;
      const provided = req.headers.get('x-admin-secret') || url.searchParams.get('token');
      
      // Check if admin dashboard is configured
      if (!secret) {
        tracer.addLog(span, 'error', 'Admin dashboard not configured');
        tracer.finishSpan(span, SpanStatus.ERROR);
        
        metrics.counter('middleware.admin_auth_failures', 1, { reason: 'not_configured' });
        
        const errorResponse = new NextResponse('Admin dashboard not configured', { status: 503 });
        // Copy security headers from original response
        response.headers.forEach((value, key) => {
          errorResponse.headers.set(key, value);
        });
        return errorResponse;
      }
      
      // Basic secret check in middleware (JWT verification happens server-side in page)
      if (provided !== secret) {
        tracer.addLog(span, 'warn', 'Admin secret authentication failed');
        tracer.finishSpan(span, SpanStatus.ERROR);
        
        metrics.counter('middleware.admin_auth_failures', 1, { reason: 'invalid_secret' });
        
        const unauthorizedResponse = new NextResponse('Unauthorized', { status: 401 });
        // Copy security headers from original response
        response.headers.forEach((value, key) => {
          unauthorizedResponse.headers.set(key, value);
        });
        return unauthorizedResponse;
      }
      
      // Secret is valid, allow through to page for JWT verification
      tracer.addTags(span, { 'auth.secret_valid': true });
      tracer.finishSpan(span);
      
      metrics.counter('middleware.admin_secret_success', 1);
      const duration = Date.now() - startTime;
      metrics.timer('middleware.duration', duration, { action: 'admin_secret_success' });
      
      return response;
    }
    
    const cookieLocale = req.cookies.get("lang")?.value as string | undefined;
    const isValidCookie = cookieLocale ? (locales as readonly string[]).includes(cookieLocale) : false;

  if (!hasLocale(pathname)) {
      tracer.addTags(span, { 'middleware.action': 'locale_redirect' });
      
      const target = (isValidCookie ? cookieLocale : defaultLocale) as string;
      const url = req.nextUrl.clone();
      // For the bare root "/", send guests to the unified guest page by default,
      // except when the user has signed in recently (cookie from verify API)
      if (pathname === "/") {
        const last = req.cookies.get('portal_last_signin')?.value;
        url.pathname = `/${target}${last ? '' : '/guest'}`;
      } else {
        url.pathname = `/${target}${pathname}`;
      }
      const redirectResponse = NextResponse.redirect(url);
      
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

    // Legacy /[locale]/house redirect to /[locale]/villa (permanent for clients/SEO)
    if (/^\/[a-zA-Z-]+\/house(\/)?$/.test(pathname)) {
      tracer.addTags(span, { 'middleware.action': 'legacy_redirect' });
      
      const segs = pathname.split('/');
      const loc = segs[1];
      const url2 = req.nextUrl.clone();
      url2.pathname = `/${loc}/villa`;
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
  matcher: ["/((?!_next|.*\..*).*)"],
};

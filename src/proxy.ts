import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { createSecurityMiddleware } from '@/lib/security-middleware-edge';

function isLocalizedPage(pathname: string, page: string) {
  return locales.some((l) => pathname === `/${l}${page}` || pathname === `/${l}${page}/`);
}

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

// Booking pages replaced by /{locale}/availability (R3-F10).
const RETIRED_BOOKING_PAGES = ['/book', '/booking-details'];

/** The exact retired page, with or without one trailing slash; never a lookalike or a subpath. */
function isRetiredBookingPage(path: string) {
  return RETIRED_BOOKING_PAGES.some((page) => path === page || path === `${page}/`);
}

// The About page became the home page's host letter (R3-V5): /{locale}/about -> /{locale}#host.
function isRetiredAboutPage(path: string) {
  return path === '/about' || path === '/about/';
}

/**
 * The supported locale an `Accept-Language` header prefers most (identity §12 R3-V9), or null. q-values are
 * respected (q=0 means "not acceptable"; an unparsable q skips the entry); a tie keeps the header order; only
 * the primary subtag counts (`el-GR` is `el`); `*` does not pick a locale.
 */
function preferredLocale(header: string | null): string | null {
  let best: { locale: string; q: number } | null = null;
  for (const entry of (header ?? '').split(',')) {
    const [range, ...parameters] = entry.trim().split(';');
    const locale = range.split('-')[0].trim().toLowerCase();
    if (!(locales as readonly string[]).includes(locale)) continue;
    const qParameter = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/iu.test(parameter));
    const qValue = qParameter === undefined ? '1' : qParameter.slice(2).trim();
    const q = qValue === '' ? Number.NaN : Number(qValue);
    if (!(q > 0 && q <= 1)) continue;
    if (!best || q > best.q) best = { locale, q };
  }
  return best?.locale ?? null;
}

/** A redirect that carries the security headers the proxy computed for the request. */
function redirectWithSecurityHeaders(url: URL, status: 302 | 308, securityResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url, status);
  securityResponse.headers.forEach((value, key) => {
    redirectResponse.headers.set(key, value);
  });
  return redirectResponse;
}

const nonceSecurityMiddleware = createSecurityMiddleware();

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Apply security headers first
  const response = await nonceSecurityMiddleware(req);

  // Add X-Robots-Tag for localized /check-in route (defense-in-depth)
  if (isLocalizedPage(pathname, '/check-in')) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (isLocalizedPage(pathname, '/guest')) {
    response.headers.set('Referrer-Policy', 'no-referrer');
  }

  // Skip locale routing for API routes and root-level operational pages.
  if (pathname.startsWith("/api") || isNonLocalizedRoute(pathname)) {
    return response;
  }

  // A retired booking page moves permanently to the availability page; its
  // query (the old form's dates) is dropped. A new URL, not a clone of nextUrl,
  // so a trailing slash on the old path is not carried over.
  const pathLocale = locales.find((l) => pathname.startsWith(`/${l}/`));
  if (pathLocale && isRetiredBookingPage(pathname.slice(pathLocale.length + 1))) {
    return redirectWithSecurityHeaders(new URL(`/${pathLocale}/availability`, req.nextUrl.origin), 308, response);
  }
  if (pathLocale && isRetiredAboutPage(pathname.slice(pathLocale.length + 1))) {
    return redirectWithSecurityHeaders(new URL(`/${pathLocale}#host`, req.nextUrl.origin), 308, response);
  }

  const cookieLocale = req.cookies.get("lang")?.value as string | undefined;
  const isValidCookie = cookieLocale ? (locales as readonly string[]).includes(cookieLocale) : false;

  if (!hasLocale(pathname)) {
    // An explicit choice (the cookie) wins; a first visit follows the browser's language preference.
    const target = (isValidCookie ? cookieLocale : preferredLocale(req.headers.get('accept-language')) ?? defaultLocale) as string;
    let url: URL;
    if (isRetiredBookingPage(pathname)) {
      url = new URL(`/${target}/availability`, req.nextUrl.origin);
    } else if (isRetiredAboutPage(pathname)) {
      url = new URL(`/${target}#host`, req.nextUrl.origin);
    } else {
      url = req.nextUrl.clone();
      // Always redirect to home page for root "/"
      if (pathname === "/") {
        url.pathname = `/${target}`;
      } else {
        url.pathname = `/${target}${pathname}`;
      }
    }
    // Temporary locale selection redirect.
    const redirectResponse = redirectWithSecurityHeaders(url, 302, response);

    redirectResponse.cookies.set("lang", target, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax", // Allow cross-origin for language detection
      secure: process.env.NODE_ENV === 'production'
    });

    return redirectResponse;
  }

  // When a locale is present in URL, ensure cookie matches it
  const current = pathname.split("/")[1] as string;
  if ((locales as readonly string[]).includes(current) && cookieLocale !== current) {
    response.cookies.set("lang", current, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax", // Allow cross-origin for language detection
      secure: process.env.NODE_ENV === 'production'
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

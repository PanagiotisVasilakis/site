import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale, isLocale, pathLocale } from "@/i18n/config";
import { createSecurityMiddleware } from '@/lib/security-middleware-edge';

function isLocalizedPage(pathname: string, page: string) {
  return locales.some((l) => pathname === `/${l}${page}` || pathname === `/${l}${page}/`);
}

const NON_LOCALIZED_ROUTE_PREFIXES = [
  '/admin',
  '/offline',
];

function isNonLocalizedRoute(pathname: string) {
  return NON_LOCALIZED_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
    if (!isLocale(locale)) continue;
    const qParameter = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/iu.test(parameter));
    const qValue = qParameter === undefined ? '1' : qParameter.slice(2).trim();
    const q = qValue === '' ? Number.NaN : Number(qValue);
    if (!(q > 0 && q <= 1)) continue;
    if (!best || q > best.q) best = { locale, q };
  }
  return best?.locale ?? null;
}

/** A redirect that carries the security headers the proxy computed for the request. */
function redirectWithSecurityHeaders(url: URL, securityResponse: NextResponse) {
  const redirectResponse = NextResponse.redirect(url, 302);
  securityResponse.headers.forEach((value, key) => {
    redirectResponse.headers.set(key, value);
  });
  return redirectResponse;
}

const LANG_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax",
  secure: process.env.NODE_ENV === 'production'
} as const;

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

  const urlLocale = pathLocale(pathname);
  const cookieLocale = req.cookies.get("lang")?.value;

  if (!urlLocale) {
    // An explicit choice (the cookie) wins; a first visit follows the browser's language preference.
    const target = isLocale(cookieLocale) ? cookieLocale : preferredLocale(req.headers.get('accept-language')) ?? defaultLocale;
    const url = req.nextUrl.clone();
    // Always redirect to home page for root "/"
    if (pathname === "/") {
      url.pathname = `/${target}`;
    } else {
      url.pathname = `/${target}${pathname}`;
    }
    // Temporary locale selection redirect.
    const redirectResponse = redirectWithSecurityHeaders(url, response);

    redirectResponse.cookies.set("lang", target, LANG_COOKIE_OPTIONS);

    return redirectResponse;
  }

  // When a locale is present in URL, ensure cookie matches it
  if (cookieLocale !== urlLocale) {
    response.cookies.set("lang", urlLocale, LANG_COOKIE_OPTIONS);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

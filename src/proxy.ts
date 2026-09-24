import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { createSecurityMiddleware } from '@/lib/security-middleware-edge';

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

const nonceSecurityMiddleware = createSecurityMiddleware();

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Apply security headers first
  const response = await nonceSecurityMiddleware(req);

  // Add X-Robots-Tag for localized /check-in route (defense-in-depth)
  if (/^\/(?:en|el)\/(?:check-in)\/?$/.test(pathname)) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (/^\/(?:en|el)\/guest\/?$/.test(pathname)) {
    response.headers.set('Referrer-Policy', 'no-referrer');
  }

  // Skip locale routing for API routes and root-level operational pages.
  if (pathname.startsWith("/api") || isNonLocalizedRoute(pathname)) {
    return response;
  }

  const cookieLocale = req.cookies.get("lang")?.value as string | undefined;
  const isValidCookie = cookieLocale ? (locales as readonly string[]).includes(cookieLocale) : false;

  if (!hasLocale(pathname)) {
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

    return redirectResponse;
  }

  // Legacy /[locale]/house redirect to /[locale]/apartment (permanent for clients/SEO)
  if (/^\/[a-zA-Z-]+\/house(\/)?$/.test(pathname)) {
    const segs = pathname.split('/');
    const loc = segs[1];
    const url2 = req.nextUrl.clone();
    url2.pathname = `/${loc}/apartment`;
    const redirectResponse = NextResponse.redirect(url2, 308);

    // Copy security headers to redirect response
    response.headers.forEach((value, key) => {
      redirectResponse.headers.set(key, value);
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

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { locales, defaultLocale } from "@/i18n/config";
import { verifyAdmin } from '@/lib/auth';

function hasLocale(pathname: string) {
  return locales.some((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname === "/qr") {
    return NextResponse.next();
  }
  const url = new URL(req.url);
  // Simple auth gate for /admin/analytics
    if (url.pathname.startsWith('/admin/analytics')) {
      const secret = process.env.ADMIN_DASH_SECRET;
      const provided = req.headers.get('x-admin-secret') || url.searchParams.get('token');
      const jwt = (req.headers.get('cookie') || '').split(';').map(c=>c.trim()).find(c=>c.startsWith('admin_jwt='))?.split('=')[1];
      if (secret) {
        if (provided === secret) {
          return NextResponse.next();
        }
      }
      if (jwt && verifyAdmin(jwt)) {
        return NextResponse.next();
      }
      return new NextResponse('Unauthorized', { status: 401 });
  }
  const cookieLocale = req.cookies.get("lang")?.value as string | undefined;
  const isValidCookie = cookieLocale ? (locales as readonly string[]).includes(cookieLocale) : false;

  if (!hasLocale(pathname)) {
    const target = (isValidCookie ? cookieLocale : defaultLocale) as string;
    const url = req.nextUrl.clone();
    url.pathname = `/${target}${pathname === "/" ? "" : pathname}`;
    const res = NextResponse.redirect(url);
    res.cookies.set("lang", target, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  // When a locale is present in URL, ensure cookie matches it
  const current = pathname.split("/")[1] as string;
  if ((locales as readonly string[]).includes(current) && cookieLocale !== current) {
    const res = NextResponse.next();
    res.cookies.set("lang", current, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|.*\..*).*)"],
};

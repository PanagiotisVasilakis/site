import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
// Removed Google font imports (Geist) to prevent build-time external fetch failures.
import "../globals.css";
import { getDictionary } from "@/i18n/dictionaries";
import PwaManager from "@/components/PwaManager";
import { ToastProvider } from "@/components/Toast";
import Analytics from "@/components/Analytics";
import JsonFetchHud from "@/components/JsonFetchHud";
import TopControls from "@/components/TopControls";
import { getGuestSessionFromCookies, hasVerifiedBookingSession, tryAutoMintSessionFromRefresh } from "@/lib/guestSession";
import { cookies as getCookieJar } from 'next/headers';
import { getFeatureFlags } from "@/lib/featureFlags";

// Removed font variable placeholders.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const languages = { en: "/en", el: "/el" } as const;
  return {
    title: t.appTitle,
    description: t.homeSubtitle,
    alternates: { languages },
    openGraph: {
      title: t.appTitle,
      description: t.homeSubtitle,
      locale: eff,
      alternateLocale: ["en", "el"].filter((l) => l !== eff),
      type: "website",
    },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  // Read current session from cookie
  let session = await getGuestSessionFromCookies();

  // SSR auto-restore: if no verified booking session but refresh token exists, mint a new session.
  // We use server helper (equivalent to calling /api/portal/refresh) to avoid parsing Set-Cookie headers from a fetch.
  if (!hasVerifiedBookingSession(session)) {
    const restored = await tryAutoMintSessionFromRefresh();
    if (restored.cookies && restored.cookies.length) {
      const jar = await getCookieJar();
      for (const c of restored.cookies) {
        jar.set(c.name, c.value, c.options);
      }
    }
    if (restored.session) {
      session = restored.session;
    }
  }
  const ff = getFeatureFlags();
  const hasBookingSession = hasVerifiedBookingSession(session);
  const showCheckIn = ff.checkinEnabled && hasBookingSession;
  return (
  <div data-locale={eff}>
  <a href="#main-content" className="skip-link">{t.skipLink || 'Skip to content'}</a>
      <ToastProvider>
      <PwaManager />
      <Analytics />
  <JsonFetchHud />
  <TopControls locale={eff} appTitle={t.appTitle} showCheckIn={showCheckIn} />
      {/* Update banner: light surface uses dark brand text; buttons tinted; dismiss available */}
      <div
        id="update-banner"
        className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom floating-banner text-xs items-center gap-2 rounded-full px-3 py-2"
        aria-live="polite"
  style={{ color: 'var(--text-accent)' }}
        data-t-update-fromto={t.updates?.fromTo}
        data-t-assets-fromto={t.updates?.assetsFromTo}
      >
          <span>{t.updates?.updateAvailable || 'New version available'}</span>
          <div className="flex items-center gap-1">
            <button id="update-reload-btn" type="button" className="btn-tint btn-sm">{t.updates?.refresh || 'Refresh'}</button>
            <button id="update-dismiss-btn" type="button" aria-label={t.updates?.dismiss || 'Dismiss update'} className="btn-tint btn-sm">×</button>
          </div>
      </div>
      {/* iOS Add to Home Screen tip */}
  <div id="ios-a2hs-tip" role="region" aria-label="iOS add to home screen tip" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border-soft rounded-full px-3 py-2 text-xs items-center gap-2 shadow" style={{ color: 'var(--text-accent)' }}>
        <span>Add to Home Screen: Share → Add to Home Screen</span>
        <button id="ios-tip-close" aria-label="Close" className="btn-outline btn-sm">×</button>
      </div>
  <main id="main-content" className="safe-bottom top-gap" role="main">{children}</main>
  </ToastProvider>
    </div>
  );
}

export function generateStaticParams() {
  return locales.map((l) => ({ locale: l }));
}

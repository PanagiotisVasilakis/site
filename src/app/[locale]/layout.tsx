import type { Metadata } from "next";
import { locales, normalizeLocale } from '@/i18n/config';
import { getDictionary } from "@/i18n/dictionaries";
import { ToastProvider } from "@/components/Toast";
import TopControls from "@/components/TopControls";
import DeferredRuntimeManagers from "@/components/DeferredRuntimeManagers";
import DocumentLocale from "@/components/DocumentLocale";
import StatusCluster from "@/components/StatusCluster";
import { siteUrl } from '@/lib/site';

// Removed font variable placeholders.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  const languages = { en: "/en", el: "/el" } as const;
  return {
    metadataBase: new URL(siteUrl),
    title: t.appTitle,
    description: t.homeSubtitle,
    alternates: { canonical: `/${eff}`, languages },
    openGraph: {
      title: t.appTitle,
      description: t.homeSubtitle,
      locale: eff,
      alternateLocale: ["en", "el"].filter((l) => l !== eff),
      type: "website",
      url: `/${eff}`,
    },
  };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  // Avoid reading cookies server-side so the route can stay fully static; client components fetch session state.
  return (
  <div data-locale={eff} lang={eff}>
  <DocumentLocale locale={eff} />
  <a href="#main-content" className="skip-link">{t.skipLink}</a>
      <ToastProvider>
      <DeferredRuntimeManagers />
  <TopControls locale={eff} appTitle={t.appTitle} />
      {/* Update banner: light surface uses dark brand text; buttons tinted; dismiss available */}
      <div
        id="update-banner"
        className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom floating-banner text-xs items-center gap-2 rounded-full px-3 py-2"
        aria-live="polite"
  style={{ color: 'var(--text-accent)' }}
        data-t-update-fromto={t.updates?.fromTo}
        data-t-assets-fromto={t.updates?.assetsFromTo}
      >
          <span>{t.updates.updateAvailable}</span>
          <div className="flex items-center gap-1">
            <button id="update-reload-btn" type="button" className="btn-tint btn-sm">{t.updates.refresh}</button>
            <button id="update-dismiss-btn" type="button" aria-label={t.updates.dismiss} className="btn-tint btn-sm">×</button>
          </div>
      </div>
      {/* iOS Add to Home Screen tip */}
  <div id="ios-a2hs-tip" role="region" aria-label={t.a2hs.region} className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border-soft rounded-full px-3 py-2 text-xs items-center gap-2 shadow" style={{ color: 'var(--text-accent)' }}>
        <span>{t.a2hs.message}</span>
        <button id="ios-tip-close" aria-label={t.a2hs.close} className="btn-outline btn-sm">×</button>
      </div>
  <main id="main-content" className="safe-bottom top-gap" role="main">{children}</main>
      <div className="fixed bottom-2 left-2 z-50 sm:hidden">
        <StatusCluster labels={{
          online: t.labels.networkOnline,
          offline: t.labels.networkOffline,
          reconnecting: t.labels.networkReconnected,
          slow: t.labels.networkSlow,
        }} />
      </div>
  </ToastProvider>
    </div>
  );
}

export function generateStaticParams() {
  return locales.map((l) => ({ locale: l }));
}

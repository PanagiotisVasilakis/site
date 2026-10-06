import type { Metadata } from "next";
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from "@/i18n/dictionaries";
import { ToastProvider } from "@/components/Toast";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import DeferredRuntimeManagers from "@/components/DeferredRuntimeManagers";
import DocumentLocale from "@/components/DocumentLocale";
import StatusCluster from "@/components/StatusCluster";
import { Icon } from "@/components/icons/Icon";
import { siteUrl } from '@/lib/site';
import { localizedOpenGraph } from '@/lib/seo';

// Removed font variable placeholders.

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  return {
    metadataBase: new URL(siteUrl),
    // No title here: the root layout's default and template give "<page> | <brand>".
    // No description, canonical or og:url either: pages without their own (noindex pages, 404s)
    // would inherit the home page's. Each public page sets them (src/lib/seo.ts).
    openGraph: localizedOpenGraph(eff),
    twitter: { card: 'summary_large_image' },
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
  <SiteHeader locale={eff} />
      {/* Update banner and iOS Add to Home Screen tip (shell.css .pwa-banner): hidden until PwaManager sets
          display: flex; the first <span> holds the message PwaManager rewrites. */}
      <div
        id="update-banner"
        className="pwa-banner hidden"
        aria-live="polite"
        data-t-update-fromto={t.updates.fromTo}
        data-t-assets-fromto={t.updates.assetsFromTo}
      >
          <span>{t.updates.updateAvailable}</span>
          <div className="pwa-banner__actions">
            <button id="update-reload-btn" type="button" className="ui-btn ui-btn--primary ui-btn--sm">{t.updates.refresh}</button>
            <button id="update-dismiss-btn" type="button" aria-label={t.updates.dismiss} className="ui-icon-btn"><Icon name="close" size={20} /></button>
          </div>
      </div>
  <div id="ios-a2hs-tip" role="region" aria-label={t.a2hs.region} className="pwa-banner hidden">
        <span>{t.a2hs.message}</span>
        <button id="ios-tip-close" type="button" aria-label={t.a2hs.close} className="ui-icon-btn"><Icon name="close" size={20} /></button>
      </div>
  <main id="main-content" className="site-main" role="main">{children}</main>
  <SiteFooter locale={eff} />
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

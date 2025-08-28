import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { getDictionary } from "@/i18n/dictionaries";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import StatusCluster from "@/components/StatusCluster";
import PwaManager from "@/components/PwaManager";
import { ToastProvider } from "@/components/Toast";
import Analytics from "@/components/Analytics";
import ThemeToggle from "@/components/ThemeToggle";
import JsonFetchHud from "@/components/JsonFetchHud";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

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
  return (
  <div className={`${geistSans.variable} ${geistMono.variable}`} data-locale={eff}>
  <a href="#main-content" className="skip-link">{t.skipLink || 'Skip to content'}</a>
      <ToastProvider>
      <PwaManager />
      <Analytics />
  <JsonFetchHud />
      <div className="border-b bg-white/70 backdrop-blur safe-top">
        <header className="mx-auto max-w-3xl p-4 text-sm font-medium flex items-center justify-between" style={{ color: 'var(--text-accent)' }}>
          <span>{t.appTitle} <small id="current-version" className="ml-1 text-[10px] font-normal" style={{ color: 'var(--text-accent-subtle)' }}></small></span>
          <div className="flex items-center gap-3">
            <StatusCluster
              className="hidden sm:inline-flex"
              labels={{
                online: t.labels?.networkOnline || 'Online',
                offline: t.labels?.networkOffline || 'Offline',
                slow: t.labels?.networkSlow || 'Slow',
                reconnecting: t.labels?.networkReconnected || 'Reconnected',
                syncPending: t.labels?.syncPending || 'Sync pending',
                syncIdle: t.labels?.syncIdle || 'Synced'
              }}
            />
            <ThemeToggle />
            <LocaleSwitcher />
            <nav aria-label="Locale and install" className="flex items-center gap-2">
              <button id="install-btn" className="hidden items-center gap-1 btn-outline btn-sm">Install</button>
            </nav>
          </div>
        </header>
      </div>
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
  <main id="main-content" className="safe-bottom" role="main">{children}</main>
  </ToastProvider>
    </div>
  );
}

export function generateStaticParams() {
  return locales.map((l) => ({ locale: l }));
}

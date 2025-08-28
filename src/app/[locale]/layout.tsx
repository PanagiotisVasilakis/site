import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { getDictionary } from "@/i18n/dictionaries";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import PwaManager from "@/components/PwaManager";
import Analytics from "@/components/Analytics";
import ThemeToggle from "@/components/ThemeToggle";

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
    <div className={`${geistSans.variable} ${geistMono.variable}`} data-locale={eff} dir={(['ar','he'] as string[]).includes(eff as string) ? 'rtl' : 'ltr'}>
      <PwaManager />
      <Analytics />
      <div className="border-b bg-white/70 backdrop-blur safe-top">
        <header className="mx-auto max-w-3xl p-4 text-sm font-medium flex items-center justify-between" style={{ color: 'var(--brand-800)' }}>
          <span>{t.appTitle} <small id="current-version" className="ml-1 text-[10px] font-normal" style={{ color: 'var(--brand-500)' }}></small></span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
            <nav aria-label="Locale and install" className="flex items-center gap-2">
              <button id="install-btn" className="hidden items-center gap-1 btn-outline btn-sm">Install</button>
            </nav>
          </div>
        </header>
      </div>
      {/* Update banner */}
      <div id="update-banner" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom backdrop-blur border-soft bg-[var(--layer-surface)] text-xs items-center gap-2 shadow rounded-full px-3 py-2" aria-live="polite" style={{ color: 'var(--brand-800)' }}>
        <span>New version available</span>
        <button id="update-reload-btn" className="btn-primary btn-sm">Refresh</button>
      </div>
      {/* iOS Add to Home Screen tip */}
      <div id="ios-a2hs-tip" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border-soft rounded-full px-3 py-2 text-xs items-center gap-2 shadow" style={{ color: 'var(--brand-800)' }}>
        <span>Add to Home Screen: Share → Add to Home Screen</span>
        <button id="ios-tip-close" aria-label="Close" className="btn-outline btn-sm">×</button>
      </div>
      <main className="safe-bottom" role="main">{children}</main>
    </div>
  );
}

export function generateStaticParams() {
  return locales.map((l) => ({ locale: l }));
}

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
        <div className="mx-auto max-w-3xl p-4 text-sm text-teal-800 font-medium flex items-center justify-between">
          <span>{t.appTitle} <small id="current-version" className="ml-1 text-[10px] font-normal text-teal-500 align-super"></small></span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LocaleSwitcher />
            <button id="install-btn" className="hidden items-center gap-1 text-teal-800 border border-teal-200 rounded px-2 py-1 bg-white/80 hover:bg-white">Install</button>
          </div>
        </div>
      </div>
      {/* Update banner */}
      <div id="update-banner" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border border-teal-200 text-teal-900 rounded-full px-3 py-2 text-xs items-center gap-2 shadow" aria-live="polite">
        <span>New version available</span>
        <button id="update-reload-btn" className="px-2 py-1 rounded bg-teal-600 text-white">Refresh</button>
      </div>
      {/* iOS Add to Home Screen tip */}
      <div id="ios-a2hs-tip" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border border-teal-200 text-teal-900 rounded-full px-3 py-2 text-xs items-center gap-2 shadow">
        <span>Add to Home Screen: Share → Add to Home Screen</span>
        <button id="ios-tip-close" aria-label="Close" className="text-teal-700">×</button>
      </div>
      <div className="safe-bottom">{children}</div>
    </div>
  );
}

export function generateStaticParams() {
  return locales.map((l) => ({ locale: l }));
}

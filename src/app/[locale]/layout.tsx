import type { Metadata } from "next";
import { locales, type Locale } from "@/i18n/config";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { getDictionary } from "@/i18n/dictionaries";
import LocaleSwitcher from "@/components/LocaleSwitcher";

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
    <div className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* SW registration + update banner + iOS tip */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function(){
            // Register Service Worker and detect updates
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', async () => {
                try {
                  const reg = await navigator.serviceWorker.register('/sw.js');
                  const showBanner = () => { const b = document.getElementById('update-banner'); if (b) b.style.display = 'flex'; };
                  if (reg.waiting) showBanner();
                  reg.addEventListener('updatefound', () => {
                    const nw = reg.installing; if (!nw) return;
                    nw.addEventListener('statechange', () => {
                      if (nw.state === 'installed' && navigator.serviceWorker.controller) { showBanner(); }
                    });
                  });
                } catch {}
              });
            }
            // iOS Add to Home Screen tip
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator).standalone === true;
            const dismissed = localStorage.getItem('ios-a2hs-dismissed') === '1';
            if (isIOS && !isStandalone && !dismissed) {
              const tip = document.getElementById('ios-a2hs-tip'); if (tip) tip.style.display = 'flex';
            }
            window.addEventListener('DOMContentLoaded', () => {
              const close = document.getElementById('ios-tip-close');
              if (close) close.addEventListener('click', () => { localStorage.setItem('ios-a2hs-dismissed','1'); const t = document.getElementById('ios-a2hs-tip'); if (t) t.style.display='none'; });
              const reload = document.getElementById('update-reload-btn');
              if (reload) reload.addEventListener('click', async () => {
                try {
                  const reg = await navigator.serviceWorker.getRegistration();
                  if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                } catch {}
                window.location.reload();
              });
            });
          })();
        `,
        }}
      />
      <div className="border-b bg-white/70 backdrop-blur safe-top">
        <div className="mx-auto max-w-3xl p-4 text-sm text-teal-800 font-medium flex items-center justify-between">
          <span>{t.appTitle}</span>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <button id="install-btn" className="hidden items-center gap-1 text-teal-800 border border-teal-200 rounded px-2 py-1 bg-white/80 hover:bg-white">Install</button>
          </div>
        </div>
      </div>
      {/* Install prompt logic */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function(){
            let deferredPrompt;
            const btn = document.getElementById('install-btn');
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
            // Hide Install button entirely on iOS where beforeinstallprompt isn't supported
            if (isIOS && btn) { btn.style.display = 'none'; }
            window.addEventListener('beforeinstallprompt', (e) => {
              e.preventDefault();
              deferredPrompt = e;
              if (btn && !isIOS) btn.style.display = 'inline-flex';
            });
            if (btn) {
              btn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                deferredPrompt = null;
                btn.style.display = 'none';
              });
            }
          })();
        `,
        }}
      />
      {/* Update banner */}
      <div id="update-banner" className="hidden fixed bottom-2 left-1/2 -translate-x-1/2 z-50 safe-bottom bg-white/90 backdrop-blur border border-teal-200 text-teal-900 rounded-full px-3 py-2 text-xs items-center gap-2 shadow">
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

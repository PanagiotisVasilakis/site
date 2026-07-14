import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import OfflineActions from "@/components/OfflineActions";
import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OfflineLocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  const greek = eff === "el";
  const homeHref = `/${eff}`;
  return (
    <div className="min-h-screen flex items-center justify-center page-container safe-bottom">
      <div className="max-w-md w-full rounded-xl panel shadow-sm p-6 md:p-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20" style={{ background: 'var(--brand-100)' }} aria-hidden></div>
        <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full opacity-20" style={{ background: 'var(--accent-100)' }} aria-hidden></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" aria-hidden>📡</span>
            <h1 className="text-xl md:text-2xl font-serif italic font-bold">{t.appTitle}</h1>
          </div>
          <p className="text-body text-sm leading-relaxed mb-3">
            {greek
              ? "Δεν υπάρχει σύνδεση στο διαδίκτυο. Το περιεχόμενο που έχετε ήδη ανοίξει παραμένει διαθέσιμο."
              : "You’re offline. Content you opened before is still available."}
          </p>
          <p className="text-body text-xs leading-relaxed mb-6">
            {greek
              ? "Μόλις επανέλθει η σύνδεση, η σελίδα θα προσπαθήσει να ανανεωθεί αυτόματα."
              : "Once the connection is back, the page will try to refresh automatically."}
          </p>
          <div className="text-body text-[11px] mb-2">
            {greek ? "Συμβουλή: ανοίξτε σημαντικές σελίδες όταν είστε online για πρόσβαση αργότερα." : "Tip: open important pages while online so they’re ready later."}
          </div>
          <OfflineActions homeHref={homeHref} homeLabel={t.cta.home} retryLabel={greek ? "Επαναφόρτωση" : "Retry"} />
        </div>
      </div>
    </div>
  );
}

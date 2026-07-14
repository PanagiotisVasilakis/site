import OfflineActions from "@/components/OfflineActions";
import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OfflinePage() {
  return (
    <div className="page-bg min-h-screen flex items-center justify-center p-6 safe-bottom">
      <div className="max-w-md w-full surface-card rounded-xl shadow-sm p-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-40" style={{ background: 'var(--brand-100)' }} aria-hidden></div>
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-100 rounded-full opacity-30" aria-hidden></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" aria-hidden>📡</span>
            <h1 className="text-2xl font-serif italic font-bold section-title">Offline</h1>
          </div>
          <p className="text-sm text-body leading-relaxed mb-3">
            You’re offline. Content you opened before is still available. Once the connection is back, this page will refresh automatically.
          </p>
          <p className="text-xs text-body leading-relaxed mb-6">
            Είστε εκτός σύνδεσης. Το περιεχόμενο που έχετε ήδη ανοίξει παραμένει διαθέσιμο. Μόλις επανέλθει η σύνδεση, η σελίδα θα ανανεωθεί.
          </p>
          <div className="text-body text-[11px] mb-2">Tip: open important pages while online so they’re ready later.</div>
          <OfflineActions homeHref="/" />
        </div>
      </div>
    </div>
  );
}

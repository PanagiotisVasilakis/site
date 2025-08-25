import OfflineActions from "@/components/OfflineActions";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-teal-50 to-white safe-bottom">
      <div className="max-w-md w-full rounded-xl border border-teal-100 bg-white/90 backdrop-blur shadow-sm p-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-teal-100 rounded-full opacity-40" aria-hidden></div>
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-100 rounded-full opacity-30" aria-hidden></div>
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl" aria-hidden>📡</span>
            <h1 className="text-2xl font-semibold text-teal-800">Offline</h1>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            You’re offline. Content you opened before is still available. Once the connection is back, this page will refresh automatically.
          </p>
          <p className="text-xs text-gray-500 leading-relaxed mb-6">
            Είστε εκτός σύνδεσης. Το περιεχόμενο που έχετε ήδη ανοίξει παραμένει διαθέσιμο. Μόλις επανέλθει η σύνδεση, η σελίδα θα ανανεωθεί.
          </p>
          <div className="text-[11px] text-gray-400 mb-2">Tip: open important pages while online so they’re ready later.</div>
          <OfflineActions homeHref="/" />
        </div>
      </div>
    </main>
  );
}

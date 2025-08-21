import Link from "next/link";

export default function OfflinePage() {
  return (
  <main className="mx-auto max-w-3xl p-6 safe-bottom">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-teal-800 mb-2">You’re offline</h1>
        <p className="text-sm text-gray-700 mb-4">Η σύνδεση στο διαδίκτυο δεν είναι διαθέσιμη. Μπορείτε να πλοηγηθείτε σε σελίδες που έχετε ήδη ανοίξει.</p>
  <Link href="/" className="text-teal-700">Go to home</Link>
      </div>
    </main>
  );
}

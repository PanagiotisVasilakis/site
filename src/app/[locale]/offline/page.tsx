import Link from "next/link";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";

export default async function OfflineLocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : "en";
  const t = getDictionary(eff);
  return (
  <main className="mx-auto max-w-3xl p-6 safe-bottom">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-teal-800 mb-2">{t.appTitle}</h1>
        <p className="text-sm text-gray-700 mb-4">You’re offline. {eff === "el" ? "Η σύνδεση δεν είναι διαθέσιμη. Μπορείτε να πλοηγηθείτε σε σελίδες που έχετε ήδη ανοίξει." : "Internet is unavailable. You can still browse pages you’ve already opened."}</p>
        <Link href={`/${eff}`} className="text-teal-700">{t.cta.home}</Link>
      </div>
    </main>
  );
}

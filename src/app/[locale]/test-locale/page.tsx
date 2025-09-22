import { locales, type Locale } from '@/i18n/config';

export default async function TestLocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = (locales as readonly string[]).includes(locale) ? (locale as Locale) : 'en';
  
  return (
    <div className="page-container mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold mb-4">Test Locale Switching</h1>
      <p className="mb-4">Current locale: <strong>{eff}</strong></p>
      <p className="mb-4">
        Try switching languages with query parameters like:
      </p>
      <ul className="list-disc list-inside space-y-2 mb-6">
        <li><code>?mode=signin</code></li>
        <li><code>?test=123&other=abc</code></li>
        <li><code>?checkin=2024-01-01&checkout=2024-01-05</code></li>
      </ul>
      
      <div className="bg-gray-100 p-4 rounded">
        <p className="text-sm">
          The language switcher should preserve all query parameters when switching between EN and EL.
        </p>
      </div>
    </div>
  );
}
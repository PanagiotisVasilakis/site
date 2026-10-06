import { getDictionary } from "@/i18n/dictionaries";
import { normalizeLocale } from '@/i18n/config';
import OfflineActions from "@/components/OfflineActions";
import { STAY_HUB_PATH } from '@/components/shell/shellLinks';
import { EmergencyTile } from '@/components/stay/EmergencyTile';
import { StatusPage } from '@/components/stay/StatusPage';
import type { Metadata } from 'next';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// identity §9.11: a calm page with the mark, the cached pages as link-arrow rows and the 112 band tile.
export default async function OfflineLocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff);
  return (
    <StatusPage title={t.stay.offline.title} lead={t.stay.offline.lead}>
      <OfflineActions
        retryLabel={t.stay.offline.retry}
        links={[
          { href: `/${eff}`, label: t.cta.home },
          { href: `/${eff}${STAY_HUB_PATH}`, label: t.ui.yourStay },
          { href: `/${eff}/moments`, label: t.shell.navGuide },
          { href: `/${eff}/phones`, label: t.guide.phonesTitle },
        ]}
      />
      <EmergencyTile label={t.stay.offline.emergency} text={t.stay.offline.emergencyText} />
      <p className="status-page__note">{t.stay.offline.tip}</p>
    </StatusPage>
  );
}

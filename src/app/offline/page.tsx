import OfflineActions from "@/components/OfflineActions";
import { EmergencyTile } from '@/components/stay/EmergencyTile';
import { StatusPage } from '@/components/stay/StatusPage';
import { getDictionary } from '@/i18n/dictionaries';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline',
  robots: { index: false, follow: false },
};

// identity §9.11, unlocalized fallback: English first, with the Greek message below it.
export default function OfflinePage() {
  const en = getDictionary('en');
  const el = getDictionary('el');
  return (
    <main id="main-content" className="status-main" role="main">
      <StatusPage title={en.stay.offline.title} lead={en.stay.offline.lead}>
        <p className="status-page__lead status-page__lead--second" lang="el">
          {el.stay.offline.title}. {el.stay.offline.lead}
        </p>
        <OfflineActions
          retryLabel={en.stay.offline.retry}
          links={[
            { href: '/en', label: en.cta.home },
            { href: '/el', label: el.cta.home },
          ]}
        />
        <EmergencyTile label={en.stay.offline.emergency} text={en.stay.offline.emergencyText} />
      </StatusPage>
    </main>
  );
}

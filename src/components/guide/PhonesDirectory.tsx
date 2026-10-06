import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Icon } from '@/components/icons/Icon';
import { Button } from '@/components/ui/Button';
import { getDictionary, type Dictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { telHref } from '@/lib/contactLinks';
import type { GuideEntry } from './guideEntries';

/** The 112 entry is the emergency band, not a row (§9.6). */
const EMERGENCY_ID = 'emergency-112';

type GroupKey = keyof Dictionary['guide']['phoneGroups'];

const GROUP_TAGS: Array<[GroupKey, readonly string[]]> = [
  ['emergency', ['emergency', 'police', 'safety']],
  ['health', ['health', 'medical', 'hospital']],
  ['transport', ['transport', 'taxi']],
];

function groupOf(entry: GuideEntry): GroupKey {
  return GROUP_TAGS.find(([, tags]) => entry.tags.some((tag) => tags.includes(tag)))?.[0] ?? 'other';
}

/**
 * identity §9.6 Important phones (calm): the emergency band first ("112, free from any phone, EU-wide" and a
 * 56 px on-band "Call 112"), then rows grouped by service, separated by hairlines, no cards. Each row: a
 * 64 px thumbnail (or an icon disc), the name (to its detail page), the description, every number as a
 * tel: link, and a 48 px "Call" button. The SOS illustration is not used (§7.3).
 */
export function PhonesDirectory({ entries, locale, title, lead }: { entries: GuideEntry[]; locale: Locale; title: string; lead?: string }) {
  const t = getDictionary(locale);
  const emergency = entries.find((entry) => entry.id === EMERGENCY_ID);
  const rows = entries.filter((entry) => entry.id !== EMERGENCY_ID);
  const grouped = (['emergency', 'health', 'transport', 'other'] as const)
    .map((key) => ({ key, rows: rows.filter((entry) => groupOf(entry) === key) }))
    .filter((group) => group.rows.length > 0);
  // The calm-mode stagger (M25) runs across the groups: each group starts after the previous rows.
  const groups = grouped.map((group, position) => ({
    ...group,
    offset: grouped.slice(0, position).reduce((sum, previous) => sum + previous.rows.length, 0),
  }));

  return (
    <div className="guide-page guide-page--phones">
      <header className="guide-head">
        <div className="guide-head__text">
          <h1 className="guide-head__title">{title}</h1>
          {lead ? <p className="guide-head__lead">{lead}</p> : null}
        </div>
      </header>

      <section className="sos-band" aria-labelledby="sos-title">
        <div className="sos-band__text">
          <h2 id="sos-title" className="sos-band__title">{t.guide.emergencyTitle}</h2>
          {emergency?.summary ? <p className="sos-band__lead">{emergency.summary}</p> : null}
        </div>
        <Button asChild variant="on-band" size="lg">
          <a href="tel:112">
            <Icon name="phone" size={22} />
            {t.guide.call112}
          </a>
        </Button>
      </section>

      {groups.map((group) => (
        <section key={group.key} className="phone-group" aria-labelledby={`phones-${group.key}`}>
          <h2 id={`phones-${group.key}`} className="phone-group__title">{t.guide.phoneGroups[group.key]}</h2>
          <ul className="phone-rows">
            {group.rows.map((entry, position) => {
              const call = telHref(entry.phones[0]);
              const style = { '--i': group.offset + position } as CSSProperties;
              return (
                <li key={entry.id} className="phone-row" style={style}>
                  <span className="phone-row__thumb" aria-hidden>
                    {entry.photo ? (
                      <Image
                        src={entry.photo}
                        alt=""
                        width={64}
                        height={64}
                        sizes="64px"
                        className="phone-row__img"
                        style={{ objectPosition: entry.photoPosition ?? 'center' }}
                      />
                    ) : (
                      <Icon name={entry.icon} size={28} />
                    )}
                  </span>
                  <div className="phone-row__body">
                    <h3 className="phone-row__name">
                      <Link href={entry.href} className="phone-row__link shell-link">{entry.name}</Link>
                    </h3>
                    {entry.summary ? <p className="phone-row__text">{entry.summary}</p> : null}
                    <p className="phone-row__numbers">
                      {entry.phones.map((number) => (
                        <a key={number} href={telHref(number)} className="phone-row__number shell-link">{number}</a>
                      ))}
                    </p>
                  </div>
                  {call ? (
                    <Button asChild variant="secondary" size="md" className="phone-row__call">
                      <a href={call} aria-label={t.guide.callNamed.replace('{name}', entry.name)}>
                        <Icon name="phone" size={18} />
                        {t.cta.call}
                      </a>
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

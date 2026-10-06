import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { BRAND_NAME } from '@/data/brand';
import { HOST_CONTACT } from '@/data/contact';
import { GUEST_DATA_RETENTION_MONTHS } from '@/data/stayPolicy';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { telHref } from '@/lib/contactLinks';
import { localizedAlternates, localizedOpenGraph } from '@/lib/seo';

// Static privacy and storage notice (R3-L2). No consent banner: the site sets no analytics or
// advertising trackers (see the storage section).

type PrivacyPageProps = { params: Promise<{ locale: string }> };

/**
 * The controller's legal name and address come with R3-L1. They are optional here so that
 * adding them to HOST_CONTACT shows them without a layout change; until then they are omitted.
 */
const CONTROLLER: Readonly<{ legalName?: string; address?: string; email: string; phone: string }> = HOST_CONTACT;

const DPA_URL = 'https://www.dpa.gr';

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const t = getDictionary(eff).legal.privacy;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: localizedAlternates(eff, '/privacy'),
    openGraph: localizedOpenGraph(eff, '/privacy'),
  };
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="legal-page__section">
      <h2 id={`${id}-title`} className="legal-page__heading">{title}</h2>
      {children}
    </section>
  );
}

function EmailLink() {
  return <a href={`mailto:${HOST_CONTACT.email}`} className="legal-page__link">{HOST_CONTACT.email}</a>;
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale } = await params;
  const eff = normalizeLocale(locale);
  const dictionary = getDictionary(eff);
  const t = dictionary.legal.privacy;
  const months = String(GUEST_DATA_RETENTION_MONTHS);
  const tel = telHref(CONTROLLER.phone);

  const controllerRows: Array<{ label: string; value: ReactNode }> = [
    { label: t.controller.brandLabel, value: BRAND_NAME },
    ...(CONTROLLER.legalName ? [{ label: t.controller.legalNameLabel, value: CONTROLLER.legalName }] : []),
    ...(CONTROLLER.address ? [{ label: t.controller.addressLabel, value: CONTROLLER.address }] : []),
    { label: t.controller.emailLabel, value: <EmailLink /> },
    {
      label: t.controller.phoneLabel,
      value: tel ? <a href={tel} className="legal-page__link">{CONTROLLER.phone}</a> : CONTROLLER.phone,
    },
  ];

  return (
    <article className="legal-page">
      <header className="legal-page__header">
        <h1 className="legal-page__title">{t.title}</h1>
        <p className="legal-page__lead">{t.intro}</p>
      </header>

      <Section id="controller" title={t.controller.title}>
        <p>{t.controller.intro}</p>
        <dl className="legal-page__terms">
          {controllerRows.map((row) => (
            <div key={row.label} className="legal-page__term">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="purposes" title={t.purposes.title}>
        {t.purposes.items.map((item) => (
          <div key={item.title} className="legal-page__item">
            <h3 className="legal-page__subheading">{item.title}</h3>
            <p>{item.text}</p>
            <p className="legal-page__basis">{item.basis}</p>
          </div>
        ))}
      </Section>

      <Section id="recipients" title={t.recipients.title}>
        {t.recipients.items.map((item) => (
          <div key={item.title} className="legal-page__item">
            <h3 className="legal-page__subheading">{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </Section>

      <Section id="location" title={t.location.title}>
        {t.location.paragraphs.map((text) => (
          <p key={text}>{text.replace('{button}', dictionary.map.locateMe)}</p>
        ))}
      </Section>

      <Section id="retention" title={t.retention.title}>
        <ul className="legal-page__list">
          {t.retention.items.map((text) => (
            <li key={text}>{text.replaceAll('{months}', months)}</li>
          ))}
        </ul>
      </Section>

      <Section id="rights" title={t.rights.title}>
        <p>{t.rights.text}</p>
        <p>{t.rights.contact} <EmailLink /></p>
        <p>{t.rights.deadline}</p>
      </Section>

      <Section id="complaint" title={t.complaint.title}>
        <p>
          {t.complaint.text}{' '}
          <a href={DPA_URL} className="legal-page__link" target="_blank" rel="noopener noreferrer">www.dpa.gr</a>
        </p>
      </Section>

      <Section id="storage" title={t.storage.title}>
        <p>{t.storage.intro}</p>
        <h3 className="legal-page__subheading">{t.storage.cookiesTitle}</h3>
        <dl className="legal-page__terms">
          {Object.entries(t.storage.cookies).map(([name, purpose]) => (
            <div key={name} className="legal-page__term">
              <dt><code>{name}</code></dt>
              <dd>{purpose}</dd>
            </div>
          ))}
        </dl>
        <h3 className="legal-page__subheading">{t.storage.localStorageTitle}</h3>
        <dl className="legal-page__terms">
          {Object.entries(t.storage.localStorage).map(([name, purpose]) => (
            <div key={name} className="legal-page__term">
              <dt><code>{name}</code></dt>
              <dd>{purpose}</dd>
            </div>
          ))}
        </dl>
        <h3 className="legal-page__subheading">{t.storage.sessionStorageTitle}</h3>
        <dl className="legal-page__terms">
          {Object.entries(t.storage.sessionStorage).map(([name, purpose]) => (
            <div key={name} className="legal-page__term">
              <dt><code>{name}</code></dt>
              <dd>{purpose}</dd>
            </div>
          ))}
        </dl>
        <h3 className="legal-page__subheading">{t.storage.cacheTitle}</h3>
        <p>{t.storage.cache}</p>
      </Section>
    </article>
  );
}

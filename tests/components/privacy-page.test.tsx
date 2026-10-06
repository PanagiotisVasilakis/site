// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PrivacyPage, { generateMetadata } from '@/app/[locale]/privacy/page';
import { HOST_CONTACT } from '@/data/contact';
import { GUEST_DATA_RETENTION_MONTHS } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

async function renderPage(locale: Locale) {
  return render(await PrivacyPage({ params: Promise.resolve({ locale }) }));
}

describe.each(['en', 'el'] as const)('privacy notice /%s/privacy', (locale) => {
  const t = getDictionary(locale).legal.privacy;

  it('renders the title and every section heading', async () => {
    await renderPage(locale);
    expect(screen.getByRole('heading', { level: 1, name: t.title })).toBeInTheDocument();
    const sections = [
      t.controller.title, t.purposes.title, t.recipients.title, t.location.title,
      t.retention.title, t.rights.title, t.complaint.title, t.storage.title,
    ];
    for (const title of sections) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it('gives the contact e-mail as a mailto link in the controller and rights sections', async () => {
    await renderPage(locale);
    const links = screen.getAllByRole('link', { name: HOST_CONTACT.email });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link).toHaveAttribute('href', `mailto:${HOST_CONTACT.email}`);
    const controller = screen.getByRole('region', { name: t.controller.title });
    expect(within(controller).getByText(HOST_CONTACT.phone)).toBeInTheDocument();
  });

  it('names every cookie and browser storage key it lists', async () => {
    await renderPage(locale);
    const storage = screen.getByRole('region', { name: t.storage.title });
    for (const name of [...Object.keys(t.storage.cookies), ...Object.keys(t.storage.localStorage), ...Object.keys(t.storage.sessionStorage)]) {
      expect(within(storage).getByText(name, { selector: 'code' })).toBeInTheDocument();
    }
  });

  it('states the guest data retention months from the policy constant', async () => {
    await renderPage(locale);
    const retention = screen.getByRole('region', { name: t.retention.title });
    expect(retention.textContent).toContain(String(GUEST_DATA_RETENTION_MONTHS));
  });

  it('links the supervisory authority', async () => {
    await renderPage(locale);
    expect(screen.getByRole('link', { name: 'www.dpa.gr' })).toHaveAttribute('href', 'https://www.dpa.gr');
  });

  it('leaves no placeholder or unfilled template on the page', async () => {
    const { container } = await renderPage(locale);
    expect(container.textContent).not.toMatch(/\bTBD\b|\bTODO\b|<…>|\{\w+\}/);
  });

  it('publishes localized alternates', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.title).toBe(t.metaTitle);
    expect(metadata.alternates).toEqual({
      canonical: `/${locale}/privacy`,
      languages: { en: '/en/privacy', el: '/el/privacy', 'x-default': '/en/privacy' },
    });
  });
});

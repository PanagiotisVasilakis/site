// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import PrivacyPage from '@/app/[locale]/privacy/page';
import { GUEST_DATA_RETENTION_MONTHS } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';

async function renderPage(locale: Locale) {
  return render(await PrivacyPage({ params: Promise.resolve({ locale }) }));
}

describe.each(['en', 'el'] as const)('privacy notice /%s/privacy', (locale) => {
  const t = getDictionary(locale).legal.privacy;

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

  it('lists no name or e-mail among the arrival details the portal stores', async () => {
    await renderPage(locale);
    // check_in_requests.guest_name and guest_email are never written (R-450). The only e-mail
    // address on the page outside these three sections is the host's (controller and rights).
    const name = locale === 'en' ? /\bname\b/i : /όνομα/i;
    for (const title of [t.purposes.title, t.recipients.title, t.retention.title]) {
      const section = screen.getByRole('region', { name: title });
      expect(section.textContent).not.toMatch(/e-?mail/i);
      expect(section.textContent).not.toMatch(name);
    }
  });

  it('states how long the web server error log is kept', async () => {
    await renderPage(locale);
    const retention = screen.getByRole('region', { name: t.retention.title });
    const item = within(retention).getByText(locale === 'en' ? /\b14 days\./u : /\b14 ημέρες\./u);
    expect(item.tagName).toBe('LI');
    expect(item.textContent).toMatch(/\bIP\b/);
  });

  it('links the supervisory authority', async () => {
    await renderPage(locale);
    expect(screen.getByRole('link', { name: 'www.dpa.gr' })).toHaveAttribute('href', 'https://www.dpa.gr');
  });

  it('leaves no placeholder or unfilled template on the page', async () => {
    const { container } = await renderPage(locale);
    expect(container.textContent).not.toMatch(/\bTBD\b|\bTODO\b|<…>|\{\w+\}/);
  });
});

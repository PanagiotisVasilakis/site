import { describe, expect, it } from 'vitest';

import { generateMetadata } from '@/app/[locale]/check-in/page';

describe('check-in page metadata', () => {
  it.each([
    ['el', 'Πληροφορίες άφιξης'],
    ['en', 'Check-in information'],
    ['xx', 'Check-in information'],
  ])('uses the %s title and stays out of search indexes', async (locale, title) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });

    expect(metadata).toEqual({ robots: { index: false, follow: false }, title });
  });
});

import { describe, expect, it } from 'vitest';

import { generateMetadata } from '@/app/[locale]/layout';
import { siteUrl } from '@/lib/site';

describe('locale layout metadata', () => {
  it('leaves the description, canonical, og:url and title unset for pages without their own', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'el' }) });

    // Noindex pages (/stay, /guest, …) and 404s used to inherit the home page canonical.
    expect(metadata.description).toBeUndefined();
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty('url');
    expect(metadata.openGraph).toMatchObject({ images: [expect.objectContaining({ url: `${siteUrl}/og/og-el.jpg` })] });
    expect(metadata.twitter).toEqual({ card: 'summary_large_image' });

    // A string title here resolves to { template: null } in Next's metadata
    // resolution and would clear the root "%s | Dolce Far Niente · Kalamata"
    // template for every page under /[locale].
    expect(metadata.title).toBeUndefined();
  });
});

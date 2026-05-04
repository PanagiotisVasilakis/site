import type { ReactElement } from 'react';
import PortalRefreshPage from '@/app/[locale]/portal/refresh/page';
import PortalRefreshRedirect from '@/components/PortalRefreshRedirect';

type PortalRefreshElement = ReactElement<{
  refreshHref: string;
  failureHref: string;
}>;

async function renderPage(locale: string, searchParams: { next?: string; failure?: string } = {}) {
  return await PortalRefreshPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(searchParams),
  }) as PortalRefreshElement;
}

describe('PortalRefreshPage', () => {
  it('passes safe local redirect paths to the API refresh endpoint', async () => {
    const element = await renderPage('en', {
      next: '/en/check-in',
      failure: '/en/guest?flash=Please%20sign%20in',
    });

    expect(element.type).toBe(PortalRefreshRedirect);
    expect(element.props.failureHref).toBe('/en/guest?flash=Please%20sign%20in');
    expect(element.props.refreshHref).toBe(
      '/api/portal/refresh?next=%2Fen%2Fcheck-in&failure=%2Fen%2Fguest%3Fflash%3DPlease%2520sign%2520in',
    );
  });

  it('falls back when redirect paths are not local', async () => {
    const element = await renderPage('fr', {
      next: 'https://example.com/check-in',
      failure: '//example.com/sign-in',
    });
    const fallbackFailure = '/en/guest?flash=Please%20sign%20in%20to%20access%20check-in%20information';

    expect(element.props.failureHref).toBe(fallbackFailure);
    expect(element.props.refreshHref).toBe(
      `/api/portal/refresh?next=%2Fen%2Fcheck-in&failure=${encodeURIComponent(fallbackFailure)}`,
    );
  });
});

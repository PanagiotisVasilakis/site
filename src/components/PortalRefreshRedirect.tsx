"use client";

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons/Icon';
import { StatusPage } from '@/components/stay/StatusPage';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { refreshPortalSession } from '@/lib/portalRefreshClient';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

type PortalRefreshRedirectProps = {
  locale: string;
  refreshHref: string;
  failureHref: string;
};

/** identity §9.8: no spinner; after this long the page says "Still working…" and offers the manual link. */
const STILL_WORKING_MS = 5_000;

export default function PortalRefreshRedirect({
  locale,
  refreshHref,
  failureHref,
}: PortalRefreshRedirectProps) {
  const t = getDictionary(normalizeLocale(locale)).stay.refresh;
  const navigationStarted = useRef(false);
  const [stillWorking, setStillWorking] = useState(false);
  const safeFailureLink = toSafeLocalPath(failureHref) ?? '/';

  useEffect(() => {
    const timer = setTimeout(() => setStillWorking(true), STILL_WORKING_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const baseHref = window.location.href;

    void refreshPortalSession({
      refreshHref,
      baseHref,
      signal: controller.signal,
    }).then((result) => {
      if (!active || result.status === 'aborted' || navigationStarted.current) return;

      const safeFailureHref = toSafeLocalPath(failureHref, baseHref) || '/';
      const destination = result.status === 'refreshed' ? result.href : safeFailureHref;
      navigationStarted.current = true;
      window.location.replace(destination);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [failureHref, refreshHref]);

  return (
    <StatusPage title={t.title} lead={stillWorking ? t.stillWorking : t.lead} role="status">
      {stillWorking ? (
        <a className="ui-btn ui-btn--link-arrow status-page__link" href={safeFailureLink}>
          {t.signIn}
          <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
        </a>
      ) : (
        // Without client code neither the refresh nor the timer runs, so the manual link is there from the start.
        <noscript>
          <a className="ui-btn ui-btn--link-arrow status-page__link" href={safeFailureLink}>
            {t.signIn}
            <Icon name="arrow-right" size={18} className="ui-btn__arrow" />
          </a>
        </noscript>
      )}
    </StatusPage>
  );
}

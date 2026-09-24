"use client";

import { useEffect, useRef } from 'react';
import { refreshPortalSession } from '@/lib/portalRefreshClient';
import { toSafeLocalPath } from '@/lib/safeLocalPath';

type PortalRefreshRedirectProps = {
  refreshHref: string;
  failureHref: string;
};

export default function PortalRefreshRedirect({
  refreshHref,
  failureHref,
}: PortalRefreshRedirectProps) {
  const navigationStarted = useRef(false);
  const safeFailureLink = toSafeLocalPath(failureHref) ?? '/';

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
    <div className="page-bg min-h-[50vh] px-4 py-10">
      <div className="surface-card mx-auto max-w-md rounded-lg p-6 text-center shadow-sm">
        <h1 className="page-title text-xl font-serif italic font-bold">Refreshing your session</h1>
        <p className="mt-3 text-sm text-body" role="status">
          Please wait while we restore access to your check-in information.
        </p>
        <a className="btn-primary mt-5" href={safeFailureLink}>
          Sign in instead
        </a>
      </div>
    </div>
  );
}

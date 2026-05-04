"use client";

import { useEffect } from 'react';

type PortalRefreshRedirectProps = {
  refreshHref: string;
  failureHref: string;
};

export default function PortalRefreshRedirect({ refreshHref, failureHref }: PortalRefreshRedirectProps) {
  useEffect(() => {
    window.location.replace(refreshHref);
  }, [refreshHref]);

  return (
    <div className="page-bg min-h-[50vh] px-4 py-10">
      <div className="surface-card mx-auto max-w-md rounded-lg p-6 text-center shadow-sm">
        <h1 className="page-title text-xl font-serif italic font-bold">Refreshing your session</h1>
        <p className="mt-3 text-sm text-body">
          Please wait while we restore access to your check-in information.
        </p>
        <a className="btn-primary mt-5" href={failureHref}>
          Sign in instead
        </a>
      </div>
    </div>
  );
}

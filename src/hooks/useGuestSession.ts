import { useState, useEffect, useCallback, useRef } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import {
  emitGuestSessionChanged,
  onGuestSessionChange,
  SESSION_SIGNAL_SOURCE_ID,
} from '@/lib/sessionSignals';
import { logger } from '@/lib/logger-client';

const MAX_REFRESH_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5_000;

type StatusOutcome =
  | { kind: 'resolved'; isSignedIn: boolean; portalEnabled: boolean; checkinEnabled: boolean }
  | { kind: 'portal_off' }
  | { kind: 'transient_error'; portalEnabled?: boolean; checkinEnabled?: boolean };

type RefreshOutcome = 'refreshed' | 'unauthorized' | 'portal_off' | 'transient_error';

let inFlightStatus: Promise<StatusOutcome> | null = null;
let inFlightRefresh: Promise<RefreshOutcome> | null = null;

function retryDelayFrom(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return DEFAULT_RETRY_DELAY_MS;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_RETRY_DELAY_MS);
  const retryAt = Date.parse(retryAfter);
  if (Number.isNaN(retryAt)) return DEFAULT_RETRY_DELAY_MS;
  return Math.min(Math.max(0, retryAt - Date.now()), MAX_RETRY_DELAY_MS);
}

async function isConcurrentRefresh(response: Response): Promise<boolean> {
  if (response.status !== 409) return false;
  try {
    const body = await response.json() as { code?: string; error?: string | { code?: string } };
    const code = typeof body.error === 'object' ? body.error?.code : body.code;
    return code === 'REFRESH_IN_PROGRESS';
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function refreshSessionOnce(): Promise<RefreshOutcome> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<RefreshOutcome> => {
    for (let attempt = 1; attempt <= MAX_REFRESH_ATTEMPTS; attempt += 1) {
      try {
        const response = await internalFetch('/api/portal/refresh', {
          method: 'POST',
          headers: { accept: 'application/json' },
        });
        if (await isConcurrentRefresh(response)) {
          if (attempt === MAX_REFRESH_ATTEMPTS) return 'transient_error';
          await wait(retryDelayFrom(response));
          continue;
        }
        if (response.ok) {
          emitGuestSessionChanged('refresh');
          return 'refreshed';
        }
        if (response.status === 404) return 'portal_off';
        if (response.status === 401) return 'unauthorized';
        return 'transient_error';
      } catch {
        return 'transient_error';
      }
    }
    return 'transient_error';
  })().finally(() => {
    inFlightRefresh = null;
  });

  return inFlightRefresh;
}

function fetchSessionStatusOnce(): Promise<StatusOutcome> {
  if (inFlightStatus) return inFlightStatus;

  inFlightStatus = (async (): Promise<StatusOutcome> => {
    try {
      const res = await internalFetch('/api/portal/sessions', {
        method: 'GET',
        headers: { 'cache-control': 'no-cache' },
      });

      if (res.status === 404) return { kind: 'portal_off' };
      if (!res.ok) return { kind: 'transient_error' };

      const body = await res.json().catch(() => null);
      const checkinEnabled = body?.data?.checkinEnabled === true;

      if (body?.data?.authenticated === true) {
        return { kind: 'resolved', isSignedIn: true, portalEnabled: true, checkinEnabled };
      }

      if (body?.data?.refreshable === true) {
        const refreshed = await refreshSessionOnce();
        if (refreshed === 'refreshed') {
          return { kind: 'resolved', isSignedIn: true, portalEnabled: true, checkinEnabled };
        }
        if (refreshed === 'portal_off') return { kind: 'portal_off' };
        if (refreshed === 'unauthorized') {
          return { kind: 'resolved', isSignedIn: false, portalEnabled: true, checkinEnabled };
        }
        return { kind: 'transient_error', portalEnabled: true, checkinEnabled };
      }

      return { kind: 'resolved', isSignedIn: false, portalEnabled: true, checkinEnabled };
    } catch {
      return { kind: 'transient_error' };
    }
  })().finally(() => {
    inFlightStatus = null;
  });

  return inFlightStatus;
}

export function useGuestSession() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  // Off until the status request answers 200, so the shell offers no link that may lead to a 404.
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [checkinEnabled, setCheckinEnabled] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);

  const checkSession = useCallback(async () => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    const outcome = await fetchSessionStatusOnce();
    if (!mounted.current || version !== requestVersion.current) return;

    if (outcome.kind === 'resolved') {
      setIsSignedIn(outcome.isSignedIn);
      setPortalEnabled(outcome.portalEnabled);
      setCheckinEnabled(outcome.checkinEnabled);
      setFlagsLoaded(true);
    } else if (outcome.kind === 'portal_off') {
      setIsSignedIn(false);
      setPortalEnabled(false);
      setCheckinEnabled(false);
      setFlagsLoaded(true);
    } else if (outcome.portalEnabled !== undefined) {
      setPortalEnabled(outcome.portalEnabled);
      setCheckinEnabled(outcome.checkinEnabled === true);
      setFlagsLoaded(true);
    }
  }, []);

  const signOut = useCallback(async (): Promise<boolean> => {
    requestVersion.current += 1;
    try {
      const response = await internalFetch('/api/portal/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Logout failed with status ${response.status}`);
      }
      if (mounted.current) setIsSignedIn(false);
      emitGuestSessionChanged('signout');
      return true;
    } catch (error) {
      logger.error('Guest logout failed', error instanceof Error ? error : { error: String(error) });
      return false;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    // Initial check
    void checkSession();

    function onVisibility() {
      if (document.visibilityState === 'visible') void checkSession();
    }
    function onFocus() {
      void checkSession();
    }

    // Instant cross-tab reaction
    const unsubscribe = onGuestSessionChange((event) => {
      if (event.reason === 'signout') {
        requestVersion.current += 1;
        setIsSignedIn(false);
        return;
      }
      if (event.reason === 'refresh' && event.sourceId === SESSION_SIGNAL_SOURCE_ID) {
        return;
      }
      void checkSession();
    });

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    // Periodic poll
    const checker = window.setInterval(() => void checkSession(), 5 * 60_000);

    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      unsubscribe();
      window.clearInterval(checker);
      requestVersion.current += 1;
    };
  }, [checkSession]);

  return { isSignedIn, portalEnabled, checkinEnabled, flagsLoaded, signOut };
}

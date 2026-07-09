import { useState, useEffect, useCallback, useRef } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { emitGuestSessionChanged, onGuestSessionChange } from '@/lib/sessionSignals';
import { logger } from '@/lib/logger-client';

interface UseGuestSessionOptions {
    initialIsSignedIn?: boolean;
    enabled?: boolean;
}

export function useGuestSession({ initialIsSignedIn = false, enabled = true }: UseGuestSessionOptions = {}) {
    const [isSignedIn, setIsSignedIn] = useState(initialIsSignedIn);
    const checkerRef = useRef<number | null>(null);
    const inFlight = useRef<AbortController | null>(null);

    const checkSession = useCallback(async () => {
        if (!enabled) {
            setIsSignedIn(false);
            return;
        }

        try {
            // Avoid overlapping calls
            inFlight.current?.abort();
            const ac = new AbortController();
            inFlight.current = ac;

            const res = await internalFetch('/api/check-in', {
                method: 'GET',
                signal: ac.signal,
                headers: { 'cache-control': 'no-cache' }
            });

            const ok = res.ok; // 200 when session verified
            setIsSignedIn(ok);
        } catch {
            // Preserve the last verified state during transient network failures.
        }
    }, [enabled]);

    const signOut = useCallback(async () => {
        try {
            const response = await internalFetch('/api/portal/logout', { method: 'POST' });
            if (!response.ok) {
                throw new Error(`Logout failed with status ${response.status}`);
            }
            setIsSignedIn(false);
            emitGuestSessionChanged('signout');
        } catch (error) {
            logger.error('Guest logout failed', error instanceof Error ? error : { error: String(error) });
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;

        // Initial check
        checkSession();

        function onVisibility() {
            if (document.visibilityState === 'visible') checkSession();
        }
        function onFocus() {
            checkSession();
        }

        // Instant cross-tab reaction
        const unsubscribe = onGuestSessionChange((event) => {
            if (event.reason === 'signout') {
                setIsSignedIn(false);
                return;
            }
            void checkSession();
        });

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);

        // Periodic poll
        checkerRef.current = window.setInterval(checkSession, 5 * 60_000);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
            unsubscribe?.();
            if (checkerRef.current !== null) window.clearInterval(checkerRef.current);
            inFlight.current?.abort();
        };
    }, [enabled, checkSession]);

    return { isSignedIn, signOut, checkSession };
}

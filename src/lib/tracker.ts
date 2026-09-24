"use client";
import { trackEvent as baseTrack } from '@/lib/analyticsClient';

// Event-specific prop shapes (PII-free)
export type EventProps =
  | { name: 'portal_opened'; props: { source?: string } }
  | { name: 'form_submitted'; props: { form: 'sign-in' | 'sign-up' } }
  | { name: 'auth_mode_changed'; props: { mode: 'signin' | 'signup' } }
  | { name: 'checkin_viewed'; props?: Record<string, never> };

function trimStr(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) : s;
}

type PropsOf<N extends EventProps['name']> = Extract<EventProps, { name: N }>['props'];
function sanitize<K extends EventProps['name']>(name: K, props: PropsOf<K> | unknown): Record<string, unknown> | undefined {
  switch (name) {
    case 'portal_opened':
      if (props && typeof (props as PropsOf<'portal_opened'>).source === 'string') {
        return { source: trimStr((props as PropsOf<'portal_opened'>).source!, 20) };
      }
      return {};
    case 'form_submitted': {
      const p = props as PropsOf<'form_submitted'> | undefined;
      const form = p?.form === 'sign-in' || p?.form === 'sign-up' ? p.form : undefined;
      return form ? { form } : {};
    }
    case 'auth_mode_changed': {
      const p = props as PropsOf<'auth_mode_changed'> | undefined;
      const mode = p?.mode === 'signin' || p?.mode === 'signup' ? p.mode : 'signin';
      return { mode };
    }
    case 'checkin_viewed':
      return {};
    default:
      return undefined;
  }
}

function track(e: EventProps) {
  try {
    const safe = sanitize(e.name, e.props ?? {});
    baseTrack(e.name, safe);
    if (process.env.NODE_ENV === 'development') {
      // Visible in dev tools for quick verification
      console.debug('[analytics]', e.name, safe);
    }
  } catch {}
}

// Convenience helpers
export const tracker = {
  portalOpened: (source?: string) => track({ name: 'portal_opened', props: { source } }),
  formSubmitted: (form: 'sign-in' | 'sign-up') => track({ name: 'form_submitted', props: { form } }),
  authModeChanged: (mode: 'signin' | 'signup') => track({ name: 'auth_mode_changed', props: { mode } }),
  checkinViewed: () => track({ name: 'checkin_viewed' }),
};

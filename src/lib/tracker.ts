"use client";
import { trackEvent as baseTrack, ensureFunnel } from '@/lib/analyticsClient';

// Allowed event names
export type TrackerEventName =
  | 'portal_opened'
  | 'origin_selected'
  | 'form_submitted'
  | 'auth_mode_changed'
  | 'no_booking_cta_clicked'
  | 'checkin_viewed'
  | 'checkin_completed';

// Event-specific prop shapes (PII-free)
export type EventProps =
  | { name: 'portal_opened'; props: { source?: string } }
  | { name: 'origin_selected'; props: { origin: 'GR' | 'ABROAD'; mode?: 'signup' } }
  | { name: 'form_submitted'; props: { form: 'sign-in' | 'sign-up' } }
  | { name: 'auth_mode_changed'; props: { mode: 'signin' | 'signup' } }
  | { name: 'no_booking_cta_clicked'; props: { ref?: string; from?: 'guest' | 'home' } }
  | { name: 'checkin_viewed'; props?: Record<string, never> }
  | { name: 'checkin_completed'; props?: Record<string, never> };

function trimStr(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// Collapse arbitrary reasons into coarse categories to avoid PII
export function categorizeReason(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('network') || r.includes('fetch')) return 'network_error';
  if (r.includes('timeout')) return 'timeout';
  if (r.includes('invalid') && r.includes('afm')) return 'validation_afm';
  if (r.includes('validation')) return 'validation';
  if (r.includes('unauthorized') || r.includes('forbidden')) return 'auth';
  if (r.includes('not found') || r.includes('404')) return 'not_found';
  return trimStr('other');
}

function sanitize<K extends EventProps['name']>(name: K, props: any): Record<string, unknown> | undefined {
  switch (name) {
    case 'portal_opened':
      return props && typeof props.source === 'string' ? { source: trimStr(props.source, 20) } : {};
    case 'origin_selected': {
      const origin = props?.origin === 'GR' || props?.origin === 'ABROAD' ? props.origin : undefined;
      const mode = props?.mode === 'signup' ? 'signup' : undefined;
      return { ...(origin ? { origin } : {}), ...(mode ? { mode } : {}) };
    }
    case 'form_submitted': {
      const form = props?.form === 'sign-in' || props?.form === 'sign-up' ? props.form : undefined;
      return form ? { form } : {};
    }
    case 'auth_mode_changed': {
      const mode = props?.mode === 'signin' || props?.mode === 'signup' ? props.mode : 'signin';
      return { mode };
    }
    case 'no_booking_cta_clicked': {
      const from = props?.from === 'guest' || props?.from === 'home' ? props.from : undefined;
      const ref = typeof props?.ref === 'string' ? trimStr(props.ref, 80) : undefined;
      return { ...(from ? { from } : {}), ...(ref ? { ref } : {}) };
    }
    case 'checkin_viewed':
    case 'checkin_completed':
      return {};
    default:
      return undefined;
  }
}

export function track(e: EventProps) {
  try {
    ensureFunnel();
    const safe = sanitize(e.name as any, e.props || {});
    baseTrack(e.name, safe);
    if (process.env.NODE_ENV !== 'production') {
      // Visible in dev tools for quick verification
      // eslint-disable-next-line no-console
      console.debug('[analytics]', e.name, safe);
    }
  } catch {}
}

// Convenience helpers
export const tracker = {
  portalOpened: (source?: string) => track({ name: 'portal_opened', props: { source } }),
  originSelected: (origin: 'GR' | 'ABROAD', mode?: 'signup') => track({ name: 'origin_selected', props: { origin, mode } }),
  formSubmitted: (form: 'sign-in' | 'sign-up') => track({ name: 'form_submitted', props: { form } }),
  authModeChanged: (mode: 'signin' | 'signup') => track({ name: 'auth_mode_changed', props: { mode } }),
  noBookingCTAClicked: (ref?: string, from?: 'guest' | 'home') => track({ name: 'no_booking_cta_clicked', props: { ref, from } }),
  checkinViewed: () => track({ name: 'checkin_viewed' }),
  checkinCompleted: () => track({ name: 'checkin_completed' }),
};

export default tracker;

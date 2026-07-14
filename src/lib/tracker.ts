"use client";
import { trackEvent as baseTrack } from '@/lib/analyticsClient';

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
  return s.length > max ? s.slice(0, max) : s;
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

type PropsOf<N extends EventProps['name']> = Extract<EventProps, { name: N }>['props'];
function sanitize<K extends EventProps['name']>(name: K, props: PropsOf<K> | unknown): Record<string, unknown> | undefined {
  switch (name) {
    case 'portal_opened':
      if (props && typeof (props as PropsOf<'portal_opened'>).source === 'string') {
        return { source: trimStr((props as PropsOf<'portal_opened'>).source!, 20) };
      }
      return {};
    case 'origin_selected': {
      const p = props as PropsOf<'origin_selected'> | undefined;
      const origin = p?.origin === 'GR' || p?.origin === 'ABROAD' ? p.origin : undefined;
      const mode = p?.mode === 'signup' ? 'signup' : undefined;
      return { ...(origin ? { origin } : {}), ...(mode ? { mode } : {}) };
    }
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
    case 'no_booking_cta_clicked': {
      const p = props as PropsOf<'no_booking_cta_clicked'> | undefined;
      const from = p?.from === 'guest' || p?.from === 'home' ? p.from : undefined;
      return { ...(from ? { from } : {}) };
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
    let safe: Record<string, unknown> | undefined;
    switch (e.name) {
      case 'portal_opened':
        safe = sanitize('portal_opened', e.props ?? {});
        break;
      case 'origin_selected':
        safe = sanitize('origin_selected', e.props);
        break;
      case 'form_submitted':
        safe = sanitize('form_submitted', e.props);
        break;
      case 'auth_mode_changed':
        safe = sanitize('auth_mode_changed', e.props);
        break;
      case 'no_booking_cta_clicked':
        safe = sanitize('no_booking_cta_clicked', e.props ?? {});
        break;
      case 'checkin_viewed':
        safe = sanitize('checkin_viewed', {} as Record<string, never>);
        break;
      case 'checkin_completed':
        safe = sanitize('checkin_completed', {} as Record<string, never>);
        break;
      default:
        safe = undefined;
    }
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
  originSelected: (origin: 'GR' | 'ABROAD', mode?: 'signup') => track({ name: 'origin_selected', props: { origin, mode } }),
  formSubmitted: (form: 'sign-in' | 'sign-up') => track({ name: 'form_submitted', props: { form } }),
  authModeChanged: (mode: 'signin' | 'signup') => track({ name: 'auth_mode_changed', props: { mode } }),
  noBookingCTAClicked: (_ref?: string, from?: 'guest' | 'home') => track({ name: 'no_booking_cta_clicked', props: { from } }),
  checkinViewed: () => track({ name: 'checkin_viewed' }),
  checkinCompleted: () => track({ name: 'checkin_completed' }),
};

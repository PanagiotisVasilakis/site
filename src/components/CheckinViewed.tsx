"use client";
import { useEffect } from 'react';
import { trackEvent } from '@/lib/analyticsClient';

export default function CheckinViewed() {
  useEffect(() => {
    try { trackEvent('checkin_viewed'); } catch {}
  }, []);
  return null;
}

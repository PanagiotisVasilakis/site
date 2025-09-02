"use client";
import { useEffect } from 'react';
import { trackPageview } from '@/lib/analyticsClient';

export default function Analytics() {
  useEffect(() => {
    trackPageview(window.location.pathname);
  }, []);
  return null;
}

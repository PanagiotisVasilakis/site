"use client";
import { useEffect } from 'react';
import { tracker } from '@/lib/tracker';

export default function CheckinViewed({ locale }: { locale: string }) {
  useEffect(() => {
    tracker.checkinViewed();
  }, [locale]);
  return null;
}

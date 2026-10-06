"use client";

import { useEffect, useState, type ComponentType } from 'react';

import { scheduleIdle } from '@/lib/motion/scheduleIdle';

export default function DeferredRuntimeManagers() {
  const [PwaManager, setPwaManager] = useState<ComponentType | null>(null);

  useEffect(() => {
    return scheduleIdle(() => {
      void import('@/components/PwaManager').then((pwa) => {
        setPwaManager(() => pwa.default);
      });
    });
  }, []);

  return PwaManager ? <PwaManager /> : null;
}

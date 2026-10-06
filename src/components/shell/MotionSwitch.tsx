"use client";

import { useId, useSyncExternalStore } from 'react';
import clsx from 'clsx';
import { Icon } from '@/components/icons/Icon';
import type { ShellDictionary } from '@/i18n/domains/shell';
import { MOTION_KEY, applyMotionPreference } from '@/lib/motion/motionPreference';
import { logger } from '@/lib/logger-client';

/**
 * identity §5.2, §8 MotionSwitch: stores `motion = 'reduce'` or removes the key, then lets
 * applyMotionPreference update `data-motion`. Disabled, with a note, while the OS already reduces motion.
 */
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';
const listeners = new Set<() => void>();

function readStoredReduce(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === 'reduce';
  } catch {
    return false;
  }
}

function getSnapshot(): string {
  return `${readStoredReduce() ? 1 : 0}${window.matchMedia?.(REDUCE_QUERY).matches ? 1 : 0}`;
}

function getServerSnapshot(): string {
  return '00';
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia?.(REDUCE_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key === MOTION_KEY || event.key === null) onChange();
  };
  media?.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

function setStoredReduce(reduce: boolean) {
  try {
    if (reduce) localStorage.setItem(MOTION_KEY, 'reduce');
    else localStorage.removeItem(MOTION_KEY);
  } catch (err) {
    logger.warn('MotionSwitch could not store the motion preference', err instanceof Error ? err : { error: String(err) });
  }
  applyMotionPreference();
  listeners.forEach((listener) => listener());
}

type MotionLabels = Pick<ShellDictionary, 'reduceMotion' | 'allowMotion' | 'motionReducedByDevice'>;

export function MotionSwitch({ t, className }: { t: MotionLabels; className?: string }) {
  const noteId = useId();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const reduced = snapshot[0] === '1';
  const osReduces = snapshot[1] === '1';
  return (
    <div className={clsx('motion-switch', className)}>
      <button
        type="button"
        className="motion-switch__button"
        aria-pressed={reduced}
        disabled={osReduces}
        aria-describedby={osReduces ? noteId : undefined}
        onClick={() => setStoredReduce(!reduced)}
      >
        <Icon name="motion" size={20} />
        <span>{reduced ? t.allowMotion : t.reduceMotion}</span>
      </button>
      {osReduces && <span id={noteId} className="motion-switch__note">{t.motionReducedByDevice}</span>}
    </div>
  );
}

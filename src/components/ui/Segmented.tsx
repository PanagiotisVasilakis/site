import type React from 'react';
import clsx from 'clsx';

/**
 * identity §8 Segmented: a pill container (surface-sunken, 3 px padding) of items ≥ 36 px. Items are
 * links or buttons with `segmentedItemClass`; the selected one carries `aria-pressed="true"` (buttons)
 * or `aria-current` (links).
 */
export const segmentedItemClass = 'ui-seg__item';

export function Segmented({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className={clsx('ui-seg', className)}>
      {children}
    </div>
  );
}

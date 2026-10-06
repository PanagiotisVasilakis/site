import type React from 'react';
import clsx from 'clsx';

type ChipProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
  pressed: boolean;
  /** Optional count (`tabular-nums`, fg-muted; 80 % opacity when pressed), e.g. the guide filters. */
  count?: number;
};

/**
 * identity §8 Chip: a 40 px pill toggle with `aria-pressed` (styles in src/styles/components/ui.css).
 * A chip without content is not rendered by its caller.
 */
export function Chip({ pressed, count, className, type = 'button', children, ...props }: ChipProps) {
  return (
    <button type={type} aria-pressed={pressed} className={clsx('ui-chip', className)} {...props}>
      {children}
      {count === undefined ? null : <>{' '}<span className="ui-chip__count">{count}</span></>}
    </button>
  );
}

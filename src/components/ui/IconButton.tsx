import type React from 'react';
import clsx from 'clsx';

type IconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Localized accessible name: an icon-only control always carries one (identity §6, §8). */
  label: string;
  variant?: 'default' | 'on-photo';
  ref?: React.Ref<HTMLButtonElement>;
};

/** identity §8 IconButton: a 44 px circle with a 1 px border; `on-photo` is the glass variant. */
export function IconButton({ label, variant = 'default', className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={clsx('ui-icon-btn', variant === 'on-photo' && 'ui-icon-btn--on-photo', className)}
      {...props}
    />
  );
}

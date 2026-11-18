import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

const SURFACE_PADDING = {
  sm: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
} as const;

const SURFACE_RADIUS = {
  md: 'rounded-tile',
  lg: 'rounded-card',
} as const;

const SURFACE_SHADOW = {
  sm: 'shadow-sm',
  lg: 'shadow-lg',
} as const;

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  padding?: keyof typeof SURFACE_PADDING;
  radius?: keyof typeof SURFACE_RADIUS;
  shadow?: keyof typeof SURFACE_SHADOW;
};

export function Surface({ className, padding, radius, shadow, ...props }: SurfaceProps) {
  return (
    <div
      className={clsx(
        'admin-card',
        padding && SURFACE_PADDING[padding],
        radius && SURFACE_RADIUS[radius],
        shadow && SURFACE_SHADOW[shadow],
        className,
      )}
      {...props}
    />
  );
}

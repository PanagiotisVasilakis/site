import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const surfaceVariants = cva('admin-card', {
  variants: {
    padding: {
      sm: 'p-4',
      lg: 'p-6',
      xl: 'p-8',
    },
    radius: {
      md: 'rounded-tile',
      lg: 'rounded-card',
    },
    shadow: {
      sm: 'shadow-sm',
      lg: 'shadow-lg',
    },
  },
});

type SurfaceProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof surfaceVariants>;

export function Surface({ className, padding, radius, shadow, ...props }: SurfaceProps) {
  return (
    <div
      className={surfaceVariants({ padding, radius, shadow, className })}
      {...props}
    />
  );
}

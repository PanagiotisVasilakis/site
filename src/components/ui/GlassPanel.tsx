import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';

/**
 * GlassPanel - A glassmorphism container for modern UI sections.
 * Commonly used for overlays, modals, and feature sections.
 */
const glassPanelVariants = cva(
    'backdrop-blur-sm rounded-2xl transition-all duration-300',
    {
        variants: {
            intensity: {
                light: 'bg-white/30 dark:bg-white/5 border border-white/30 dark:border-white/10',
                medium: 'bg-white/50 dark:bg-white/10 border border-white/40 dark:border-white/15',
                strong: 'bg-white/70 dark:bg-white/15 border border-white/50 dark:border-white/20',
            },
            shadow: {
                none: '',
                sm: 'shadow-sm',
                md: 'shadow-lg',
                xl: 'shadow-2xl',
            },
            padding: {
                none: '',
                sm: 'p-3',
                md: 'p-4 md:p-6',
                lg: 'p-6 md:p-8',
            }
        },
        defaultVariants: {
            intensity: 'medium',
            shadow: 'md',
            padding: 'md',
        }
    }
);

export interface GlassPanelProps
    extends ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof glassPanelVariants> { }

const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
    ({ className, intensity, shadow, padding, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={clsx(glassPanelVariants({ intensity, shadow, padding }), className)}
                {...props}
            />
        );
    }
);
GlassPanel.displayName = 'GlassPanel';

export { GlassPanel, glassPanelVariants };

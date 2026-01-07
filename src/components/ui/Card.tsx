import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';

/**
 * Card component with variant-based styling using CVA.
 * Use for content containers throughout the app.
 */
const cardVariants = cva(
    'rounded-2xl transition-all duration-300',
    {
        variants: {
            variant: {
                default: 'bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700',
                glass: 'backdrop-blur-sm bg-white/70 dark:bg-white/5 border border-slate-200/50 dark:border-white/10',
                elevated: 'bg-white dark:bg-zinc-900 shadow-lg hover:shadow-xl',
                flat: 'bg-slate-50 dark:bg-zinc-800',
            },
            padding: {
                none: '',
                sm: 'p-3',
                md: 'p-4 md:p-6',
                lg: 'p-6 md:p-8',
            },
            interactive: {
                true: 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
                false: '',
            }
        },
        defaultVariants: {
            variant: 'default',
            padding: 'md',
            interactive: false,
        }
    }
);

export interface CardProps
    extends ComponentPropsWithoutRef<'div'>,
    VariantProps<typeof cardVariants> { }

const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ className, variant, padding, interactive, ...props }, ref) => {
        return (
            <div
                ref={ref}
                className={clsx(cardVariants({ variant, padding, interactive }), className)}
                {...props}
            />
        );
    }
);
Card.displayName = 'Card';

export { Card, cardVariants };

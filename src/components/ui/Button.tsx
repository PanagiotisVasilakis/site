import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

const buttonVariants = cva(
  'focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'btn-primary',
        secondary: 'btn-secondary',
        outline: 'btn-outline',
        tint: 'btn-tint',
        danger: 'btn-danger',
        ghost: 'btn-ghost',
      },
      size: {
        sm: 'btn-sm',
        md: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type ButtonProps = ButtonVariantProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: false;
  };

type ButtonAsChildProps = ButtonVariantProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    asChild: true;
    children: React.ReactElement<{ className?: string }>;
  };

export type AppButtonProps = ButtonProps | ButtonAsChildProps;

export function Button({ variant, size, className, asChild, ...props }: AppButtonProps) {
  const classes = buttonVariants({ variant, size, className });

  if (asChild) {
    const { children, ...anchorProps } = props as ButtonAsChildProps;
    if (!React.isValidElement(children)) return null;
    return React.cloneElement(children, {
      ...anchorProps,
      className: clsx(classes, children.props.className),
    });
  }

  return <button className={classes} {...(props as ButtonProps)} />;
}

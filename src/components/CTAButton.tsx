import React from 'react';

type Common = { variant?: 'primary' | 'secondary' | 'outline' | 'tint' | 'danger' | 'ghost'; asChild?: boolean; className?: string };
type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function CTAButton({ variant='primary', className='', asChild=false, ...rest }: ButtonProps) {
  const base = 'focus:outline-none';
  const styles: Record<string,string> = {
    primary: 'btn-primary',
    secondary: 'btn-accent',
    outline: 'btn-outline',
    tint: 'btn-tint',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  };
  if (asChild) {
    // Expect caller to pass an <a> as children; clone to inject className
    const restWithChildren = rest as { children?: React.ReactElement<{ className?: string }> };
    const child = restWithChildren.children;
    if (!child || !React.isValidElement(child)) return null;
    const childProps = child.props as { className?: string; children?: React.ReactNode };
    const inner = childProps.children;
    const combinedClass = `${base} ${styles[variant]} ${childProps.className || ''} ${className}`.trim();
    return React.cloneElement(child, { ...childProps, className: combinedClass }, inner);
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

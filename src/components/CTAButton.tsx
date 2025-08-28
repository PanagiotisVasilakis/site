import React from 'react';

type Common = { variant?: 'primary' | 'secondary' | 'outline' | 'tint'; asChild?: boolean; className?: string };
type ButtonProps = Common & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function CTAButton({ variant='primary', className='', asChild=false, ...rest }: ButtonProps) {
  const base = 'focus:outline-none';
  const styles: Record<string,string> = {
    primary: 'btn-primary',
    secondary: 'btn-accent',
    outline: 'btn-outline',
    tint: 'btn-tint'
  };
  if (asChild) {
    // Expect caller to pass an <a> as children; clone to inject className
    const child = (rest as unknown as { children?: React.ReactElement<{ className?: string }> }).children;
    if (!child) return null;
    const childProps = child.props as { className?: string; children?: React.ReactNode };
    const inner = childProps.children;
    const combinedClass = `${base} ${styles[variant]} ${childProps.className || ''} ${className}`.trim();
    return React.cloneElement(child, { ...childProps, className: combinedClass }, inner);
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}

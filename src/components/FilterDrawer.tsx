"use client";
import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export default function FilterDrawer({ open, onClose, children, title }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // Manage focus trap & escape
  useEffect(() => {
    function esc(e: KeyboardEvent) { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }
    if (open) {
      previouslyFocused.current = document.activeElement;
      document.addEventListener('keydown', esc);
      // delay to allow render
      setTimeout(() => {
        const focusable = panelRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }, 0);
      // inert siblings + scroll lock
      const root = document.body;
      const siblings: Element[] = [];
      Array.from(root.children).forEach(el => {
        if (el.getAttribute('data-disable-inert') === 'true') return;
        if (el !== panelRef.current?.parentElement) {
          el.setAttribute('aria-hidden', 'true');
          siblings.push(el);
        }
      });
      const originalOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', esc);
        siblings.forEach(s => s.removeAttribute('aria-hidden'));
        document.documentElement.style.overflow = originalOverflow;
        if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
      };
    }
  }, [open, onClose]);

  // Basic focus loop
  useEffect(() => {
    if (!open) return;
    function handleFocus(e: FocusEvent) {
      if (!panelRef.current) return;
      if (panelRef.current.contains(e.target as Node)) return;
      // redirect back inside
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length) focusable[0].focus();
    }
    document.addEventListener('focus', handleFocus, true);
    return () => document.removeEventListener('focus', handleFocus, true);
  }, [open]);
  return (
    <div aria-hidden={!open} className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'} `}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
  <aside ref={panelRef} className={`floating-banner absolute bottom-0 left-0 right-0 md:right-auto md:w-96 md:top-0 md:bottom-0 backdrop-blur border-t md:border-t-0 md:border-r border-soft rounded-t-xl md:rounded-none shadow-lg flex flex-col transform transition-transform ${open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:-translate-x-full'}`} role="dialog" aria-modal="true" aria-label={title || 'Filters'}>
        <header className="p-4 border-b divider flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide uppercase">{title || 'Filters'}</h2>
          <button onClick={onClose} aria-label="Close filters" className="btn-tint btn-sm">✕</button>
        </header>
        <div className="p-4 overflow-y-auto text-sm flex-1">
          {children}
        </div>
        <div className="p-4 border-t divider flex gap-2">
          <button onClick={onClose} className="btn-tint flex-1">Done</button>
        </div>
      </aside>
    </div>
  );
}

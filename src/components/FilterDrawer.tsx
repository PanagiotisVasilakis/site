"use client";

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  closeLabel?: string;
  doneLabel?: string;
}

type SiblingState = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export default function FilterDrawer({ open, onClose, children, title, closeLabel = 'Close filters', doneLabel = 'Done' }: Props) {
  const panelRef = useRef<HTMLElement | null>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const portal = portalRef.current;
    const panel = panelRef.current;
    if (!portal || !panel) return;

    previouslyFocused.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const siblingStates: SiblingState[] = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== portal)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.hasAttribute('inert'),
      }));

    for (const { element } of siblingStates) {
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
    }

    const originalDocumentOverflow = document.documentElement.style.overflow;
    const originalBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const first = focusableElements(panel)[0];
      (first ?? panel).focus();
    };
    const focusTimer = window.setTimeout(focusFirst, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!panel.contains(event.target as Node)) focusFirst();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.documentElement.style.overflow = originalDocumentOverflow;
      document.body.style.overflow = originalBodyOverflow;

      for (const { element, ariaHidden, inert } of siblingStates) {
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
        if (inert) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
      }

      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={portalRef} className="fixed inset-0 z-40" data-filter-drawer-portal>
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => onCloseRef.current()} />
      <aside
        ref={panelRef}
        className="floating-banner absolute bottom-0 left-0 right-0 md:right-auto md:w-96 md:top-0 md:bottom-0 backdrop-blur border-t md:border-t-0 md:border-r border-soft rounded-t-xl md:rounded-none shadow-lg flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="p-4 border-b divider flex items-center justify-between">
          <h2 id={titleId} className="text-sm font-semibold uppercase">{title || 'Filters'}</h2>
          <button type="button" onClick={() => onCloseRef.current()} aria-label={closeLabel} className="btn-tint btn-sm">✕</button>
        </header>
        <div className="p-4 overflow-y-auto text-sm flex-1">
          {children}
        </div>
        <div className="p-4 border-t divider flex gap-2">
          <button type="button" onClick={() => onCloseRef.current()} className="btn-tint flex-1">{doneLabel}</button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

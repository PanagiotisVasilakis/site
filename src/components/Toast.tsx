"use client";
import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { Icon } from '@/components/icons/Icon';

type Toast = { id: number; message: string; expires: number };

interface ToastContextValue {
  push: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** identity §8 Toast: auto-dismiss after 5 s (no toast carries an action yet). */
const TOAST_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pathname = usePathname();
  const locale: Locale = pathname?.startsWith('/el') ? 'el' : 'en';
  const dismissLabel = getDictionary(locale).updates.dismiss;
  const push = useCallback((message: string) => {
    setToasts(ts => [...ts, { id: Date.now() + Math.random(), message, expires: Date.now() + TOAST_MS }]);
  }, []);
  // GC
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setToasts(ts => {
        const next = ts.filter(t => t.expires > now);
        return next.length === ts.length ? ts : next;
      });
    }, 400);
    return () => clearInterval(t);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* identity §8 Toast: bottom centre above the bars, surface-raised, shadow-overlay, radius-tile (ui.css). */}
      <div role="status" aria-live="polite" className="ui-toasts">
        {toasts.map(t => (
          <div key={t.id} className="ui-toast">
            <span className="ui-toast__text">{t.message}</span>
            <button type="button" aria-label={dismissLabel} className="ui-toast__close" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

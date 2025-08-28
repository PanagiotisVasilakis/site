"use client";
import { createContext, useContext, useState, useCallback, useEffect } from 'react';

type Toast = { id: number; message: string; expires: number };

interface ToastContextValue {
  push: (message: string, opts?: { duration?: number }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, opts?: { duration?: number }) => {
    setToasts(ts => [...ts, { id: Date.now() + Math.random(), message, expires: Date.now() + (opts?.duration ?? 3000) }]);
  }, []);
  // GC
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setToasts(ts => ts.filter(t => t.expires > now));
    }, 400);
    return () => clearInterval(t);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
    <div aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center px-2">
        {toasts.map(t => (
      <div key={t.id} className="toast-item floating-banner text-[11px] px-3 py-2 rounded-full shadow-float-soft flex items-center gap-2">
            <span>{t.message}</span>
            <button aria-label="Dismiss" className="btn-tint btn-sm" onClick={() => setToasts(ts => ts.filter(x => x.id !== t.id))}>×</button>
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

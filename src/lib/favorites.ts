"use client";

import { useEffect, useState, useCallback } from 'react';
import { logger } from '@/lib/logger-enterprise';

export interface Favorite {
  id: string;
  name?: string;
  addedAt?: Date;
}

const KEY = 'favorites:v1';

function readSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try { const raw = localStorage.getItem(KEY); if (!raw) return new Set(); return new Set(JSON.parse(raw)); } catch (err) { logger.warn('Favorites read failed', err); return new Set(); }
}

function writeSet(s: Set<string>) {
  try { localStorage.setItem(KEY, JSON.stringify(Array.from(s))); } catch (err) { logger.warn('Favorites write failed', err); }
}

export function useFavorites() {
  const [fav, setFav] = useState<Set<string>>(() => readSet());

  useEffect(() => {
    const handler = () => setFav(readSet());
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const toggle = useCallback((id: string) => {
    setFav(prev => {
      const ns = new Set(prev);
      if (ns.has(id)) ns.delete(id); else ns.add(id);
      writeSet(ns);
      return ns;
    });
  }, []);

  const isFavorite = useCallback((id: string) => fav.has(id), [fav]);

  return { favorites: fav, toggle, isFavorite };
}

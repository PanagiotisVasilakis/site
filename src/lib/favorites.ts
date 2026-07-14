"use client";

import { useCallback, useSyncExternalStore } from 'react';
import { logger } from '@/lib/logger-client';

const KEY = 'favorites:v1';
const EMPTY = new Set<string>();
let snapshot = EMPTY;
let initialized = false;
let storageListenerInstalled = false;
const listeners = new Set<() => void>();

function readSet(): Set<string> {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    const value: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch (error) {
    logger.warn('Favorites read failed', error instanceof Error ? error : { error: String(error) });
    return new Set();
  }
}

function emit(): void {
  listeners.forEach((listener) => listener());
}

function initialize(): void {
  if (initialized || typeof window === 'undefined') return;
  snapshot = readSet();
  initialized = true;
  if (!storageListenerInstalled) {
    window.addEventListener('storage', (event) => {
      if (event.key !== KEY && event.key !== null) return;
      snapshot = readSet();
      emit();
    });
    storageListenerInstalled = true;
  }
}

function subscribe(listener: () => void): () => void {
  initialize();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Set<string> {
  return snapshot;
}

function writeSet(value: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...value]));
  } catch (error) {
    logger.warn('Favorites write failed', error instanceof Error ? error : { error: String(error) });
  }
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);

  const toggle = useCallback((id: string) => {
    initialize();
    const next = new Set(snapshot);
    if (next.has(id)) next.delete(id); else next.add(id);
    snapshot = next;
    writeSet(next);
    emit();
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);
  return { favorites, toggle, isFavorite };
}

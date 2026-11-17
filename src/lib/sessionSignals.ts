// Lightweight cross-tab/session-change signaling for guest sessions
// BroadcastChannel (modern) carries the signal; the storage event (localStorage) is the fallback for browsers without BroadcastChannel

const CHANNEL_NAME = 'guest-session';
const STORAGE_KEY = 'guest_session_changed';
export const SESSION_SIGNAL_SOURCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

type SessionChange = { t: number; reason?: string; sourceId?: string };

export function emitGuestSessionChanged(reason?: string): void {
  const payload: SessionChange = { t: Date.now(), reason, sourceId: SESSION_SIGNAL_SOURCE_ID };
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.postMessage(payload);
      bc.close();
    }
  } catch {}
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      // Remove shortly to avoid cluttering LS
      window.setTimeout(() => {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
      }, 50);
    }
  } catch {}
}

export function onGuestSessionChange(cb: (info: SessionChange) => void): () => void {
  let bc: BroadcastChannel | null = null;
  function storageHandler(e: StorageEvent) {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      const info = JSON.parse(e.newValue) as SessionChange;
      cb(info);
    } catch {}
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        const data = (ev?.data || {}) as SessionChange;
        cb(data);
      };
    }
  } catch {}
  // Only without a channel: a live channel already delivers each change, and the storage event would repeat it.
  const useStorage = bc === null;
  if (useStorage) {
    try { window.addEventListener('storage', storageHandler); } catch {}
  }
  return () => {
    try { if (bc) { bc.onmessage = null; bc.close(); } } catch {}
    if (useStorage) {
      try { window.removeEventListener('storage', storageHandler); } catch {}
    }
  };
}

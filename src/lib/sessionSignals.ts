// Lightweight cross-tab/session-change signaling for guest sessions
// Use both BroadcastChannel (modern) and localStorage fallback (storage event)

const CHANNEL_NAME = 'guest-session';
const STORAGE_KEY = 'guest_session_changed';

type SessionChange = { t: number; reason?: string };

export function emitGuestSessionChanged(reason?: string): void {
  const payload: SessionChange = { t: Date.now(), reason };
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
  try { window.addEventListener('storage', storageHandler); } catch {}
  return () => {
    try { if (bc) { bc.onmessage = null; bc.close(); } } catch {}
    try { window.removeEventListener('storage', storageHandler); } catch {}
  };
}

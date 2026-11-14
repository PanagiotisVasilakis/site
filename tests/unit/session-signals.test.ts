// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { onGuestSessionChange } from '@/lib/sessionSignals';

const change = { t: 1, reason: 'signout' };

// Stands in for BroadcastChannel; each instance is recorded so a test can deliver a message through it.
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((ev: MessageEvent) => void) | null = null;
  constructor() {
    FakeBroadcastChannel.instances.push(this);
  }
  close() {
    // Nothing to release in the fake.
  }
}

function stubFakeBroadcastChannel(): FakeBroadcastChannel[] {
  FakeBroadcastChannel.instances = [];
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  return FakeBroadcastChannel.instances;
}

// The storage event a sibling tab fires when emitGuestSessionChanged writes localStorage.
function dispatchStorageSignal() {
  window.dispatchEvent(new StorageEvent('storage', { key: 'guest_session_changed', newValue: JSON.stringify(change) }));
}

describe('onGuestSessionChange', () => {
  it('calls the callback once when a change arrives through both the channel and the storage event', () => {
    const instances = stubFakeBroadcastChannel();
    const cb = vi.fn();
    const unsubscribe = onGuestSessionChange(cb);

    dispatchStorageSignal();
    instances[0]?.onmessage?.(new MessageEvent('message', { data: change }));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(change);
    unsubscribe();
  });

  it('falls back to the storage event when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const cb = vi.fn();
    const unsubscribe = onGuestSessionChange(cb);

    dispatchStorageSignal();

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(change);
    unsubscribe();
  });
});

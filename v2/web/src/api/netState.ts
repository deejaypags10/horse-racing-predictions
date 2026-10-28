import { useSyncExternalStore } from 'react';
import type { SourceStatus } from './types';

export interface NetState {
  status: SourceStatus | null;
  lastOkAt: number | null;      // client ms of last successful API read
  lastErrorAt: number | null;
  failing: boolean;             // last request failed (network / 5xx)
  offline: boolean;
}

let state: NetState = {
  status: null,
  lastOkAt: null,
  lastErrorAt: null,
  failing: false,
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
};
const subs = new Set<() => void>();

function emit(next: Partial<NetState>) {
  state = { ...state, ...next };
  subs.forEach((f) => f());
}

export const netState = {
  get: () => state,
  ok(status?: SourceStatus | null) {
    emit({ lastOkAt: Date.now(), failing: false, ...(status ? { status } : {}) });
  },
  fail() {
    emit({ lastErrorAt: Date.now(), failing: true });
  },
  setOffline(offline: boolean) {
    emit({ offline });
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => subs.delete(f);
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => netState.setOffline(false));
  window.addEventListener('offline', () => netState.setOffline(true));
}

export function useNetState(): NetState {
  return useSyncExternalStore(netState.subscribe, netState.get, netState.get);
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { serverNow } from '../domain/clock';

/**
 * Source-clock "now", re-rendering on minute boundaries (or every second when
 * `perSecond`). Paused while the document is hidden.
 */
export function useTicker(perSecond = false, enabled = true): number {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!enabled) return;
    let t: number | undefined;
    const step = perSecond ? 1000 : 60_000;
    const arm = () => {
      const n = serverNow();
      const wait = step - (((n % step) + step) % step) + 15;
      t = window.setTimeout(() => {
        if (!document.hidden) setNow(serverNow());
        arm();
      }, wait);
    };
    const onVis = () => { if (!document.hidden) setNow(serverNow()); };
    setNow(serverNow());
    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [perSecond, enabled]);
  return now;
}

const NowCtx = createContext<number>(0);

/** One shared minute-aligned ticker for every countdown on the page. */
export function NowProvider({ children }: { children: ReactNode }) {
  const now = useTicker(false);
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}

export function useNow(): number {
  // Subscribe to the shared minute tick; read the freshest server-aligned time
  // on every render (a data refresh re-syncs the offset between ticks).
  useContext(NowCtx);
  return serverNow();
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export interface ApiState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;          // first load in progress (no data yet)
  refreshing: boolean;
  updatedAt: number | null;  // client ms of the last good response
  refresh: () => void;
}

/**
 * Fetch with abort-on-unmount and polling. `interval` may depend on the data
 * (e.g. race view polls faster near post). Polling pauses while the document
 * is hidden and refreshes immediately when it becomes visible again.
 * The last good data is kept on error, so screens can show it as stale.
 */
export function useApi<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  interval?: number | ((data: T | null) => number | null),
): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState<boolean>(key !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;
  const dataRef = useRef<T | null>(null);
  const keyRef = useRef<string | null>(null);

  // Reset when the key changes to a different resource.
  if (keyRef.current !== key) {
    const sameBase = keyRef.current && key && keyRef.current.split('?')[0] === key.split('?')[0];
    keyRef.current = key;
    if (!sameBase && dataRef.current !== null) {
      dataRef.current = null;
      // State updates during render are allowed for derived resets.
      setData(null);
      setError(null);
      setLoading(key !== null);
    }
  }

  useEffect(() => {
    if (key === null) return;
    const ctl = new AbortController();
    let timer: number | undefined;
    let stopped = false;
    let inFlight = false;

    const schedule = () => {
      window.clearTimeout(timer); // exactly one pending timer at a time
      timer = undefined;
      const iv = intervalRef.current;
      const ms = typeof iv === 'function' ? iv(dataRef.current) : iv;
      if (!ms || stopped) return;
      timer = window.setTimeout(() => {
        timer = undefined;
        if (document.hidden) return; // resumes on visibilitychange
        void run();
      }, ms);
    };

    const run = async () => {
      if (inFlight || stopped) return; // never overlap fetches
      inFlight = true;
      window.clearTimeout(timer);
      timer = undefined;
      setRefreshing(true);
      try {
        const d = await fetcherRef.current(ctl.signal);
        if (stopped) return;
        dataRef.current = d;
        setData(d);
        setError(null);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (stopped || (e as Error).name === 'AbortError') return;
        setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', 'Something went wrong.'));
      } finally {
        inFlight = false;
        if (!stopped) {
          setLoading(false);
          setRefreshing(false);
          schedule();
        }
      }
    };

    const onVis = () => {
      if (!document.hidden) {
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    void run();
    return () => {
      stopped = true;
      ctl.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [key, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading: loading && data === null, refreshing, updatedAt, refresh };
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface ToastSpec {
  text: string;
  link?: { to: string; label: string };
}
interface ToastItem extends ToastSpec { id: number }

const ToastCtx = createContext<(t: ToastSpec) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: ToastSpec) => {
    seq += 1;
    setItems((xs) => [...xs, { ...t, id: seq }].slice(-2));
  }, []);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <Toast key={t.id} item={t} onDone={() => dismiss(t.id)} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function Toast({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [paused, setPaused] = useState(false);
  const left = useRef(6000);
  const started = useRef(Date.now());
  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const t = window.setTimeout(onDone, left.current);
    return () => {
      window.clearTimeout(t);
      left.current -= Date.now() - started.current;
    };
  }, [paused, onDone]);
  return (
    <div
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{item.text}</span>
      {item.link && <Link to={item.link.to} className="toast-link" onClick={onDone}>{item.link.label}</Link>}
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={onDone}>✕</button>
    </div>
  );
}

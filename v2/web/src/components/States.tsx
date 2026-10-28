import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../api/client';

export function InlineError({ title, children, onRetry, back, error }: {
  title: string;
  children?: ReactNode;
  onRetry?: () => void;
  back?: { to: string; label: string };
  error?: ApiError | null;
}) {
  return (
    <div className="inline-error" role="alert">
      <div className="inline-error-text">
        <p className="inline-error-title">{title}</p>
        {children && <div className="inline-error-body">{children}</div>}
        {error && error.code && (
          <details className="inline-error-details">
            <summary>Details</summary>
            <span>Ref {refId(error)}</span>
          </details>
        )}
      </div>
      <div className="inline-error-actions">
        {onRetry && <button type="button" className="btn btn-secondary" onClick={onRetry}>Try again</button>}
        {back && <Link className="btn btn-secondary" to={back.to}>{back.label}</Link>}
      </div>
    </div>
  );
}

function refId(e: ApiError): string {
  let h = 0;
  const s = `${e.status}:${e.code}:${e.message}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `${e.status || 'net'}-${h.toString(16).slice(0, 4)}`;
}

export function EmptyState({ title, children, action, glyph }: { title: string; children?: ReactNode; action?: ReactNode; glyph?: ReactNode }) {
  return (
    <div className="empty">
      {glyph && <div className="empty-glyph" aria-hidden="true">{glyph}</div>}
      <p className="empty-title">{title}</p>
      {children && <p className="empty-body">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

/** Shimmer stops after 10s (DESIGN 2.6). */
export function useShimmer(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setOn(false), 10_000);
    return () => window.clearTimeout(t);
  }, []);
  return on;
}

export function SkeletonRows({ rows = 8, cols = [60, 20, 30], height = 44, label = 'Loading' }: { rows?: number; cols?: number[]; height?: number; label?: string }) {
  const shimmer = useShimmer();
  return (
    <div className={`skeleton${shimmer ? ' is-shimmer' : ''}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} style={{ height }}>
          {cols.map((w, j) => <span key={j} className="skeleton-bar" style={{ width: `${w}%` }} />)}
        </div>
      ))}
    </div>
  );
}

export function SkeletonBar({ width, height = 16 }: { width: string; height?: number }) {
  const shimmer = useShimmer();
  return <span className={`skeleton-bar skeleton-inline${shimmer ? ' is-shimmer' : ''}`} style={{ width, height }} aria-hidden="true" />;
}

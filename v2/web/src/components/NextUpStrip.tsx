import { useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import type { NextUp } from '../api/types';
import { fmtEdge } from '../domain/format';
import { fmtMtp, mtpSpeech, mtpState } from '../domain/mtp';
import { useNow } from '../state/clock';
import { Cloth } from './Cloth';

export function NextUpStrip({ items, loading }: { items: NextUp[] | null; loading?: boolean }) {
  const now = useNow();
  const ref = useRef<HTMLUListElement>(null);
  const live = (items ?? []).filter((n) => {
    const s = mtpState(n.post_time, 'open', now);
    return s.kind !== 'off';
  }).slice(0, 8);

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const links = Array.from(ref.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    const next = links[(i + (e.key === 'ArrowRight' ? 1 : -1) + links.length) % links.length];
    links.forEach((l) => (l.tabIndex = -1));
    next.tabIndex = 0;
    next.focus();
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <section className="nextup" aria-label="Next up">
      <div className="nextup-inner">
        <h2 className="nextup-label">Next up</h2>
        {loading && !items ? (
          <ul className="nextup-list" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => <li key={i} className="nextup-skel" />)}
          </ul>
        ) : live.length === 0 ? (
          <p className="nextup-empty">Nothing posts in the next hour on these tracks.</p>
        ) : (
          <ul className="nextup-list" ref={ref} onKeyDown={onKey}>
            {live.map((n, i) => {
              const s = mtpState(n.post_time, 'open', now);
              const v = n.best_value;
              return (
                <li key={n.race_id}>
                  <Link to={`/r/${n.race_id}`} tabIndex={i === 0 ? 0 : -1} className="nextup-item"
                    aria-label={`${n.track_name} race ${n.number}, ${mtpSpeech(s)}${v ? `, overlay on number ${v.program}, plus ${fmtEdge(v.edge_pts)} points` : ''}`}>
                    {n.top_pick ? <Cloth program={n.top_pick.program} breed={n.breed} size="sm" label={false} /> : <span className="cloth cloth-sm cloth-neutral" aria-hidden="true" />}
                    <span className="nextup-race"><span className="nextup-code">{n.track_code}</span> R{n.number}</span>
                    <span className={`nextup-mtp mtp-${s.tone}`}>{s.kind === 'far' ? fmtMtpFar(n.post_time) : fmtMtp(s)}{s.kind === 'mtp' || s.kind === 'soon' ? <span className="nextup-mtp-unit">m</span> : null}</span>
                    {v && <span className="nextup-edge edge-over">▲ {fmtEdge(v.edge_pts)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function fmtMtpFar(post: string | null): string {
  if (!post) return '—';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(post));
}

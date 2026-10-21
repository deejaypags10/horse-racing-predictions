import { useEffect, useId, useRef, useState } from 'react';
import { useNetState } from '../api/netState';
import { fmtDateline, fmtTime } from '../domain/format';
import { useTicker } from '../state/clock';

type LampKind = 'live' | 'delayed' | 'offline' | 'down' | 'replay' | 'connecting';

export function FreshnessLamp() {
  const net = useNetState();
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  // Re-render every 5s for the age readout.
  const [, setT] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) setT((x) => x + 1); }, 5000);
    return () => window.clearInterval(t);
  }, []);
  useTicker(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector('button')?.focus(); } };
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  const st = net.status;
  const age = net.lastOkAt ? Math.round((Date.now() - net.lastOkAt) / 1000) : null;
  let kind: LampKind = 'connecting';
  let text = 'Connecting';
  if (net.offline) { kind = 'offline'; text = 'Offline'; }
  else if (net.failing && !net.lastOkAt) { kind = 'down'; text = 'No server'; }
  else if (net.failing) { kind = 'down'; text = 'Source issue'; }
  else if (st && st.source === 'archive') { kind = 'replay'; text = 'Replay'; }
  else if (st && !st.ok) { kind = 'down'; text = 'Source issue'; }
  else if (age != null && age > 120) { kind = 'delayed'; text = `Data ${Math.round(age / 60)}m old`; }
  else if (age != null) { kind = 'live'; text = age < 60 ? `Live ${Math.max(1, age)}s` : 'Live'; }

  const summary =
    kind === 'replay' ? `Replay of a recorded card${st?.replay_date ? ` from ${fmtDateline(st.replay_date, { year: true })}` : ''}.`
    : kind === 'offline' ? `You're offline. Showing data from ${net.lastOkAt ? fmtTime(net.lastOkAt) : 'earlier'}. We'll refresh when you're back.`
    : kind === 'down' ? (net.lastOkAt ? `The data source isn't answering. Showing data from ${fmtTime(net.lastOkAt)}.` : "The Equine Edge server isn't answering.")
    : kind === 'delayed' ? `Data is ${age != null ? Math.round(age / 60) : '?'} min old. Retrying.`
    : kind === 'live' ? `Odds from TwinSpires, refreshed ${age}s ago.`
    : 'Waiting for the first update.';

  return (
    <div className="lamp-wrap" ref={wrap}>
      <button type="button" className={`lamp lamp-${kind}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        aria-label={`Data freshness: ${text}. Show feed details.`}>
        <span className="lamp-mark" aria-hidden="true" />
        <span className="lamp-text">{text}</span>
      </button>
      {open && (
        <div className="popover lamp-pop" id={id} role="region" aria-label="Feed status">
          <p className="lamp-pop-summary">{summary}</p>
          <dl className="feed-list">
            <div><dt>Entries &amp; odds</dt><dd>{net.lastOkAt ? `read ${fmtTime(net.lastOkAt, true)}` : '—'}</dd></div>
            <div><dt>Source</dt><dd>{st ? (st.source === 'archive' ? 'Recorded archive' : 'TwinSpires') : '—'}{st && !st.ok ? ' · issue' : ''}</dd></div>
            <div><dt>Results</dt><dd>{st?.live ? 'Polled after each race' : 'From the recording'}</dd></div>
            <div><dt>Model</dt><dd>{st?.model_loaded ? st.model_version : 'not loaded'}</dd></div>
            <div><dt>History</dt><dd>{st?.history_runs ? `${st.history_runs.toLocaleString('en-US')} runs to ${st.history_through ? fmtDateline(st.history_through, { short: true, year: true }) : '—'}` : '—'}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}

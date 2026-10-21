import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import type { Ticket, TicketsResponse } from '../api/types';
import { useApi } from '../api/useApi';
import { Cloth } from '../components/Cloth';
import { IconTicket } from '../components/Icons';
import { MtpCell } from '../components/Mtp';
import { EmptyState, InlineError, SkeletonRows } from '../components/States';
import { Stamp } from '../components/Stamp';
import { fmtMoney, fmtRoi, fmtShortDate, fmtSigned, plural } from '../domain/format';
import { fmtOdds } from '../domain/odds';
import { serverNow } from '../domain/clock';
import { useSettings } from '../state/settings';
import { useToast } from '../state/toast';

type Range = '7d' | '30d' | 'all';
const RANGE_LABEL: Record<Range, string> = { '7d': '7 days', '30d': '30 days', all: 'All' };
const KIND_LABEL: Record<Ticket['kind'], string> = { win: 'Win', place: 'Place', show: 'Show', exacta: 'Ex', trifecta: 'Tri' };

export function TicketsPage() {
  const st = useApi<TicketsResponse>('tickets', (s) => api.tickets(s), 60_000);
  const [params, setParams] = useSearchParams();
  const range = (['7d', '30d', 'all'].includes(params.get('range') ?? '') ? params.get('range') : 'all') as Range;
  const { settings } = useSettings();
  const fmt = settings.oddsFormat;
  const toast = useToast();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  useEffect(() => { document.title = 'Tickets · Equine Edge'; }, []);

  const tickets = useMemo(() => {
    const all = st.data?.tickets ?? [];
    if (range === 'all') return all;
    const days = range === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return all.filter((t) => Date.parse(t.created_at) >= cutoff);
  }, [st.data, range]);

  const setRange = (r: Range) => {
    const p = new URLSearchParams(params);
    if (r === 'all') p.delete('range'); else p.set('range', r);
    setParams(p, { replace: true });
  };

  const summary = st.data?.summary;
  const open = tickets.filter((t) => t.status === 'open');
  const settled = tickets.filter((t) => t.status !== 'open').sort((a, b) => Date.parse(b.settled_at ?? b.created_at) - Date.parse(a.settled_at ?? a.created_at));

  const del = async (t: Ticket) => {
    setDelErr(null);
    try {
      await api.deleteTicket(t.id);
      setConfirming(null);
      toast({ text: `Ticket ${serial(t)} deleted.` });
      st.refresh();
    } catch (e) {
      setDelErr(e instanceof ApiError ? e.message : 'Couldn’t delete the ticket.');
    }
  };

  return (
    <div className="page tickets">
      <header className="page-head tickets-head">
        <div>
          <h1 className="page-title">Tickets</h1>
          <p className="dateline-sub">Paper record — no real money.</p>
        </div>
        <div className="chips" role="group" aria-label="Date range">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} type="button" className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
      </header>

      {st.loading && <SkeletonRows rows={5} label="Loading tickets" />}
      {st.error && !st.data && <InlineError title="Couldn't load your tickets." onRetry={st.refresh} error={st.error}>Your tickets are safe in the local database. The server didn't answer.</InlineError>}

      {st.data && summary && (
        <>
          <SummaryStrip t={tickets} all={range === 'all'} s={summary} />
          {tickets.length > 0 && <Charts tickets={tickets} />}
          {(st.data.tickets.length === 0) && (
            <EmptyState glyph={<IconTicket size={48} />} title="No paper tickets yet."
              action={<Link to="/" className="btn btn-secondary">Go to Today's races</Link>}>
              Open a race and use + Ticket to record what you'd bet and at what price. We'll settle it when the result is official.
            </EmptyState>
          )}
          {st.data.tickets.length > 0 && tickets.length === 0 && (
            <EmptyState title={`No tickets in the last ${RANGE_LABEL[range]}.`} action={<button type="button" className="btn btn-secondary" onClick={() => setRange('all')}>Show all tickets</button>} />
          )}
          {delErr && <p className="form-error" role="alert">{delErr}</p>}
          {open.length > 0 && (
            <section className="stub-group" aria-label="Open tickets">
              <h2 className="group-title"><span>Open ({open.length})</span></h2>
              <ul className="stubs">
                {open.map((t) => (
                  <Stub key={t.id} t={t} fmt={fmt}
                    action={confirming === t.id ? (
                      <span className="stub-confirm">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => del(t)}>Confirm delete</button>
                        <button type="button" className="btn-link" onClick={() => setConfirming(null)}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" className="btn-link stub-del" onClick={() => setConfirming(t.id)} aria-label={`Delete ticket ${serial(t)}`}>Delete</button>
                    )} />
                ))}
              </ul>
            </section>
          )}
          {settled.length > 0 && (
            <section className="stub-group" aria-label="Settled tickets">
              <h2 className="group-title"><span>Settled ({settled.length})</span></h2>
              <ul className="stubs">{settled.map((t) => <Stub key={t.id} t={t} fmt={fmt} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function serial(t: Ticket): string {
  return `EE-${t.id.slice(0, 4).toUpperCase()}`;
}

function SummaryStrip({ s, t, all }: { s: TicketsResponse['summary']; t: Ticket[]; all: boolean }) {
  // The API summary covers every ticket; for a date range recompute from the rows.
  const settled = t.filter((x) => x.status === 'won' || x.status === 'lost');
  const staked = all ? s.staked : settled.reduce((a, x) => a + x.stake, 0);
  const returned = all ? s.returned : settled.reduce((a, x) => a + (x.payout ?? 0), 0);
  const net = returned - staked;
  const roi = all ? s.roi : staked ? net / staked : null;
  const clvs = t.map((x) => x.clv).filter((x): x is number => x != null);
  const avgClv = all ? s.avg_clv : clvs.length ? clvs.reduce((a, b) => a + b, 0) / clvs.length : null;
  const beat = all ? s.beat_close : clvs.filter((x) => x > 0).length;
  const clvN = all ? s.clv_n : clvs.length;
  const n = settled.length;
  return (
    <dl className="summary">
      <div><dt>Tickets</dt><dd>{t.length}</dd></div>
      <div><dt>Staked</dt><dd>{fmtMoney(staked)}</dd><span className="summary-sub">settled only</span></div>
      <div><dt>Returned</dt><dd>{fmtMoney(returned)}</dd></div>
      <div><dt>Net</dt><dd>{fmtMoney(net, { signed: true })}</dd></div>
      <div className="summary-wide">
        <dt>ROI</dt>
        <dd>{fmtRoi(roi)}</dd>
        <span className="summary-sub">{n >= 10 && all && s.roi_ci ? `95%: ${fmtRoi(s.roi_ci[0])} to ${fmtRoi(s.roi_ci[1])}` : `Too few settled tickets to judge (n = ${n}).`}</span>
      </div>
      <div className="summary-wide">
        <dt title="Closing-line value: market chance at close minus the chance implied by your price. Beating the closing price is a better long-run skill signal than short-run profit.">Avg CLV</dt>
        <dd>{avgClv == null ? '—' : `${fmtSigned(avgClv, 1)} pts`}</dd>
        <span className="summary-sub">{clvN ? `beat the close on ${beat} of ${clvN}` : 'win tickets with a price, once settled'}</span>
      </div>
      <div><dt>Settled</dt><dd>{n} <span className="summary-of">of {t.length}</span></dd></div>
    </dl>
  );
}

function Charts({ tickets }: { tickets: Ticket[] }) {
  const settled = tickets.filter((t) => t.status === 'won' || t.status === 'lost').sort((a, b) => Date.parse(a.settled_at ?? a.created_at) - Date.parse(b.settled_at ?? b.created_at));
  const clv = settled.filter((t) => t.clv != null);
  return (
    <div className="ticket-charts">
      <figure className="chart netline">
        <figcaption className="chart-title">Cumulative net ($)</figcaption>
        {settled.length >= 2 ? <NetLine tickets={settled} /> : <p className="chart-empty">The line starts once two tickets have settled. {plural(settled.length, 'ticket')} settled so far.</p>}
      </figure>
      <figure className="chart clvstrip">
        <figcaption className="chart-title">Closing-line value (per ticket, pts)</figcaption>
        {clv.length ? (
          <div className="clv-dots" role="img" aria-label={`${clv.filter((t) => (t.clv ?? 0) > 0).length} of ${clv.length} tickets beat the closing price`}>
            {clv.map((t) => <span key={t.id} className={`clv-dot ${(t.clv ?? 0) > 0 ? 'is-pos' : 'is-neg'}`} title={`${t.track_name} R${t.race_number}: ${fmtSigned(t.clv ?? 0, 1)} pts`} />)}
          </div>
        ) : <p className="chart-empty">No closing prices yet. CLV appears for settled win tickets with a price taken.</p>}
      </figure>
    </div>
  );
}

function NetLine({ tickets }: { tickets: Ticket[] }) {
  const W = 800;
  const H = 160;
  const pad = { l: 48, r: 8, t: 10, b: 20 };
  let acc = 0;
  const pts = [0, ...tickets.map((t) => (acc += (t.payout ?? 0) - t.stake))];
  const lo = Math.min(0, ...pts);
  const hi = Math.max(0, ...pts);
  const span = hi - lo || 1;
  const x = (i: number) => pad.l + (i / (pts.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / span) * (H - pad.t - pad.b);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img"
      aria-label={`Cumulative net after ${tickets.length} settled tickets: ${fmtMoney(last, { signed: true })}. Low ${fmtMoney(lo)}, high ${fmtMoney(hi)}.`}>
      <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="zero-rule" vectorEffect="non-scaling-stroke" />
      <text x={pad.l - 6} y={y(hi) + 4} className="axis-label" textAnchor="end">{fmtMoney(hi, { cents: false })}</text>
      {lo < 0 && <text x={pad.l - 6} y={y(lo)} className="axis-label" textAnchor="end">{fmtMoney(lo, { cents: false })}</text>}
      <text x={pad.l - 6} y={y(0) + 4} className="axis-label" textAnchor="end">0</text>
      <path d={d} className="net-path" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stub({ t, fmt, action }: { t: Ticket; fmt: ReturnType<typeof useSettings>['settings']['oddsFormat']; action?: React.ReactNode }) {
  const code = t.race_id.split('-')[0];
  const stamp = t.status === 'won' ? `PAID ${fmtMoney(t.payout)}` : t.status === 'lost' ? 'NOT IN THE MONEY' : t.status === 'void' ? `REFUNDED ${fmtMoney(t.stake)}` : null;
  const waiting = t.status === 'open' && t.post_time && serverNow() - Date.parse(t.post_time) > 2 * 3600_000;
  return (
    <li className={`stub stub-${t.status}`}>
      <span className="stub-serial num" aria-label={`Ticket ${serial(t)}`}>{serial(t)}</span>
      <Link to={`/r/${t.race_id}`} className="stub-race num" title={t.track_name}>{code} R{t.race_number}</Link>
      <span className="stub-kind">{KIND_LABEL[t.kind]}</span>
      <span className="stub-sel" aria-label={`Selection ${t.selection.join(', ')}`}>
        {t.selection.map((s, i) => <span key={s} className="combo-part">{i > 0 && <span className="combo-dash" aria-hidden="true" />}<Cloth program={s} size="xs" label={false} /></span>)}
      </span>
      <span className="stub-stake num">{fmtMoney(t.stake)}{t.odds_taken ? <> at {fmtOdds(t.odds_taken, fmt)}</> : null}</span>
      <span className="stub-model num">Model {t.model_prob != null ? `${(t.model_prob * 100).toFixed(t.model_prob < 0.1 ? 1 : 0)}%` : '—'}</span>
      <span className="stub-close num">{t.closing_odds ? <>Close {fmtOdds(t.closing_odds, fmt)}</> : <span className="muted">Close —</span>}{t.clv != null && <> · CLV {fmtSigned(t.clv, 1)}</>}</span>
      <span className="stub-status">
        {stamp ? <Stamp>{stamp}</Stamp>
          : waiting ? <span className="muted">Waiting for official result</span>
          : <span className="stub-pending">Pending · <MtpCell post={t.post_time} status="open" showPostWhenFar /></span>}
      </span>
      <span className="stub-meta num">{fmtShortDate(t.created_at.slice(0, 10))}{t.note ? ` · ${t.note}` : ''}</span>
      {action && <span className="stub-action">{action}</span>}
    </li>
  );
}

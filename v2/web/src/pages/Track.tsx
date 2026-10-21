import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { TrackRace, TrackResponse } from '../api/types';
import { useApi } from '../api/useApi';
import { Cloth } from '../components/Cloth';
import { IconStar } from '../components/Icons';
import { MtpCell } from '../components/Mtp';
import { NextUpStrip } from '../components/NextUpStrip';
import { EmptyState, InlineError, SkeletonRows } from '../components/States';
import { breedName } from '../domain/breed';
import { fmtDateline, fmtDistance, fmtEdge, fmtPct, fmtPurse, fmtTime } from '../domain/format';
import { useBoard } from '../state/board';
import { moveFocus, useShortcuts } from '../state/keys';
import { useSettings } from '../state/settings';
import { NotFoundPage } from './NotFound';

export function classAbbr(c: string | null): { short: string; full: string } {
  if (!c) return { short: '', full: '' };
  const map: Record<string, string> = {
    'Maiden Claiming': 'Mdn Clm', 'Maiden Special Weight': 'Mdn Sp Wt', Claiming: 'Clm', Allowance: 'Alw',
    'Allowance Optional Claiming': 'Aoc', Stakes: 'Stk', 'Graded Stakes': 'G Stk', Handicap: 'Hcp', Starter: 'Str',
    'Starter Allowance': 'Str Alw', Maiden: 'Mdn', 'Optional Claiming': 'Opt Clm',
  };
  return { short: map[c] ?? c, full: c };
}

export function conditions(r: { distance: string | null; distance_furlongs: number | null; surface: string | null; race_class: string | null }) {
  return [fmtDistance(r.distance, r.distance_furlongs), r.surface].filter(Boolean).join(' ');
}

export function TrackPage() {
  const { trackId = '' } = useParams();
  const nav = useNavigate();
  const board = useBoard();
  const { togglePin, isPinned } = useSettings();
  const tableRef = useRef<HTMLTableElement>(null);
  const st = useApi<TrackResponse>(`track:${trackId}`, (s) => api.track(trackId, s), 60_000);
  const d = st.data;

  useEffect(() => {
    document.title = `${d?.track.name ?? 'Track'} · Equine Edge`;
  }, [d?.track.name]);

  const boardTracks = board.data?.tracks ?? [];
  const order = [...boardTracks].filter((t) => t.next_race).sort((a, b) => Date.parse(a.next_race!.post_time ?? '') - Date.parse(b.next_race!.post_time ?? ''));
  useShortcuts((e) => {
    if (e.key === 'j') return moveFocus(tableRef.current, '.race-link', 1);
    if (e.key === 'k') return moveFocus(tableRef.current, '.race-link', -1);
    if ((e.key === ']' || e.key === '[') && order.length) {
      const i = order.findIndex((t) => t.id === trackId);
      const n = order[(i + (e.key === ']' ? 1 : -1) + order.length) % order.length];
      if (n) nav(`/t/${n.id}`);
      return true;
    }
    return false;
  });

  if (st.error?.isNotFound) {
    return <NotFoundPage what={`track ${trackId}`} />;
  }

  const races = d?.races ?? [];
  const surfaces = Array.from(new Set(races.map((r) => r.surface).filter(Boolean)));
  const pinned = d ? isPinned(d.track.code) : false;
  const replay = d?.status.source === 'archive';
  const anyLive = races.some((r) => r.market === 'live');

  return (
    <>
      <NextUpStrip items={board.data?.next_up ?? null} loading={board.loading} />
      <div className="page track">
        <Link to="/" className="back-link">‹ Today</Link>
        {st.loading && <SkeletonRows rows={10} cols={[8, 14, 40, 16]} height={40} label="Loading the card" />}
        {st.error && !d && (
          <InlineError title="Couldn't load this card." onRetry={st.refresh} back={{ to: '/', label: 'Go to Today' }} error={st.error}>
            {st.error.isOutage ? 'The data source didn’t respond.' : st.error.message}
          </InlineError>
        )}
        {d && (
          <>
            <header className="page-head track-head">
              <div>
                <h1 className="page-title track-title">{d.track.name}</h1>
                <p className="dateline-sub">
                  <span className="dl-date">{fmtDateline(d.track.date)}</span> · {breedName(d.track.breed)}{surfaces.length ? ` · ${surfaces.join(' · ')}` : ''} · {d.track.race_count} races
                </p>
              </div>
              <div className="head-actions">
                <button type="button" className="btn btn-secondary pin-btn" aria-pressed={pinned} onClick={() => togglePin(d.track.code)}>
                  <IconStar filled={pinned} /> {pinned ? 'Pinned' : 'Pin track'}
                </button>
                {replay && (
                  <button type="button" className="btn btn-secondary" disabled title="Replay — betting links are off">Bet on TwinSpires ↗</button>
                )}
              </div>
            </header>
            {st.error && <p className="stale-note" role="status">Couldn't refresh. Showing the card as of {fmtTime(st.updatedAt)}.</p>}
            {!anyLive && races.some((r) => r.status === 'open') && (
              <p className="banner banner-muted">Tote not open yet for most races. Top picks are shown against the morning line, and overlays only appear once real tote odds exist.</p>
            )}
            {races.length === 0 ? (
              <EmptyState title="Card not published yet.">TwinSpires usually posts entries by 9 AM ET.</EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="race-table" ref={tableRef}>
                  <caption className="visually-hidden">{d.track.name} races, {fmtDateline(d.track.date)}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="c-r" abbr="Race">R</th>
                      <th scope="col" className="c-post num">Post</th>
                      <th scope="col" className="c-mtp num" abbr="Minutes to post">MTP</th>
                      <th scope="col" className="c-cond">Conditions</th>
                      <th scope="col" className="c-purse num">Purse</th>
                      <th scope="col" className="c-pick">Top pick</th>
                      <th scope="col" className="c-over">Best overlay</th>
                      <th scope="col" className="c-status">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {races.map((r) => <RaceRow key={r.id} r={r} />)}
                  </tbody>
                </table>
              </div>
            )}
            <p className="table-note">Top pick = highest model win chance. Best overlay needs live tote odds, an edge of +2.0 pts or more, and at least “Some” evidence.</p>
          </>
        )}
      </div>
    </>
  );
}

function RaceRow({ r }: { r: TrackRace }) {
  const cls = r.race_class ? r.race_class : '';
  const status = statusText(r);
  return (
    <tr className={`${r.is_next ? 'is-next' : ''} st-${r.status}`}>
      <th scope="row" className="c-r">
        <Link to={`/r/${r.id}`} className="race-link stretched" aria-label={`Race ${r.number}${r.race_name ? `, ${r.race_name}` : ''}, post ${fmtTime(r.post_time)}`}>
          <span className="race-n">R{r.number}</span>
        </Link>
      </th>
      <td className="c-post num"><time dateTime={r.post_time ?? undefined}>{fmtTime(r.post_time)}</time></td>
      <td className="c-mtp num"><MtpCell post={r.post_time} status={r.status} /></td>
      <td className="c-cond">
        <span className="cond-main">{conditions(r)}</span>
        {cls && <span className="cond-class" title={cls}> · {classAbbr(cls).short}</span>}
        {r.race_name && <span className="cond-name"> · {r.race_name}</span>}
        <span className="cond-field"> · {r.field} runners</span>
      </td>
      <td className="c-purse num">{fmtPurse(r.purse)}</td>
      <td className="c-pick">
        {r.top_pick ? (
          <span className="pick"><Cloth program={r.top_pick.program} breed={r.breed} size="sm" /> <span className="pick-p model-ink">{fmtPct(r.top_pick.p_model)}</span><span className="pick-name">{r.top_pick.name}</span></span>
        ) : <span className="muted">—</span>}
      </td>
      <td className="c-over">
        {r.best_value ? (
          <span className="pick"><Cloth program={r.best_value.program} breed={r.breed} size="sm" /> <span className="edge edge-over"><span aria-hidden="true">▲ {fmtEdge(r.best_value.edge_pts)}</span><span className="visually-hidden">overlay, {fmtEdge(r.best_value.edge_pts)} points</span></span></span>
        ) : r.market !== 'live' && r.status === 'open' ? <span className="muted">ML only</span> : <span className="muted" aria-label="none">—</span>}
      </td>
      <td className="c-status">
        <span className={`status status-${r.status}`}>{status}</span>
        {r.status === 'official' && r.finish.length > 0 && (
          <span className="finish-chips" aria-label={`Finish ${r.finish.join(', ')}`}>
            {r.finish.slice(0, 3).map((p) => <Cloth key={p} program={p} breed={r.breed} size="xs" label={false} />)}
          </span>
        )}
      </td>
    </tr>
  );
}

function statusText(r: TrackRace): string {
  switch (r.status) {
    case 'official': return 'Official';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    default: return r.is_next ? 'Next' : 'Open';
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import type { RaceResponse, TicketKind } from '../api/types';
import { useApi } from '../api/useApi';
import { DumbbellChart } from '../components/Dumbbell';
import { ExoticsPanel } from '../components/ExoticsPanel';
import { MtpHero } from '../components/Mtp';
import { RunnerTable } from '../components/RunnerTable';
import { InlineError, SkeletonBar, SkeletonRows } from '../components/States';
import { Stamp } from '../components/Stamp';
import { TicketSheet, type TicketPreset } from '../components/TicketSheet';
import { serverNow } from '../domain/clock';
import { breedName } from '../domain/breed';
import { fmtDateline, fmtPct, fmtPurse, fmtTime, ordinal, tzAbbr } from '../domain/format';
import { mtpState } from '../domain/mtp';
import { ODDS_FORMAT_LABEL, type OddsFormat } from '../domain/odds';
import { activeInterests, marketMode, oddsStale, runnerByProgram, SORT_CYCLE, SORT_LABEL, sortRunners, type SortKey } from '../domain/race';
import { announce } from '../state/announcer';
import { useBoard } from '../state/board';
import { useNow } from '../state/clock';
import { useShortcuts } from '../state/keys';
import { useSettings } from '../state/settings';
import { classAbbr, conditions } from './Track';
import { NotFoundPage } from './NotFound';

function parseWhatIf(v: string | null): string[] {
  if (!v) return [];
  return Array.from(new Set(v.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[0-9]{1,2}[A-Z]?$/.test(s)))).slice(0, 24);
}

export function RacePage() {
  const { raceId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { settings, update } = useSettings();
  const fmt = settings.oddsFormat;
  const whatif = useMemo(() => parseWhatIf(params.get('whatif')), [params]);
  const sortParam = params.get('sort') as SortKey | null;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; preset: TicketPreset | null }>({ open: false, preset: null });
  const [exoticsOpen, setExoticsOpen] = useState(false);
  const exoticsRef = useRef<HTMLElement>(null);

  const key = `race:${raceId}?${whatif.join(',')}`;
  const st = useApi<RaceResponse>(key, (s) => api.race(raceId, whatif, s), (d) => {
    if (!d) return 60_000;
    const s = mtpState(d.race.post_time, d.race.status, serverNow());
    if (s.kind === 'official' || s.kind === 'cancelled') return 120_000;
    return s.minutes != null && s.minutes <= 15 ? 15_000 : 60_000;
  });
  const d = st.data;
  const now = useNow();

  useEffect(() => {
    setExpanded(null);
    setFocused(null);
  }, [raceId]);

  useEffect(() => {
    if (d) document.title = `${d.race.track_code} R${d.race.number} · ${d.race.track_name} · Equine Edge`;
  }, [d]);

  // Threshold announcements for the open race (DESIGN 8.2).
  const mtp = d ? mtpState(d.race.post_time, d.race.status, now) : null;
  useEffect(() => {
    if (!d || !mtp) return;
    const name = `${d.race.track_name} race ${d.race.number}`;
    if (mtp.kind === 'mtp' && mtp.minutes != null && [10, 5, 2].includes(mtp.minutes)) announce(`${name}: ${mtp.minutes} minutes to post.`, `${d.race.id}:${mtp.minutes}`);
    if (mtp.kind === 'atpost') {
      announce(`${name} is at post.`, `${d.race.id}:post`);
      if (settings.sounds) bugle(`${d.race.id}`);
    }
    if (mtp.kind === 'official' && d.result) {
      const w = [...d.result.finish].sort((a, b) => a.position - b.position)[0];
      const wr = w ? runnerByProgram(d.runners, w.program) : undefined;
      announce(`${name} is official.${wr ? ` Winner number ${wr.program} ${wr.name}.` : ''}`, `${d.race.id}:official`);
    }
  }, [d, mtp?.kind, mtp?.minutes, settings.sounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    setParams(p, { replace: true });
  }, [params, setParams]);

  const toggleWhatIf = useCallback((program: string) => {
    const next = whatif.includes(program) ? whatif.filter((x) => x !== program) : [...whatif, program];
    setQuery({ whatif: next.length ? next.join(',') : null });
  }, [whatif, setQuery]);

  const openTicket = useCallback((program?: string, kind: TicketKind = 'win', selection?: string[]) => {
    const r = program ? runnerByProgram(d?.runners ?? [], program) : undefined;
    setSheet({ open: true, preset: { kind, selection: selection ?? (r ? [r.interest] : []) } });
  }, [d]);

  const board = useBoard();

  const hasResult = !!d?.result && d.result.finish.length > 0;
  const sort: SortKey = sortParam && (SORT_CYCLE.includes(sortParam) || sortParam === 'finish') ? sortParam : hasResult ? 'finish' : 'program';
  const finishPos = useMemo(() => new Map((d?.result?.finish ?? []).map((f) => [f.program, f.position])), [d]);
  const sorted = useMemo(() => (d ? sortRunners(d.runners, sort, finishPos) : []), [d, sort, finishPos]);

  const deepLink = d?.race.deep_link ?? null;
  const replay = d?.status.source === 'archive';

  useShortcuts((e) => {
    if (!d) return false;
    const k = e.key;
    if (k === 'j' && d.race.next) { nav(`/r/${d.race.next}`); return true; }
    if (k === 'k' && d.race.prev) { nav(`/r/${d.race.prev}`); return true; }
    if (k === 'e') {
      setExoticsOpen(true);
      exoticsRef.current?.scrollIntoView({ block: 'start' });
      exoticsRef.current?.querySelector<HTMLElement>('[role="tab"]')?.focus();
      return true;
    }
    if (k === 's') {
      const i = SORT_CYCLE.indexOf(sort as SortKey);
      setQuery({ sort: SORT_CYCLE[(i + 1) % SORT_CYCLE.length] === 'program' ? null : SORT_CYCLE[(i + 1) % SORT_CYCLE.length] });
      return true;
    }
    if (k === 'X' && whatif.length) { setQuery({ whatif: null }); return true; }
    if (k === 'x' && focused) { toggleWhatIf(focused); return true; }
    if (k === 't' && d.race.status === 'open') { openTicket(focused ?? undefined); return true; }
    if (k === 'b' && deepLink) { window.open(deepLink, '_blank', 'noopener,noreferrer'); return true; }
    if ((k === '[' || k === ']') && board.data) {
      const order = board.data.tracks.filter((t) => t.next_race).sort((a, b) => Date.parse(a.next_race!.post_time ?? '') - Date.parse(b.next_race!.post_time ?? ''));
      const i = order.findIndex((t) => t.id === d.race.track_id);
      const n = order[(i + (k === ']' ? 1 : -1) + order.length) % order.length];
      if (n?.next_race) nav(`/r/${n.next_race.race_id}`);
      return true;
    }
    return false;
  });

  if (st.error?.isNotFound) {
    const m = /^([A-Z0-9]+)-(\d{8})-(\d+)$/i.exec(raceId);
    return <NotFoundPage what={`race ${raceId}`} trackId={m ? `${m[1].toUpperCase()}-${m[2]}` : undefined} />;
  }

  if (!d) {
    return (
      <div className="page race">
        {st.error ? (
          <InlineError title="Couldn't load this race." onRetry={st.refresh} back={{ to: '/', label: 'Back to Today' }} error={st.error}>
            {st.error.isOutage ? 'The data source didn’t respond. Nothing is lost; try again in a moment.' : st.error.message}
          </InlineError>
        ) : (
          <div aria-busy="true">
            <div className="race-head-skel"><SkeletonBar width="40%" height={28} /><SkeletonBar width="70%" height={14} /></div>
            <SkeletonRows rows={8} cols={[6, 40, 10, 10, 10]} height={48} label="Loading runners" />
          </div>
        )}
      </div>
    );
  }

  const r = d.race;
  const mode = marketMode(d);
  const ml = mode !== 'live';
  const mtpNow = mtp!;
  const { stale, ageS } = oddsStale(d, now, mtpNow.minutes);
  const noModel = d.runners.every((x) => !x.model);
  const scratchedOfficial = d.runners.filter((x) => x.scratched);
  const whatIfRunners = d.runners.filter((x) => x.whatif_scratched);
  const purse = fmtPurse(r.purse);
  const cancelled = r.status === 'cancelled';
  const ints = activeInterests(d.runners);

  const resultNote = (() => {
    if (!d.result || !d.result.finish.length) return null;
    const order = [...d.result.finish].sort((a, b) => a.position - b.position);
    const winner = runnerByProgram(d.runners, order[0].program);
    const top = ints.slice().sort((a, b) => b.p - a.p)[0];
    const topPos = top ? order.find((f) => runnerByProgram(d.runners, f.program)?.interest === top.key)?.position : undefined;
    const wInt = winner ? ints.slice().sort((a, b) => b.p - a.p).findIndex((i) => i.key === winner.interest) : -1;
    const wP = winner?.model?.p_model;
    return (
      <p className="result-note">
        {r.status === 'official' ? 'Official. ' : 'Unofficial result. '}
        {winner && <>#{winner.program} {winner.name} won. </>}
        {wP != null && <>We had it at <span className="model-ink num">{fmtPct(wP)}</span>{wInt >= 0 ? `, ${wInt === 0 ? 'highest' : `${ordinal(wInt + 1)}-highest`} in the field` : ''}. </>}
        {top && top.lead.interest !== winner?.interest && <>Our top pick #{top.key} {topPos ? `finished ${ordinal(topPos)}` : 'was out of the top finishers'}.</>}
      </p>
    );
  })();

  const betTitle = deepLink ? 'Opens this race on TwinSpires in a new tab. Equine Edge doesn’t place bets.' : replay ? 'Replay — betting links are off' : 'No TwinSpires link for this race';
  const postTime = fmtTime(r.post_time);
  const tz = tzAbbr(r.post_time);

  return (
    <div className="page race">
      <header className="race-head">
        <nav className="race-nav" aria-label="Races at this track">
          <Link to={`/t/${r.track_id}`} className="back-link"><span aria-hidden="true">‹ </span>{r.track_name}</Link>
          <ol className="race-nums">
            {r.race_numbers.map((x) => (
              <li key={x.id}>
                <Link to={`/r/${x.id}`} aria-current={x.id === r.id ? 'page' : undefined} className={`race-num st-${x.status}`} aria-label={`Race ${x.number}${x.status !== 'open' ? `, ${x.status}` : ''}`}>{x.number}</Link>
              </li>
            ))}
          </ol>
          <span className="race-nav-hint" aria-hidden="true"><kbd>j</kbd> / <kbd>k</kbd> · <kbd>?</kbd> shortcuts</span>
        </nav>

        <div className="race-title-row">
          <div className="race-title-block">
            <h1 className={`race-title${cancelled ? ' is-cancelled' : ''}`}>
              Race {r.number}{r.race_name ? <span className="race-name"> · {r.race_name}</span> : null}
            </h1>
            <p className="race-meta">
              {conditions(r)}{r.race_class ? <> · <span title={r.race_class}>{classAbbr(r.race_class).full}</span></> : null}{purse ? ` · ${purse}` : ''} · {breedName(r.breed)} · Post <time dateTime={r.post_time ?? undefined}>{postTime}</time>{tz ? ` ${tz}` : ''}
            </p>
            <p className="race-data">
              {mode === 'live' ? (
                <span className={stale ? 'data-stale' : ''}>
                  <span className={`lamp-dot ${stale ? 'is-ring' : 'is-brand'}`} aria-hidden="true" />
                  {replay ? 'Recorded tote odds' : stale && ageS != null ? `Odds ${Math.round(ageS / 60)} min old — reconnecting` : `Odds as of ${fmtTime(r.odds_updated_at ?? st.updatedAt, true)}`}
                </span>
              ) : mode === 'ml' ? <span>Morning line only — tote not open</span> : <span>No prices yet</span>}
              <span className="sep" aria-hidden="true"> · </span>
              <span>Model {d.prediction.model_version.replace(/^form-/, '')}</span>
              <span className="sep" aria-hidden="true"> · </span>
              <span>{fmtDateline(r.date, { short: true })}</span>
            </p>
          </div>
          <div className="race-hero">
            {r.status === 'official' ? <Stamp>OFFICIAL</Stamp>
              : cancelled ? <Stamp>CANCELLED</Stamp>
              : r.status === 'closed' ? <div className="mtp-hero mtp-done"><span className="mtp-hero-num">OFF</span><span className="mtp-hero-label">Results pending</span></div>
              : <MtpHero post={r.post_time} status={r.status} />}
            {mtpNow.kind !== 'far' && <span className="race-hero-post num">{postTime}</span>}
          <div className="race-actions">
            {deepLink ? (
              <a className="btn btn-secondary" href={deepLink} target="_blank" rel="noopener noreferrer" title={betTitle}>Bet on TwinSpires <span aria-hidden="true">↗</span></a>
            ) : (
              <button type="button" className="btn btn-secondary" disabled title={betTitle}>Bet on TwinSpires <span aria-hidden="true">↗</span></button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => openTicket()} disabled={r.status !== 'open' || noModel}
              title={r.status !== 'open' ? 'Betting on this race is closed' : undefined}>+ Ticket</button>
          </div>
          </div>
        </div>

      </header>

      {st.error && <p className="stale-note" role="status">Couldn't refresh. Showing data from {fmtTime(st.updatedAt)}.</p>}

      {cancelled ? (
        <p className="banner banner-warn">Race {r.number} was cancelled. Wagers are refunded by TwinSpires.</p>
      ) : (
        <>
          <div className="race-toolbar">
            <div className="chips" role="group" aria-label="Sort runners">
              <span className="toolbar-label" aria-hidden="true">Sort</span>
              {(hasResult ? (['finish', ...SORT_CYCLE] as SortKey[]) : SORT_CYCLE).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={sort === k} onClick={() => setQuery({ sort: k === (hasResult ? 'finish' : 'program') ? null : k })}>{SORT_LABEL[k]}</button>
              ))}
            </div>
            <label className="odds-select">
              <span className="toolbar-label">Odds</span>
              <select value={fmt} onChange={(e) => update({ oddsFormat: e.target.value as OddsFormat })} aria-label="Odds format">
                <option value="fractional">{ODDS_FORMAT_LABEL.fractional} fractional</option>
                <option value="decimal">{ODDS_FORMAT_LABEL.decimal} decimal</option>
                <option value="american">{ODDS_FORMAT_LABEL.american} American</option>
              </select>
            </label>
          </div>

          {whatIfRunners.length > 0 && (
            <div className="banner banner-whatif" role="status">
              <span>What-if: without {whatIfRunners.map((x) => `#${x.program}`).join(', ')}. Model chances recomputed. Live odds unchanged.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setQuery({ whatif: null })}>Reset</button>
            </div>
          )}
          {mode === 'ml' && r.status === 'open' && (
            <p className="banner banner-muted">Tote opens closer to post. Edge is shown against the morning line for now, muted, and nothing is flagged until real tote odds exist.</p>
          )}
          {stale && <p className="banner banner-warn">Odds are out of date. Edge is shown hollow and nothing is flagged until prices refresh.</p>}
          {noModel && <p className="banner banner-muted">We're not showing a model opinion for this race: too few runners have enough history. Odds are still shown.</p>}
          {r.status === 'closed' && !hasResult && <p className="banner banner-muted">Betting is closed. Results pending.</p>}
          {resultNote}
          {scratchedOfficial.length > 0 && !whatIfRunners.length && (
            <p className="race-scr-note">Scratched: {scratchedOfficial.map((x) => `#${x.program} ${x.name}`).join(', ')}. Chances are recomputed without them.</p>
          )}

          <div className="race-grid">
            <section className="race-main" aria-label="Runners">
              {d.runners.length === 0 ? (
                <p className="empty-title">Entries for Race {r.number} aren't published yet.</p>
              ) : (
                <RunnerTable
                  data={d}
                  runners={sorted}
                  sort={sort}
                  onSort={(k) => setQuery({ sort: k === (hasResult ? 'finish' : 'program') ? null : k })}
                  format={fmt}
                  stale={stale}
                  ml={ml}
                  whatifActive={whatif.length > 0}
                  showUnderlays={settings.showUnderlays}
                  expanded={expanded}
                  onExpand={setExpanded}
                  focused={focused}
                  onFocusRow={setFocused}
                  highlight={highlight}
                  onHighlight={setHighlight}
                  onWhatIf={toggleWhatIf}
                  onTicket={(p) => openTicket(p)}
                />
              )}
              <p className="table-note">
                Model chances sum to {Math.round(d.prediction.sum_p * 100)}% across {d.prediction.active_interests} betting interests.
                {mode === 'live' ? ' Market chances shown with takeout removed.' : ' Morning line is the track’s guess, not a price.'}
                {whatif.length > 0 && ' *Approximate: the real market will re-form after a scratch.'}
                {' '}Edge = model % − market %, in points.
              </p>
            </section>

            <aside className="race-side" aria-label="Charts and exotics">
              <section className="panel panel-chart">
                <h2 className="panel-title">Model vs {ml ? 'morning line' : 'market'}</h2>
                <DumbbellChart runners={sorted} breed={r.breed} ml={ml} highlight={highlight} onHighlight={setHighlight} />
              </section>
              <section className="panel panel-exotics" ref={exoticsRef}>
                <details open={exoticsOpen || undefined} className="exotics-details" onToggle={(e) => setExoticsOpen((e.target as HTMLDetailsElement).open)}>
                  <summary className="panel-title">Exotics<span className="ph-only">: top combos</span></summary>
                  <ExoticsPanel data={d} onTicket={(kind, sel) => openTicket(undefined, kind, sel)} />
                </details>
                <div className="exotics-desktop">
                  <h2 className="panel-title">Exotics</h2>
                  <ExoticsPanel data={d} onTicket={(kind, sel) => openTicket(undefined, kind, sel)} />
                </div>
              </section>
              <section className="panel panel-about">
                <h2 className="panel-title">About this prediction</h2>
                <p>
                  The market price is the backbone of every number here. The form model nudges it
                  {d.prediction.market === 'live' ? ' (weight 0.4 against live tote odds)' : ' (weight 0.6 against the morning line)'}, and runners with little history stay close to the market.
                  {' '}{Math.round(d.prediction.coverage * 100)}% of this field has three or more starts in our data.
                </p>
                <Link to="/model" className="btn-link">How the model works and how it has done ›</Link>
              </section>
            </aside>
          </div>
        </>
      )}

      <div className="action-bar" aria-label="Race actions">
        {deepLink ? (
          <a className="btn btn-secondary" href={deepLink} target="_blank" rel="noopener noreferrer">Bet on TwinSpires <span aria-hidden="true">↗</span></a>
        ) : (
          <button type="button" className="btn btn-secondary" disabled title={betTitle}>Bet on TwinSpires <span aria-hidden="true">↗</span></button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => openTicket()} disabled={r.status !== 'open' || noModel}>+ Ticket</button>
      </div>

      <TicketSheet open={sheet.open} onClose={() => setSheet((s) => ({ ...s, open: false }))} data={d} preset={sheet.preset} stale={stale} />
    </div>
  );
}

const played = new Set<string>();
function bugle(id: string) {
  if (played.has(id)) return;
  played.add(id);
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes: [number, number, number][] = [[392, 0, 0.18], [523.25, 0.2, 0.4]];
    notes.forEach(([f, t, dur]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + dur + 0.05);
    });
  } catch {
    /* no audio */
  }
}

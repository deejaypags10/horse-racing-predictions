import { Fragment, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { RaceResponse, Runner } from '../api/types';
import { edgeView } from '../domain/edge';
import { fmtMoney, fmtPct, ordinal } from '../domain/format';
import { fmtOdds, oddsSpeech, type OddsFormat } from '../domain/odds';
import { isInterestLead, isOut, SORT_LABEL, type SortKey } from '../domain/race';
import { Cloth } from './Cloth';
import { MiniDumbbell } from './Dumbbell';
import { EdgeValue } from './EdgeValue';
import { EvidenceMeter } from './EvidenceMeter';
import { OddsFlip } from './OddsFlip';
import { RowMenu } from './RowMenu';
import { RunnerDrawer } from './RunnerDrawer';

interface Props {
  data: RaceResponse;
  runners: Runner[];          // already sorted
  sort: SortKey;
  onSort: (k: SortKey) => void;
  format: OddsFormat;
  stale: boolean;
  ml: boolean;
  whatifActive: boolean;
  showUnderlays: boolean;
  expanded: string | null;
  onExpand: (program: string | null) => void;
  focused: string | null;
  onFocusRow: (program: string) => void;
  highlight: string | null;
  onHighlight: (program: string | null) => void;
  onWhatIf: (program: string) => void;
  onTicket: (program: string) => void;
}

/** Programs whose model chance changed since the previous data (for the "changed" underline). */
function useChanged(runners: Runner[]): Set<string> {
  const prev = useRef<Map<string, number | null>>(new Map());
  const [changed, setChanged] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Map(runners.map((r) => [r.program, r.model ? Math.round(r.model.p_model * 1000) : null]));
    const diff = new Set<string>();
    if (prev.current.size) {
      next.forEach((v, k) => { if (prev.current.has(k) && prev.current.get(k) !== v) diff.add(k); });
    }
    prev.current = next;
    if (diff.size) {
      setChanged(diff);
      const t = window.setTimeout(() => setChanged(new Set()), 1500);
      return () => window.clearTimeout(t);
    }
  }, [runners]);
  return changed;
}

export function RunnerTable(p: Props) {
  const { data, runners, sort, format, stale, ml } = p;
  const result = data.result;
  const finish = new Map((result?.finish ?? []).map((f) => [f.program, f]));
  const hasResult = !!result && finish.size > 0;
  const official = data.race.status === 'official';
  const tbody = useRef<HTMLTableSectionElement>(null);
  const changed = useChanged(data.runners);
  const active = data.prediction.active_interests;
  const cols = 9 + (hasResult ? 2 : 0) + 1; // +1 phone-only mini cell
  const canTicket = data.race.status === 'open';

  const sortTh = (k: SortKey, label: string, cls: string, abbr?: string) => (
    <th scope="col" className={cls} abbr={abbr} aria-sort={sort === k ? (k === 'program' || k === 'odds' || k === 'finish' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className={`th-sort${sort === k ? ' is-on' : ''}`} onClick={() => p.onSort(k)}>
        {label}{sort === k && <span aria-hidden="true" className="th-arrow">{k === 'program' || k === 'odds' || k === 'finish' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );

  const onKey = (e: KeyboardEvent<HTMLTableSectionElement>) => {
    const rows = Array.from(tbody.current?.querySelectorAll<HTMLTableRowElement>('tr.runner') ?? []);
    const i = rows.indexOf(document.activeElement as HTMLTableRowElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      n.focus();
      p.onFocusRow(n.dataset.program!);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const prog = rows[i].dataset.program!;
      p.onExpand(p.expanded === prog ? null : prog);
    }
  };

  const tabRow = p.focused ?? runners.find((r) => !r.scratched)?.program ?? null;
  const caption = `Race ${data.race.number} runners, ${active} betting interests, sorted by ${SORT_LABEL[sort].toLowerCase()}${p.whatifActive ? ', with what-if scratches' : ''}`;

  return (
    <div className="runner-table-wrap">
      <table className={`runner-table${ml ? ' is-ml' : ''}${stale ? ' is-stale' : ''}${hasResult ? ' has-result' : ''}`}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {hasResult && sortTh('finish', 'Fin', 'c-fin num', 'Finish')}
            {sortTh('program', '#', 'c-num', 'Program number')}
            <th scope="col" className="c-horse">Horse / {data.race.breed === 'harness' ? 'Driver' : 'Jockey'} / Trainer</th>
            <th scope="col" className="c-ml num" abbr="Morning line">ML</th>
            {sortTh('odds', official ? 'Final' : 'Live', 'c-live num', official ? 'Final odds' : 'Live odds')}
            {sortTh('model', 'Model', 'c-model num', 'Model win chance')}
            <th scope="col" className="c-fair num" abbr="Fair odds" title="Fair odds are the price at which a bet would break even if our chance is right, before takeout.">Fair</th>
            {sortTh('edge', hasResult ? 'Edge at post' : p.whatifActive ? 'Edge*' : 'Edge', 'c-edge num', 'Edge in points')}
            <th scope="col" className="c-evid" abbr="Evidence">Evid.</th>
            {hasResult && <th scope="col" className="c-pays num" abbr="Payouts for $2">$2 W / P / S</th>}
            <th scope="col" className="c-menu"><span className="visually-hidden">Actions</span></th>
            <th scope="col" className="c-mini" aria-hidden="true" />
          </tr>
        </thead>
        <tbody ref={tbody} onKeyDown={onKey}>
          {runners.map((r) => {
            const lead = isInterestLead(r, data.runners);
            const out = isOut(r);
            const m = r.model;
            const ev = m ? edgeView({ pts: m.edge_pts, value: m.value, evidence: m.evidence, priceSource: m.price_source, stale }) : null;
            const flagged = !!ev?.flagged && !p.whatifActive;
            const isOpen = p.expanded === r.program;
            const f = finish.get(r.program);
            const liveText = r.live_decimal ? fmtOdds(r.live_decimal, format, { raw: r.live_odds }) : '—';
            const mlText = r.morning_line_decimal ? fmtOdds(r.morning_line_decimal, format, { raw: r.morning_line }) : '—';
            const fairText = m ? fmtOdds(m.fair_decimal, format, { round: 'tote' }) : '—';
            const ch = changed.has(r.program) ? ' is-changed' : '';
            const cls = ['runner', flagged ? 'is-overlay' : '', r.scratched ? 'is-scratched' : '', r.whatif_scratched ? 'is-whatif' : '',
              p.highlight === r.program ? 'is-hl' : '', isOpen ? 'is-open' : '', !lead ? 'is-coupled-follow' : ''].filter(Boolean).join(' ');
            const conn = [r.jockey, r.trainer].filter(Boolean).join(' · ');

            return (
              <Fragment key={r.program}>
                <tr
                  className={cls}
                  data-program={r.program}
                  tabIndex={r.scratched ? -1 : tabRow === r.program ? 0 : -1}
                  aria-expanded={r.scratched ? undefined : isOpen}
                  aria-disabled={r.scratched || undefined}
                  onClick={(e) => {
                    if (r.scratched || (e.target as HTMLElement).closest('button, a, select, input')) return;
                    p.onFocusRow(r.program);
                    p.onExpand(isOpen ? null : r.program);
                  }}
                  onFocus={(e) => { if (e.target === e.currentTarget) p.onFocusRow(r.program); }}
                  onMouseEnter={() => p.onHighlight(r.program)}
                  onMouseLeave={() => p.onHighlight(null)}
                >
                  {hasResult && <td className="c-fin num">{f ? <span className={official ? 'fin' : 'fin is-unofficial'}>{ordinal(f.position)}</span> : ''}</td>}
                  <td className="c-num"><Cloth program={r.program} breed={data.race.breed} scratched={r.scratched} sourceColors={{ bg: r.saddle_color, fg: r.saddle_text_color }} /></td>
                  <th scope="row" className="c-horse">
                    <span className="horse-line">
                      <span className="horse-name">{r.name}</span>
                      {r.scratched && <span className="tag tag-scr">SCR<span className="visually-hidden">, scratched</span></span>}
                      {r.whatif_scratched && <span className="tag tag-whatif">WHAT-IF<span className="visually-hidden"> scratch</span></span>}
                      {r.coupled && <span className="tag tag-entry" title={`Coupled entry: bets on #${r.interest} include every runner in the entry`}>Entry {r.interest}</span>}
                      {m && m.rank === 1 && !out && <span className="tag tag-top" title="Highest model chance">Top pick</span>}
                    </span>
                    {conn && <span className="horse-conn" title={conn}>{conn}</span>}
                  </th>
                  {r.scratched ? (
                    <td className="c-scr-span" colSpan={6 + (hasResult ? 1 : 0)}>
                      <span className="scr-line">Scratched</span>
                    </td>
                  ) : (
                    <>
                      <td className="c-ml num"><span aria-label={oddsSpeech(mlText)}><span className="ph-label" aria-hidden="true">ML </span>{mlText}</span></td>
                      <td className="c-live num">{r.live_decimal ? <OddsFlip text={liveText} className={stale ? 'is-stale' : ''} /> : <span className="muted" aria-label="no live odds">—</span>}</td>
                      {!lead ? (
                        <td className="c-coupled" colSpan={4}>Coupled with #{r.interest}: one betting interest</td>
                      ) : out || !m ? (
                        <>
                          <td className="c-model num muted">—</td>
                          <td className="c-fair num muted">—</td>
                          <td className="c-edge num muted">—</td>
                          <td className="c-evid" />
                        </>
                      ) : (
                        <>
                          <td className={`c-model num model-ink${ch}`}>{fmtPct(m.p_model)}</td>
                          <td className={`c-fair num${ch}`}><span aria-label={oddsSpeech(fairText)}>{fairText}</span></td>
                          <td className={`c-edge num${ch}`}><EdgeValue model={m} stale={stale} withWord showUnderlays={p.showUnderlays} /></td>
                          <td className="c-evid"><EvidenceMeter evidence={m.evidence} starts={m.starts} /></td>
                        </>
                      )}
                    </>
                  )}
                  {hasResult && !r.scratched && (
                    <td className="c-pays num">{f && f.position <= 3 ? [f.win_pay, f.place_pay, f.show_pay].map((v) => (v ? fmtMoney(v).replace('$', '') : '—')).join(' / ') : ''}</td>
                  )}
                  <td className="c-menu">
                    {!r.scratched && (
                      <RowMenu label={`Actions for number ${r.program} ${r.name}`} items={[
                        { label: r.whatif_scratched ? 'Restore (undo what-if)' : 'What-if scratch', onSelect: () => p.onWhatIf(r.program) },
                        { label: 'Add paper ticket', onSelect: () => p.onTicket(r.program), disabled: !canTicket || out, title: !canTicket ? 'Betting on this race is closed' : undefined },
                        { label: isOpen ? 'Hide details' : 'Details', onSelect: () => p.onExpand(isOpen ? null : r.program) },
                      ]} />
                    )}
                  </td>
                  <td className="c-mini" aria-hidden="true">
                    {lead && m && !out && (
                      <>
                        <MiniDumbbell model={m.p_model} market={m.p_market} edge={m.edge_pts} ml={ml} />
                        <span className="mini-text model-ink">{fmtPct(m.p_model)} · fair {fairText}</span>
                      </>
                    )}
                  </td>
                </tr>
                {isOpen && !r.scratched && (
                  <tr className="drawer-row">
                    <td colSpan={cols}>
                      <RunnerDrawer runner={r} race={data.race} field={data.runners} format={format} stale={stale}
                        onWhatIf={() => p.onWhatIf(r.program)} onTicket={() => p.onTicket(r.program)} canTicket={canTicket} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

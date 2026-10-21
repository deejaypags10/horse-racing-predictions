import type { RaceDetail, Runner } from '../api/types';
import { fmtDistance, fmtMoney, fmtPct, fmtShortDate, ordinal, plural } from '../domain/format';
import { runnerNotes, daysSinceLast } from '../domain/notes';
import { fmtOdds, type OddsFormat } from '../domain/odds';
import { EVIDENCE_NAME } from '../domain/evidence';
import { EvidenceMeter } from './EvidenceMeter';

export function RunnerDrawer({ runner, race, field, format, onWhatIf, onTicket, canTicket, stale }: {
  runner: Runner;
  race: RaceDetail;
  field: Runner[];
  format: OddsFormat;
  onWhatIf: () => void;
  onTicket: () => void;
  canTicket: boolean;
  stale: boolean;
}) {
  const m = runner.model;
  const notes = runnerNotes(runner, race, field, format);
  const d = daysSinceLast(runner, race.date);
  const bio = [runner.age ? `${runner.age}yo` : null, runner.sex, runner.weight ? `${runner.weight} lb` : null,
    runner.sire ? `by ${runner.sire}` : null, runner.dam ? `out of ${runner.dam}` : null].filter(Boolean).join(' · ');
  const priceText = runner.live_decimal && !stale ? fmtOdds(runner.live_decimal, format, { raw: runner.live_odds }) : null;
  return (
    <div className="drawer">
      <div className="drawer-col">
        <h3 className="drawer-h">Recent starts in our data</h3>
        {runner.recent.length ? (
          <table className="pp-table">
            <caption className="visually-hidden">Last {runner.recent.length} starts for {runner.name}</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Trk</th>
                <th scope="col">Dist</th>
                <th scope="col">Surf</th>
                <th scope="col" className="num">Fin</th>
              </tr>
            </thead>
            <tbody>
              {runner.recent.map((p) => (
                <tr key={`${p.date}-${p.track}`}>
                  <td className="num">{fmtShortDate(p.date)}</td>
                  <td>{p.track}</td>
                  <td className="num">{fmtDistance(null, p.dist_f)}</td>
                  <td>{p.surface ? cap(p.surface) : '—'}</td>
                  <td className="num">{p.position ? `${ordinal(p.position)}${p.field ? `/${p.field}` : ''}` : '—'}{p.favorite && <abbr title="Favourite" className="fav-tag">fav</abbr>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No starts in our data. No workouts or beaten lengths are available from this source.</p>}
        {d != null && <p className="drawer-meta num">{plural(d, 'day')} since last start{d >= 90 ? ' (layoff)' : ''}.</p>}
        {bio && <p className="drawer-meta">{bio}</p>}
      </div>

      <div className="drawer-col">
        <h3 className="drawer-h">What the numbers say</h3>
        {notes.length ? <ul className="notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="muted">No model opinion for this runner.</p>}
      </div>

      {m && (
        <div className="drawer-col">
          <h3 className="drawer-h">Figures</h3>
          <dl className="figs">
            <div><dt>Model win chance</dt><dd className="model-ink">{fmtPct(m.p_model)}</dd></div>
            <div><dt>{m.price_source === 'live' ? 'Market (tote, takeout removed)' : 'Morning line implies'}</dt><dd>{fmtPct(m.p_market)}</dd></div>
            <div><dt>Form model alone</dt><dd>{fmtPct(m.p_form)}</dd></div>
            <div><dt>Top two (place)</dt><dd>{fmtPct(m.p_top2)}</dd></div>
            <div><dt>Top three (show)</dt><dd>{fmtPct(m.p_top3)}</dd></div>
            <div><dt>Fair odds</dt><dd>{fmtOdds(m.fair_decimal, format, { round: 'tote' })}</dd></div>
            <div><dt>Worth backing at</dt><dd>{fmtOdds(m.min_price_decimal, format, { round: 'tote' })} or longer</dd></div>
            {m.exp_return != null && <div><dt>Expected return per $1 at {m.price_source === 'live' ? 'this price' : 'the ML'}</dt><dd>{fmtMoney(m.exp_return, { signed: true })}</dd></div>}
            <div><dt>Evidence</dt><dd><EvidenceMeter evidence={m.evidence} starts={m.starts} /> {EVIDENCE_NAME[m.evidence]} · {plural(m.starts, 'start')}</dd></div>
          </dl>
        </div>
      )}

      <div className="drawer-actions">
        <button type="button" className="btn btn-secondary" onClick={onWhatIf}>{runner.whatif_scratched ? 'Restore runner' : 'What-if scratch'}</button>
        {!runner.whatif_scratched && (
          <button type="button" className="btn btn-secondary" onClick={onTicket} disabled={!canTicket} title={canTicket ? undefined : 'Betting on this race is closed'}>
            + Paper ticket{priceText ? ` at ${priceText}` : ''}
          </button>
        )}
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

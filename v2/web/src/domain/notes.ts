import type { PastRun, RaceDetail, Runner } from '../api/types';
import { fmtDistance, fmtPct, ordinal, plural } from './format';
import type { OddsFormat } from './odds';
import { fmtOdds } from './odds';

function daysBetween(a: string, b: string): number | null {
  const ta = Date.parse(`${a}T12:00:00Z`);
  const tb = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.round((tb - ta) / 86_400_000);
}

export function daysSinceLast(r: Runner, raceDate: string): number | null {
  const last = r.recent[0];
  return last ? daysBetween(last.date, raceDate) : null;
}

function surfaceOf(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+track$/, '').trim();
}

export function pastRunLine(p: PastRun): string {
  const pos = p.position ? `${ordinal(p.position)}${p.field ? ` of ${p.field}` : ''}` : 'finish unknown';
  return pos;
}

/**
 * Plain-language notes derived only from the numbers the API gives us.
 * Never speculative: every sentence restates a figure in words.
 */
export function runnerNotes(r: Runner, race: RaceDetail, field: Runner[], format: OddsFormat): string[] {
  const m = r.model;
  const notes: string[] = [];
  if (!m) return notes;
  const active = field.filter((x) => x.model && !x.scratched && !x.whatif_scratched);
  const interests = new Set(active.map((x) => x.interest)).size;

  if (m.rank === 1) notes.push(`Highest model chance in the field of ${interests}.`);
  else if (m.rank <= 3) notes.push(`${ordinal(m.rank)}-highest model chance in the field of ${interests}.`);

  if (m.p_market != null) {
    const src = m.price_source === 'live' ? 'The tote implies' : 'The morning line implies';
    notes.push(`${src} about ${fmtPct(m.p_market)}. Our model says ${fmtPct(m.p_model)}.`);
    if (m.edge_pts != null && m.edge_pts >= 2 && m.p_model < 0.5) {
      const loses = Math.max(1, Math.round((1 - m.p_model) / m.p_model));
      notes.push(`Overlays lose often too: a ${fmtPct(m.p_model)} chance still loses about ${loses} race${loses === 1 ? '' : 's'} for every one it wins.`);
    }
  }

  if (Math.abs(m.p_form - m.p_model) >= 0.03) {
    const dir = m.p_form > m.p_model ? 'higher' : 'lower';
    notes.push(`Form alone rates it ${fmtPct(m.p_form)}, ${dir} than the blend; the market pulls the number back toward the tote.`);
  }

  const last = r.recent[0];
  if (last) {
    const d = daysSinceLast(r, race.date);
    const where = [last.track, fmtDistance(null, last.dist_f), last.surface].filter(Boolean).join(' ');
    notes.push(`Last time out: ${pastRunLine(last)}${where ? ` (${where})` : ''}${last.favorite ? ', as the favourite' : ''}${d != null ? `, ${plural(d, 'day')} ago` : ''}.`);
    if (d != null && d >= 90) notes.push(`Returning from a layoff of ${plural(d, 'day')}.`);
    const wins = r.recent.filter((p) => p.position === 1).length;
    const top3 = r.recent.filter((p) => p.position != null && p.position <= 3).length;
    if (r.recent.length >= 3) notes.push(`${wins === 0 ? 'No wins' : plural(wins, 'win')} and ${top3} top-3 finish${top3 === 1 ? '' : 'es'} in the last ${r.recent.length} starts we hold.`);
    const raceSurface = surfaceOf(race.surface);
    if (raceSurface && r.recent.every((p) => surfaceOf(p.surface) && surfaceOf(p.surface) !== raceSurface)) {
      notes.push(`None of its recent starts were on ${raceSurface}.`);
    }
    if (race.distance_furlongs && last.dist_f && Math.abs(race.distance_furlongs - last.dist_f) >= 1.5) {
      notes.push(`${race.distance_furlongs > last.dist_f ? 'Stretching out' : 'Cutting back'} from ${fmtDistance(null, last.dist_f)} to ${fmtDistance(race.distance, race.distance_furlongs)}.`);
    }
  }

  if (m.starts === 0) notes.push('No prior starts in our data, so the model leans entirely on the market for this runner.');
  else if (m.starts < 3) notes.push(`Only ${plural(m.starts, 'prior start')} in our data. Treat ${fmtPct(m.p_model)} as a rough guess.`);

  if (m.min_price_decimal) {
    notes.push(`On our numbers it needs ${fmtOdds(m.min_price_decimal, format, { round: 'tote' })} or longer to be worth backing (fair price plus a 15% cushion).`);
  }
  return notes;
}

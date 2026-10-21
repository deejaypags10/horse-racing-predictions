import type { RaceResponse, Runner } from '../api/types';
import { EVIDENCE_NAME } from './evidence';
import { fmtOdds, type OddsFormat } from './odds';
import { isInterestLead, isOut } from './race';

export interface Verdict {
  kind: 'value' | 'none' | 'ml' | 'noprice' | 'allout' | 'nomodel' | 'hidden' | 'flagsoff';
  text: string;
  thin: boolean;          // coverage < 0.5 note appended
  unvalidated: boolean;   // value line but blend not calibrated
}

/** Runners the backend flags as value, best edge first (one per betting interest). */
export function valueRunners(data: RaceResponse): Runner[] {
  return data.runners
    .filter((r) => r.model?.value && isInterestLead(r, data.runners))
    .sort((a, b) => (b.model!.edge_pts ?? 0) - (a.model!.edge_pts ?? 0));
}

/** The runner a fresh "+ Ticket" should start on: best value, else highest chance. */
export function defaultTicketRunner(data: RaceResponse): Runner | undefined {
  const v = valueRunners(data)[0];
  if (v) return v;
  return data.runners
    .filter((r) => r.model && isInterestLead(r, data.runners))
    .sort((a, b) => b.model!.p_model - a.model!.p_model)[0];
}

/** The two-second answer above the runner table, computed only from the payload. */
export function raceVerdict(data: RaceResponse, format: OddsFormat, opts: { valueFlags: boolean; coolOff: boolean }): Verdict {
  const thin = data.prediction.coverage < 0.5;
  const base = { thin, unvalidated: false };
  if (data.runners.length > 0 && data.runners.every(isOut)) {
    return { ...base, thin: false, kind: 'allout', text: 'Every runner is scratched in this what-if.' };
  }
  if (opts.coolOff) return { ...base, thin: false, kind: 'hidden', text: 'Cool-off is on: edge and value are hidden.' };
  const market = data.prediction.market;
  if (market === 'none') return { ...base, kind: 'noprice', text: 'No prices yet.' };
  if (data.runners.every((r) => !r.model)) return { ...base, thin: false, kind: 'nomodel', text: 'No model opinion for this race. Odds are still shown.' };
  if (market === 'morning_line') {
    return { ...base, kind: 'ml', text: "Morning line only — no tote prices yet. Chances lean on the track's line." };
  }
  const vals = valueRunners(data);
  if (vals.length && !opts.valueFlags) {
    return { ...base, kind: 'flagsoff', text: 'Value flags are off in Settings.' };
  }
  if (vals.length) {
    const parts = vals.slice(0, 2).map((r) => {
      const m = r.model!;
      const price = r.live_decimal ? fmtOdds(r.live_decimal, format, { raw: r.live_odds }) : '—';
      return `#${r.program} ${r.name}: ${price} vs fair ${fmtOdds(m.fair_decimal, format, { round: 'tote' })} · evidence ${EVIDENCE_NAME[m.evidence].toLowerCase()}`;
    });
    return { ...base, kind: 'value', text: parts.join('; '), unvalidated: data.prediction.blend_calibrated === false };
  }
  return { ...base, kind: 'none', text: 'No runner beats the tote at current prices.' };
}

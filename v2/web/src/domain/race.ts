import type { RaceResponse, Runner, RunnerModel } from '../api/types';

export type SortKey = 'program' | 'model' | 'edge' | 'odds' | 'finish';
export const SORT_CYCLE: SortKey[] = ['program', 'model', 'edge', 'odds'];
export const SORT_LABEL: Record<SortKey, string> = { program: 'Program', model: 'Model', edge: 'Edge', odds: 'Odds', finish: 'Finish' };

export function programCompare(a: string, b: string): number {
  const ma = /^(\d+)(.*)$/.exec(a);
  const mb = /^(\d+)(.*)$/.exec(b);
  if (ma && mb) {
    const d = parseInt(ma[1], 10) - parseInt(mb[1], 10);
    return d !== 0 ? d : ma[2].localeCompare(mb[2]);
  }
  return a.localeCompare(b);
}

/** Is this row the first (model-bearing) member of its betting interest? */
export function isInterestLead(r: Runner, all: Runner[]): boolean {
  const members = all.filter((x) => x.interest === r.interest && !x.scratched);
  if (members.length <= 1) return true;
  const lead = [...members].sort((a, b) => programCompare(a.program, b.program))[0];
  return lead.program === r.program;
}

export function isOut(r: Runner): boolean {
  return r.scratched || r.whatif_scratched;
}

export function currentOdds(r: Runner): { decimal: number | null; raw: string | null; source: 'live' | 'ml' | null } {
  if (r.live_decimal) return { decimal: r.live_decimal, raw: r.live_odds, source: 'live' };
  if (r.morning_line_decimal) return { decimal: r.morning_line_decimal, raw: r.morning_line, source: 'ml' };
  return { decimal: null, raw: null, source: null };
}

export function sortRunners(runners: Runner[], key: SortKey, finishPos?: Map<string, number>): Runner[] {
  const modelOf = (r: Runner): RunnerModel | null => r.model;
  const val = (r: Runner): number => {
    switch (key) {
      case 'model': return -(modelOf(r)?.p_model ?? -1);
      case 'edge': return -(modelOf(r)?.edge_pts ?? -1e9);
      case 'odds': return currentOdds(r).decimal ?? 1e9;
      case 'finish': return finishPos?.get(r.program) ?? 1e6;
      default: return 0;
    }
  };
  return [...runners].sort((a, b) => {
    const oa = isOut(a) ? 1 : 0;
    const ob = isOut(b) ? 1 : 0;
    if (key !== 'program' && oa !== ob) return oa - ob;
    if (key === 'program') return programCompare(a.program, b.program);
    // Coupled members share model values: keep them together in program order.
    const d = val(a) - val(b);
    if (d !== 0) return d;
    return programCompare(a.program, b.program);
  });
}

export type MarketMode = 'live' | 'ml' | 'none';

export function marketMode(data: RaceResponse): MarketMode {
  if (data.prediction.market === 'live') return 'live';
  if (data.prediction.market === 'morning_line') return 'ml';
  return 'none';
}

/** Odds age thresholds (DESIGN 4.3 "Stale odds"). Replay data is never stale. */
export function oddsStale(data: RaceResponse, nowMs: number, mtpMinutes: number | null): { stale: boolean; ageS: number | null } {
  if (!data.status.live || marketMode(data) !== 'live') return { stale: false, ageS: null };
  const at = data.race.odds_updated_at ? Date.parse(data.race.odds_updated_at) : NaN;
  if (Number.isNaN(at)) return { stale: false, ageS: null };
  const ageS = Math.max(0, Math.round((nowMs - at) / 1000));
  const limit = mtpMinutes != null && mtpMinutes <= 10 ? 60 : 300;
  return { stale: ageS > limit, ageS };
}

export function activeInterests(runners: Runner[]): { key: string; p: number; lead: Runner }[] {
  const out: { key: string; p: number; lead: Runner }[] = [];
  const seen = new Set<string>();
  for (const r of [...runners].sort((a, b) => programCompare(a.program, b.program))) {
    if (!r.model || isOut(r) || seen.has(r.interest)) continue;
    seen.add(r.interest);
    out.push({ key: r.model.key, p: r.model.p_model, lead: r });
  }
  return out;
}

export function runnerByProgram(runners: Runner[], program: string): Runner | undefined {
  return runners.find((r) => r.program === program) ?? runners.find((r) => r.interest === program);
}

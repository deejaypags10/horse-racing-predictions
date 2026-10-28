import { describe, expect, it } from 'vitest';
import raceJson from './fixtures/race.json';
import type { RaceResponse } from '../api/types';
import { defaultTicketRunner, raceVerdict } from '../domain/verdict';
import { isInterestLead } from '../domain/race';

function race(): RaceResponse { return JSON.parse(JSON.stringify(raceJson)) as RaceResponse; }
const on = { valueFlags: true, coolOff: false };

function withValue(d: RaceResponse, program: string): RaceResponse {
  const r = d.runners.find((x) => x.program === program)!;
  r.model!.value = true;
  r.model!.exp_return = 0.2;
  r.model!.edge_pts = 4;
  return d;
}

describe('raceVerdict', () => {
  it('names the value runner with price, fair price and evidence', () => {
    const v = raceVerdict(withValue(race(), '7'), 'fractional', on);
    expect(v.kind).toBe('value');
    expect(v.text).toMatch(/^#7 Boss Justice: 3-1 vs fair 7-2 · evidence strong$/);
    expect(v.unvalidated).toBe(false);
  });

  it('tags a value line as unvalidated when the blend is not calibrated', () => {
    const d = withValue(race(), '7');
    d.prediction.blend_calibrated = false;
    expect(raceVerdict(d, 'fractional', on).unvalidated).toBe(true);
  });

  it('says no runner beats the tote when nothing is flagged', () => {
    const v = raceVerdict(race(), 'fractional', on);
    expect(v.kind).toBe('none');
    expect(v.text).toBe('No runner beats the tote at current prices.');
  });

  it('explains a morning-line-only market', () => {
    const d = race();
    d.prediction.market = 'morning_line';
    expect(raceVerdict(d, 'fractional', on).kind).toBe('ml');
  });

  it('marks thin coverage', () => {
    const d = race();
    d.prediction.coverage = 0.3;
    expect(raceVerdict(d, 'fractional', on).thin).toBe(true);
  });

  it('handles every runner what-if scratched', () => {
    const d = race();
    d.runners.forEach((r) => { r.whatif_scratched = true; });
    const v = raceVerdict(d, 'fractional', on);
    expect(v.kind).toBe('allout');
    expect(v.text).toBe('Every runner is scratched in this what-if.');
  });

  it('respects the value-flags and cool-off settings', () => {
    const d = withValue(race(), '7');
    expect(raceVerdict(d, 'fractional', { valueFlags: false, coolOff: false }).kind).toBe('flagsoff');
    expect(raceVerdict(d, 'fractional', { valueFlags: true, coolOff: true }).kind).toBe('hidden');
  });
});

describe('defaultTicketRunner', () => {
  it('prefers the value runner, else the highest chance', () => {
    expect(defaultTicketRunner(race())?.program).toBe('2');
    expect(defaultTicketRunner(withValue(race(), '7'))?.program).toBe('7');
  });
});

describe('isInterestLead', () => {
  it('passes the coupled chance to the next member when the lead is what-if scratched', () => {
    const d = race();
    const a = d.runners[0];
    const b = { ...JSON.parse(JSON.stringify(a)), program: '1A', name: 'Entry Mate' } as typeof a;
    d.runners.splice(1, 0, b);
    expect(isInterestLead(a, d.runners)).toBe(true);
    expect(isInterestLead(b, d.runners)).toBe(false);
    a.whatif_scratched = true;
    expect(isInterestLead(a, d.runners)).toBe(false);
    expect(isInterestLead(b, d.runners)).toBe(true);
  });
});

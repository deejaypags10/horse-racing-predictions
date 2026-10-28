import { describe, expect, it } from 'vitest';
import race from './fixtures/race.json';
import type { RaceResponse } from '../api/types';
import { boxProbability, exactaProb, orderModel, trifectaProb } from '../domain/exotics';
import { activeInterests } from '../domain/race';

const data = race as unknown as RaceResponse;

describe('client exotics match the backend', () => {
  const m = orderModel(activeInterests(data.runners).map((i) => ({ key: i.key, p: i.p })));
  it('reproduces the API exacta and trifecta chances', () => {
    for (const c of data.exotics.exacta) expect(exactaProb(m, c.combo[0], c.combo[1])).toBeCloseTo(c.p, 3);
    for (const c of data.exotics.trifecta) expect(trifectaProb(m, c.combo[0], c.combo[1], c.combo[2])).toBeCloseTo(c.p, 3);
  });
  it('sums every exacta permutation to 1', () => {
    expect(boxProbability(m, m.keys, 'exacta').p).toBeCloseTo(1, 6);
  });
  it('counts box combinations', () => {
    expect(boxProbability(m, ['2', '5', '7'], 'trifecta').combos).toBe(6);
  });
});

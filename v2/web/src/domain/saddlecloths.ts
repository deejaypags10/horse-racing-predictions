import type { Breed } from '../api/types';

// Saddle-cloth colours (DESIGN 2.3). Data, not CSS. [cloth, number]
const US: Record<number, [string, string]> = {
  1: ['#D7262E', '#FFFFFF'], 2: ['#FFFFFF', '#111111'], 3: ['#1F4FB4', '#FFFFFF'], 4: ['#F7D417', '#111111'],
  5: ['#13814A', '#FFFFFF'], 6: ['#111111', '#F7D417'], 7: ['#F57C1F', '#111111'], 8: ['#F6A6C4', '#111111'],
  9: ['#2EC4C6', '#111111'], 10: ['#6B2FA3', '#FFFFFF'], 11: ['#C4C4C4', '#A30F18'], 12: ['#9EDB3A', '#111111'],
  13: ['#6E4426', '#FFFFFF'], 14: ['#7A1630', '#F7D417'], 15: ['#C8B88A', '#111111'], 16: ['#A8D8F5', '#A30F18'],
  17: ['#1B2A5C', '#FFFFFF'], 18: ['#1F5A32', '#F7D417'], 19: ['#3A7BD5', '#111111'], 20: ['#C2187F', '#FFE14D'],
};

const HARNESS: Record<number, [string, string]> = {
  1: ['#D7262E', '#FFFFFF'], 2: ['#1F4FB4', '#FFFFFF'], 3: ['#FFFFFF', '#D7262E'], 4: ['#13814A', '#FFFFFF'],
  5: ['#111111', '#F7D417'], 6: ['#F7D417', '#111111'], 7: ['#F6A6C4', '#111111'], 8: ['#C4C4C4', '#A30F18'],
  9: ['#6B2FA3', '#F7D417'], 10: ['#2EC4C6', '#111111'], 11: ['#1B2A5C', '#FFFFFF'], 12: ['#A8D8F5', '#111111'],
};

export interface ClothColors {
  bg: string | null;   // null = neutral chip (uses theme tokens)
  fg: string | null;
}

export function baseNumber(program: string): number | null {
  const m = /^(\d+)/.exec(program);
  return m ? parseInt(m[1], 10) : null;
}

export function clothColors(program: string, breed: Breed | undefined): ClothColors {
  const n = baseNumber(program);
  if (n == null) return { bg: null, fg: null };
  const table = breed === 'harness' ? HARNESS : breed === 'thoroughbred' || breed === 'quarter_horse' ? US : null;
  const hit = table?.[n];
  if (!hit) return { bg: null, fg: null };
  return { bg: hit[0], fg: hit[1] };
}

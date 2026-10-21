import type { Breed } from '../api/types';

export type BreedKey = 'tb' | 'hn' | 'qh' | 'intl';
export const BREED_KEYS: BreedKey[] = ['tb', 'hn', 'qh', 'intl'];
export const BREED_LABEL: Record<BreedKey, string> = { tb: 'Thoroughbred', hn: 'Harness', qh: 'Quarter Horse', intl: 'International' };
export const BREED_CODE: Record<BreedKey, string> = { tb: 'TB', hn: 'HN', qh: 'QH', intl: 'INTL' };

export function breedKey(breed: Breed, country?: string): BreedKey {
  if (country && country.toUpperCase() !== 'USA' && country.toUpperCase() !== 'US' && country.toUpperCase() !== 'CAN') return 'intl';
  switch (breed) {
    case 'harness': return 'hn';
    case 'quarter_horse': return 'qh';
    case 'thoroughbred': return 'tb';
    default: return 'intl';
  }
}

export function breedName(breed: Breed): string {
  return { thoroughbred: 'Thoroughbred', harness: 'Harness', quarter_horse: 'Quarter Horse', other: 'Mixed' }[breed] ?? 'Racing';
}

export function parseBreedParam(v: string | null): BreedKey[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim().toLowerCase()).filter((s): s is BreedKey => (BREED_KEYS as string[]).includes(s));
}

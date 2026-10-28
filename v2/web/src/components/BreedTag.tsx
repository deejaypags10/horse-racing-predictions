import type { Breed } from '../api/types';
import { BREED_CODE, BREED_LABEL, breedKey } from '../domain/breed';

export function BreedTag({ breed, country }: { breed: Breed; country?: string }) {
  const k = breedKey(breed, country);
  return <abbr className="breed-tag" title={BREED_LABEL[k]}>{BREED_CODE[k]}</abbr>;
}

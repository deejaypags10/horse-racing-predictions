import type { Evidence } from '../api/types';

export const EVIDENCE_LEVEL: Record<Evidence, number> = { none: 0, thin: 1, some: 2, strong: 3 };
export const EVIDENCE_MAX = 3;
export const EVIDENCE_NAME: Record<Evidence, string> = { none: 'None', thin: 'Thin', some: 'Some', strong: 'Strong' };
export const EVIDENCE_COPY: Record<Evidence, string> = {
  none: 'No prior starts in our data. The model shows the market view for this runner.',
  thin: 'Little data: one or two prior starts. Treat the number as a rough guess.',
  some: 'Some recent form (3–5 prior starts), with gaps.',
  strong: 'Six or more prior starts in our data: a fuller picture of recent form.',
};

/** Value flags need at least this much evidence (backend enforces the same). */
export function evidenceSupportsFlag(e: Evidence): boolean {
  return EVIDENCE_LEVEL[e] >= 2;
}

export function evidenceTooltip(e: Evidence, starts?: number | null): string {
  const n = starts == null ? '' : ` ${starts === 0 ? 'No' : starts} prior start${starts === 1 ? '' : 's'} in our history.`;
  return `Evidence: ${EVIDENCE_NAME[e]}.${n} ${EVIDENCE_COPY[e]}`;
}

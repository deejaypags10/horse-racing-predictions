import type { Evidence, PriceSource } from '../api/types';
import { EVIDENCE_LEVEL } from './evidence';
import { fmtEdge } from './format';

// Thresholds in percentage points (model % − market %). Tunable by the model team.
export const EDGE_OVERLAY = 2.0;
export const EDGE_SLIGHT = 1.0;

export type EdgeClass = 'over' | 'slight-over' | 'close' | 'slight-under' | 'under';

export interface EdgeView {
  cls: EdgeClass;
  glyph: string;          // ▲ △ ≈ ▽ ▼ ('' for ML-only)
  text: string;           // "+7.3"
  tone: 'over' | 'under' | 'muted';
  flagged: boolean;       // row tint + left rule (a real, live overlay)
  lowConfidence: boolean;
  ml: boolean;            // computed against the morning line
  label: string;          // "overlay", "slight underlay", "close to market", …
  speech: string;         // "overlay, plus 7.3 points"
}

export interface EdgeInput {
  pts: number | null | undefined;
  /** Backend value flag: live market, edge ≥ 2 pts, return ≥ 10%, evidence ≥ some. */
  value?: boolean;
  evidence?: Evidence;
  priceSource?: PriceSource;
  stale?: boolean;
}

export function classifyEdge(pts: number): EdgeClass {
  if (pts >= EDGE_OVERLAY) return 'over';
  if (pts >= EDGE_SLIGHT) return 'slight-over';
  if (pts > -EDGE_SLIGHT) return 'close';
  if (pts > -EDGE_OVERLAY) return 'slight-under';
  return 'under';
}

const LABEL: Record<EdgeClass, string> = {
  over: 'overlay',
  'slight-over': 'slight overlay',
  close: 'close to market',
  'slight-under': 'slight underlay',
  under: 'underlay',
};
const SOLID: Record<EdgeClass, string> = { over: '▲', 'slight-over': '△', close: '≈', 'slight-under': '▽', under: '▼' };
const HOLLOW: Record<EdgeClass, string> = { over: '△', 'slight-over': '△', close: '≈', 'slight-under': '▽', under: '▽' };

export function edgeView(input: EdgeInput): EdgeView | null {
  const { pts } = input;
  if (pts == null || !Number.isFinite(pts)) return null;
  const cls = classifyEdge(pts);
  const ml = input.priceSource === 'morning_line';
  const thin = input.evidence != null && EVIDENCE_LEVEL[input.evidence] < 2;
  const lowConfidence = ml || !!input.stale || thin;
  const text = fmtEdge(pts);
  const signWord = pts > 0 ? 'plus' : pts < 0 ? 'minus' : '';
  const num = `${signWord} ${Math.abs(Number(pts.toFixed(1))).toFixed(1)} points`.trim();
  if (ml) {
    return {
      cls, glyph: '', text, tone: 'muted', flagged: false, lowConfidence: true, ml: true,
      label: `${LABEL[cls]} vs morning line`,
      speech: `${num} versus the morning line, not a market price`,
    };
  }
  const tone = lowConfidence || cls === 'close' ? 'muted' : pts > 0 ? 'over' : 'under';
  const flagged = !lowConfidence && cls === 'over' && input.value === true;
  // A ▲ is reserved for a flagged overlay; everything else that is positive is hollow.
  const glyph = lowConfidence ? HOLLOW[cls] : cls === 'over' && !flagged ? '△' : SOLID[cls];
  const label = `${LABEL[cls]}${lowConfidence && cls !== 'close' ? ', low confidence' : ''}`;
  return { cls, glyph, text, tone, flagged, lowConfidence, ml: false, label, speech: `${label}, ${num}` };
}

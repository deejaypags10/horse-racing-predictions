import type { RunnerModel } from '../api/types';
import { edgeView } from '../domain/edge';
import { useSettings } from '../state/settings';

interface Props {
  model: RunnerModel | null;
  stale?: boolean;
  withWord?: boolean;
  showUnderlays?: boolean;
  pts?: boolean;
}

export function EdgeValue({ model, stale, withWord, showUnderlays = true, pts }: Props) {
  const { settings } = useSettings();
  if (settings.coolOff) return <span className="edge edge-none"><span aria-hidden="true">—</span><span className="visually-hidden">edge hidden</span></span>;
  if (!model) return <span className="edge edge-none"><span aria-hidden="true">—</span><span className="visually-hidden">no edge</span></span>;
  const v = edgeView({ pts: model.edge_pts, value: model.value, evidence: model.evidence, priceSource: model.price_source, stale, expReturn: model.exp_return, flags: settings.valueFlags });
  if (!v) return <span className="edge edge-none"><span aria-hidden="true">—</span><span className="visually-hidden">no market price</span></span>;
  const hideTone = !showUnderlays && model.edge_pts != null && model.edge_pts < 0;
  const tone = hideTone ? 'muted' : v.tone;
  return (
    <span className={`edge edge-${tone}${v.flagged ? ' is-flagged' : ''}`} title={edgeTitle(model, v.ml)}>
      <span aria-hidden="true">
        {v.glyph && <span className="edge-glyph">{v.glyph}</span>}
        <span className="edge-num">{v.text}</span>
        {v.ml && <sup className="edge-ml">ML</sup>}
        {pts && <span className="edge-pts"> pts</span>}
        {withWord && <span className="edge-word"> {v.ml ? 'vs morning line' : v.label}</span>}
      </span>
      <span className="visually-hidden">{v.speech}</span>
    </span>
  );
}

function edgeTitle(m: RunnerModel, ml: boolean): string {
  if (m.p_market == null) return '';
  const mk = Math.round(m.p_market * 1000) / 10;
  const md = Math.round(m.p_model * 1000) / 10;
  return ml
    ? `The morning line implies about ${mk}%. Our model says ${md}%. The morning line is a guess, not a price.`
    : `The tote implies about ${mk}% (takeout removed). Our model says ${md}%. Edge is the difference in percentage points.`;
}

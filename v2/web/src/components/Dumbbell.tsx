import { useId } from 'react';
import type { Breed, Runner } from '../api/types';
import { EDGE_SLIGHT } from '../domain/edge';
import { fmtEdge } from '../domain/format';
import { Cloth } from './Cloth';

interface Row {
  program: string;
  name: string;
  model: number;
  market: number | null;
  edge: number | null;
  exp: number | null;
}

function rowsFrom(runners: Runner[]): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const r of runners) {
    if (!r.model || r.scratched || r.whatif_scratched || seen.has(r.interest)) continue;
    seen.add(r.interest);
    out.push({ program: r.program, name: r.name, model: r.model.p_model, market: r.model.p_market, edge: r.model.edge_pts, exp: r.model.exp_return });
  }
  return out;
}

export function HatchDefs({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="4" className="hatch-line" strokeWidth="1.5" />
      </pattern>
    </defs>
  );
}

export function DumbbellChart({ runners, breed, ml, highlight, onHighlight, width = 400, hideEdge = false }: {
  runners: Runner[];
  breed: Breed;
  ml: boolean;
  highlight: string | null;
  onHighlight: (program: string | null) => void;
  width?: number;
  hideEdge?: boolean;
}) {
  const hatch = useId().replace(/:/g, '');
  const rows = rowsFrom(runners);
  if (!rows.length) return null;
  const pitch = 28;
  const top = 6;
  const plotX0 = 34;
  const plotX1 = width - 44;
  const maxP = Math.max(...rows.flatMap((r) => [r.model, r.market ?? 0]));
  const scaleMax = Math.max(Math.ceil(maxP / 0.1) * 0.1, 0.3);
  const x = (p: number) => plotX0 + (p / scaleMax) * (plotX1 - plotX0);
  const h = top + rows.length * pitch + 26;
  const ticks = Array.from({ length: Math.round(scaleMax / 0.1) + 1 }, (_, i) => i * 0.1);

  const biggest = [...rows].filter((r) => r.edge != null).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0))[0];
  const label = `Model versus ${ml ? 'morning line' : 'market'} chances for ${rows.length} runners.${biggest && biggest.market != null ? ` Largest positive gap: number ${biggest.program} ${biggest.name}, model ${Math.round(biggest.model * 100)} percent, ${ml ? 'morning line' : 'market'} ${Math.round(biggest.market * 100)} percent.` : ''}`;

  return (
    <figure className="chart dumbbell">
      <svg viewBox={`0 0 ${width} ${h}`} width="100%" role="img" aria-label={label} preserveAspectRatio="xMinYMin meet">
        <HatchDefs id={hatch} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 4} y2={top + rows.length * pitch} className="grid" />
            <text x={x(t)} y={top + rows.length * pitch + 16} className="axis-label" textAnchor="middle">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cy = top + i * pitch + pitch / 2;
          const xm = x(r.model);
          const xk = r.market != null ? x(r.market) : null;
          const e = r.edge ?? 0;
          const showBar = !hideEdge && !ml && xk != null && Math.abs(e) >= EDGE_SLIGHT;
          const beats = e > 0 && (r.exp ?? 0) > 0;
          const lo = xk != null ? Math.min(xm, xk) : xm;
          const hi = xk != null ? Math.max(xm, xk) : xm;
          const end = Math.max(xm, xk ?? 0) + 9;
          const hl = highlight === r.program;
          return (
            <g key={r.program} className={`db-row${hl ? ' is-hl' : ''}`}
              onMouseEnter={() => onHighlight(r.program)} onMouseLeave={() => onHighlight(null)}>
              <rect x="0" y={cy - pitch / 2} width={width} height={pitch} className="db-band" />
              <foreignObject x="2" y={cy - 10} width="24" height="20">
                <Cloth program={r.program} breed={breed} size="xs" label={false} />
              </foreignObject>
              {showBar && (e > 0
                ? <rect x={lo} y={cy - 2} width={hi - lo} height={4} className={beats ? 'db-over' : 'db-short'} />
                : <rect x={lo} y={cy - 2} width={hi - lo} height={4} fill={`url(#${hatch})`} className="db-under" />)}
              {xk != null && <circle cx={xk} cy={cy} r={5} className={`db-market${ml ? ' is-ml' : ''}`} />}
              <circle cx={xm} cy={cy} r={5} className="db-model" />
              {showBar && r.edge != null && (
                <text x={Math.min(end, width - 2)} y={cy + 4} className={`db-end ${e > 0 ? (beats ? 'over' : 'short') : 'under'}`} textAnchor={end > width - 30 ? 'end' : 'start'}>{fmtEdge(r.edge)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" className="db-model" /></svg> Model</span>
        <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" className={`db-market${ml ? ' is-ml' : ''}`} /></svg> {ml ? 'Morning line (not a market price)' : 'Market (tote, takeout removed)'}</span>
        {!ml && !hideEdge && <span><svg width="16" height="8" aria-hidden="true"><rect y="2" width="16" height="4" className="db-over" /></svg> overlay (price beats fair)</span>}
        {!ml && !hideEdge && <span><svg width="16" height="8" aria-hidden="true"><rect y="2" width="16" height="4" className="db-short" /></svg> model higher, short of fair</span>}
        {!ml && !hideEdge && <span><svg width="16" height="8" aria-hidden="true"><HatchDefs id={`${hatch}l`} /><rect y="2" width="16" height="4" fill={`url(#${hatch}l)`} className="db-under" /></svg> underlay</span>}
      </figcaption>
    </figure>
  );
}

/** Phone variant: one 16px row, shared 0–50% scale with a faint 25% tick. HTML so marks stay round at any width. */
export function MiniDumbbell({ model, market, edge, ml, exp, hideEdge }: { model: number; market: number | null; edge: number | null; ml: boolean; exp?: number | null; hideEdge?: boolean }) {
  const pos = (p: number) => `${Math.min(1, p / 0.5) * 100}%`;
  const e = edge ?? 0;
  const showBar = !hideEdge && !ml && market != null && Math.abs(e) >= EDGE_SLIGHT;
  const lo = market != null ? Math.min(model, market) : model;
  const hi = market != null ? Math.max(model, market) : model;
  return (
    <span className="mini-db" aria-hidden="true">
      <span className="mini-db-axis" />
      <span className="mini-db-tick" style={{ left: '50%' }} />
      {showBar && <span className={`mini-db-bar ${e > 0 ? ((exp ?? 0) > 0 ? 'is-over' : 'is-short') : 'is-under'}`} style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />}
      {market != null && <span className={`mini-db-mk${ml ? ' is-ml' : ''}`} style={{ left: pos(market) }} />}
      <span className="mini-db-md" style={{ left: pos(model) }} />
    </span>
  );
}

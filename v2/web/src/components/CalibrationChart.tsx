import { useState } from 'react';
import type { CalibrationBin } from '../api/types';

function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const den = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

export function binDescription(b: CalibrationBin): string {
  return `Predicted ${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}% · we said ${pct(b.predicted)} on average · ${pct(b.observed)} actually won · ${b.n.toLocaleString('en-US')} runners`;
}

export function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const [focus, setFocus] = useState<number | null>(null);
  const S = 480;
  const m = { l: 56, r: 24, t: 16 };
  const plot = S - m.l - m.r; // square plot
  // DESIGN 5.3 says 0–60%, extended when a bin runs past it; we extend only to the next 10% so the busy low range keeps its resolution.
  const top = Math.max(...bins.map((b) => Math.max(b.observed, b.predicted)));
  const max = Math.max(0.6, Math.min(1, Math.ceil((top + 0.02) * 10) / 10));
  const x = (v: number) => m.l + (v / max) * plot;
  const y = (v: number) => m.t + (1 - v / max) * plot;
  const ticks = Array.from({ length: Math.round(max / 0.1) + 1 }, (_, i) => i / 10);
  const total = bins.reduce((a, b) => a + b.n, 0);
  const maxN = Math.max(...bins.map((b) => b.n));
  const rOf = (n: number) => 3 + 6 * Math.sqrt(n / maxN);
  const base = m.t + plot;
  const stripTop = base + 24;
  const H = base + 76;
  const worst = [...bins].sort((a, b) => Math.abs(b.predicted - b.observed) - Math.abs(a.predicted - a.observed))[0];

  return (
    <figure className="chart calib">
      <svg viewBox={`0 0 ${S} ${H}`} width="100%" role="img" className="calib-svg"
        aria-label={`Calibration of the form model over ${total.toLocaleString('en-US')} runners. Points close to the diagonal mean predicted chances matched reality. Largest gap: ${worst ? binDescription(worst) : ''}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={m.t} y2={m.t + plot} className="grid" />
            <line x1={m.l} x2={m.l + plot} y1={y(t)} y2={y(t)} className="grid" />
            <text x={x(t)} y={m.t + plot + 16} className="axis-label" textAnchor="middle">{Math.round(t * 100)}%</text>
            <text x={m.l - 8} y={y(t) + 4} className="axis-label" textAnchor="end">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <line x1={m.l} x2={m.l} y1={m.t} y2={m.t + plot} className="axis" />
        <line x1={m.l} x2={m.l + plot} y1={m.t + plot} y2={m.t + plot} className="axis" />
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} className="diag" />
        <text x={x(max * 0.62)} y={y(max * 0.62) - 8} className="diag-label" transform={`rotate(-45 ${x(max * 0.62)} ${y(max * 0.62) - 8})`} textAnchor="middle">Perfectly calibrated</text>
        <text x={m.l + plot / 2} y={base + 70} className="axis-title" textAnchor="middle">Predicted win chance</text>
        <text x={14} y={m.t + plot / 2} className="axis-title" textAnchor="middle" transform={`rotate(-90 14 ${m.t + plot / 2})`}>Actually won</text>
        {bins.map((b, i) => {
          const [lo, hi] = wilson(b.observed, b.n);
          const cx = x(b.predicted);
          return (
            <g key={i} tabIndex={0} className={`calib-pt${focus === i ? ' is-focus' : ''}`} role="img" aria-label={binDescription(b)}
              onFocus={() => setFocus(i)} onBlur={() => setFocus(null)} onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)}>
              <line x1={cx} x2={cx} y1={y(hi)} y2={y(lo)} className="whisker" />
              <line x1={cx - 3} x2={cx + 3} y1={y(hi)} y2={y(hi)} className="whisker" />
              <line x1={cx - 3} x2={cx + 3} y1={y(lo)} y2={y(lo)} className="whisker" />
              <circle cx={cx} cy={y(b.observed)} r={rOf(b.n)} className="calib-dot" />
              <circle cx={cx} cy={y(b.observed)} r={Math.max(12, rOf(b.n) + 4)} className="hit" />
            </g>
          );
        })}
        {bins.map((b, i) => {
          const h = Math.max(1, (b.n / maxN) * 22);
          const w = Math.max(4, ((b.hi - b.lo) / max) * plot - 2);
          return (
            <g key={`s${i}`} aria-hidden="true">
              <rect x={x(b.lo) + 1} y={stripTop + 24 - h} width={Math.min(w, x(Math.min(b.hi, max)) - x(b.lo) - 2)} height={h} className="count-bar" />
            </g>
          );
        })}
      </svg>
      <p className="calib-readout" aria-live="off">{focus != null ? binDescription(bins[focus]) : 'Hover or focus a point for its numbers. Bars underneath show how many runners fall in each band.'}</p>
      <figcaption className="fineprint">
        Points on the dashed line mean our chances match reality. Above the line: we were too pessimistic. Below: too optimistic. Whiskers show 95% uncertainty from sample size; dot area shows how many runners are in the band.
      </figcaption>
      <table className="visually-hidden">
        <caption>Calibration bins</caption>
        <thead><tr><th scope="col">Band</th><th scope="col">Predicted</th><th scope="col">Observed</th><th scope="col">Runners</th></tr></thead>
        <tbody>{bins.map((b) => <tr key={b.lo}><th scope="row">{Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%</th><td>{pct(b.predicted)}</td><td>{pct(b.observed)}</td><td>{b.n}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

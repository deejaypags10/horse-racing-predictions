export function ProbBar({ p, market, max = 0.5 }: { p: number; market?: number | null; max?: number }) {
  const w = 64;
  const x = Math.min(1, p / max) * w;
  const mx = market != null ? Math.min(1, market / max) * w : null;
  return (
    <svg className="probbar" width={w + 2} height={10} viewBox={`0 0 ${w + 2} 10`} aria-hidden="true">
      <rect x="0.5" y="2.5" width={w} height="5" className="probbar-track" />
      <rect x="1" y="3" width={Math.max(0, x - 0.5)} height="4" className="probbar-fill" />
      {mx != null && <rect x={Math.max(0, mx - 0.5)} y="0" width="2" height="10" className="probbar-tick" />}
    </svg>
  );
}

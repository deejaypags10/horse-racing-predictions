import { MINUS } from './odds';

/** Percentages: integer ≥ 10%, one decimal below 10%, "<1%" below 1%. */
export function fmtPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return '—';
  const pct = p * 100;
  if (pct > 0 && pct < 1) return '<1%';
  if (pct <= 0) return '0%';
  if (pct < 9.95) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/** Signed number with a true minus and fixed decimals. */
export function fmtSigned(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(digits)}`;
}

/** Edge in percentage points, e.g. "+7.3" / "−2.9". */
export function fmtEdge(pts: number | null | undefined): string {
  if (pts == null || !Number.isFinite(pts)) return '—';
  return fmtSigned(pts, 1);
}

export function fmtMoney(v: number | null | undefined, opts: { signed?: boolean; cents?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const cents = opts.cents ?? true;
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  const rounded = Number(Math.abs(v).toFixed(cents ? 2 : 0));
  if (v < 0 && rounded !== 0) return `${MINUS}$${abs}`;
  if (opts.signed && rounded !== 0) return `+$${abs}`;
  return `$${abs}`;
}

/** Purse: $36,000 / $2M / $200K on narrow views. */
export function fmtPurse(v: number | null | undefined, compact = false): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '';
  if (!compact) return fmtMoney(v, { cents: false });
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}

export function fmtRoi(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return '—';
  return `${fmtSigned(r * 100, 1)}%`;
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function fmtTime(iso: string | number | null | undefined, seconds = false): string {
  if (iso == null) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (seconds ? timeSecFmt : timeFmt).format(d);
}

export function tzAbbr(iso?: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(iso ? new Date(iso) : new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A card date ("2026-06-06") as a newspaper dateline: "Saturday, June 6". */
export function fmtDateline(ymd: string | null | undefined, opts: { short?: boolean; year?: boolean } = {}): string {
  if (!ymd) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const day = DAYS[d.getUTCDay()];
  const mon = MONTHS[d.getUTCMonth()];
  const dayName = opts.short ? day.slice(0, 3) : day;
  return `${dayName}, ${mon} ${d.getUTCDate()}${opts.year ? `, ${d.getUTCFullYear()}` : ''}`;
}

export function fmtShortDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return ymd;
  return `${MONTHS[+m[2] - 1].replace('.', '')} ${+m[3]} ’${m[1].slice(2)}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

const FRACTIONS: Record<string, string> = { '0.5': '1/2', '0.25': '1/4', '0.75': '3/4', '0.125': '1/8', '0.0625': '1/16', '0.375': '3/8', '0.625': '5/8', '0.875': '7/8', '0.1875': '3/16', '0.3125': '5/16' };

/** US racing notation: 6f, 5 1/2f, 1m, 1 1/16m, 1 1/4m. Yards stay as printed. */
export function fmtDistance(raw: string | null | undefined, furlongs: number | null | undefined): string {
  if (raw && /[yY]/.test(raw)) return raw.replace(/\s+/g, '').toLowerCase();
  if (furlongs == null || !Number.isFinite(furlongs) || furlongs <= 0) return raw ?? '';
  if (furlongs < 8) {
    const whole = Math.floor(furlongs);
    const frac = FRACTIONS[String(+(furlongs - whole).toFixed(4))];
    return frac ? `${whole} ${frac}f` : `${+furlongs.toFixed(1)}f`;
  }
  const miles = furlongs / 8;
  const whole = Math.floor(miles + 1e-9);
  const rem = +(miles - whole).toFixed(4);
  if (rem < 0.001) return `${whole}m`;
  const frac = FRACTIONS[String(rem)];
  return frac ? `${whole} ${frac}m` : `${+furlongs.toFixed(1)}f`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

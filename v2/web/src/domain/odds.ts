// Odds conversions. Every price is stored as a DECIMAL (total return per 1
// staked: 5-2 -> 3.5) and rendered client-side in the user's chosen format.

export type OddsFormat = 'fractional' | 'decimal' | 'american';
export const ODDS_FORMATS: OddsFormat[] = ['fractional', 'decimal', 'american'];
export const MINUS = '−';

/** Standard US tote increments (profit-to-1), then whole numbers above 5-1. */
const TOTE_LADDER: [number, string][] = [
  [1 / 9, '1-9'], [0.2, '1-5'], [0.4, '2-5'], [0.5, '1-2'], [0.6, '3-5'], [0.8, '4-5'],
  [1.0, '1-1'], [1.2, '6-5'], [1.4, '7-5'], [1.5, '3-2'], [1.6, '8-5'], [1.8, '9-5'],
  [2.0, '2-1'], [2.5, '5-2'], [3.0, '3-1'], [3.5, '7-2'], [4.0, '4-1'], [4.5, '9-2'], [5.0, '5-1'],
];

/** Nearest tote increment for a decimal price (used for fair odds). */
export function toteFraction(decimal: number): string {
  const profit = decimal - 1;
  if (!(profit > 0) || !Number.isFinite(profit)) return '—';
  if (profit < 5.5) {
    let best = TOTE_LADDER[0];
    for (const step of TOTE_LADDER) {
      if (Math.abs(step[0] - profit) < Math.abs(best[0] - profit)) best = step;
    }
    return best[1];
  }
  return `${Math.round(profit)}-1`;
}

/** An exact small fraction if one fits (12-5 stays 12-5), else the tote ladder. */
export function exactFraction(decimal: number): string {
  const profit = decimal - 1;
  if (!(profit > 0) || !Number.isFinite(profit)) return '—';
  if (profit >= 5.5) return `${Math.round(profit)}-1`;
  for (let den = 1; den <= 10; den++) {
    const num = Math.round(profit * den);
    if (num > 0 && Math.abs(num / den - profit) < 0.004) {
      const g = gcd(num, den);
      return `${num / g}-${den / g}`;
    }
  }
  return toteFraction(decimal);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function toAmerican(decimal: number): string {
  const profit = decimal - 1;
  if (!(profit > 0) || !Number.isFinite(profit)) return '—';
  if (profit >= 1) return `+${Math.round(profit * 100)}`;
  return `${MINUS}${Math.round(100 / profit)}`;
}

export function toDecimalString(decimal: number): string {
  if (!(decimal > 1) || !Number.isFinite(decimal)) return '—';
  return decimal.toFixed(2);
}

export interface FmtOddsOpts {
  /** The price as printed by the source ("9-2"); used verbatim in fractional mode. */
  raw?: string | null;
  /** 'tote' rounds to the standard ladder (fair odds); 'exact' keeps the price. */
  round?: 'tote' | 'exact';
}

export function fmtOdds(decimal: number | null | undefined, format: OddsFormat, opts: FmtOddsOpts = {}): string {
  if (decimal == null || !Number.isFinite(decimal) || decimal <= 1) {
    if (format === 'fractional' && opts.raw) return normaliseRaw(opts.raw);
    return '—';
  }
  switch (format) {
    case 'decimal':
      return toDecimalString(decimal);
    case 'american':
      return toAmerican(decimal);
    default:
      if (opts.raw) return normaliseRaw(opts.raw);
      return opts.round === 'tote' ? toteFraction(decimal) : exactFraction(decimal);
  }
}

function normaliseRaw(raw: string): string {
  return raw.trim().replace(/\s+/g, '').replace(/[/:]/g, '-');
}

/** Screen-reader text: "5-2" -> "5 to 2". */
export function oddsSpeech(text: string): string {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(text);
  if (m) return `${m[1]} to ${m[2]}`;
  if (text.startsWith(MINUS)) return `minus ${text.slice(1)}`;
  if (text === '—') return 'no price';
  return text;
}

export const MAX_DECIMAL = 1000; // 999-1

export type PriceParse = { decimal: number; error?: undefined } | { decimal?: undefined; error: string };

/**
 * Parse a price the user typed, by an explicit rule:
 *  - "a-b", "a/b" (or "a:b") is fractional (US "to"), "even" is 1-1;
 *  - a number with a decimal point is a decimal price, only when the user's format is decimal;
 *  - American only with an explicit sign and |n| >= 100 ("+250", "-150");
 *  - anything else is rejected with a message. Prices above 999-1 are rejected, never capped.
 */
export function parsePrice(input: string, format: OddsFormat): PriceParse {
  const s = input.trim().toLowerCase().replace(MINUS, '-').replace(/\s+/g, '');
  if (!s) return { error: 'Enter a price.' };
  let dec: number | null = null;
  if (s === 'even' || s === 'evens' || s === 'evn') dec = 2;
  const frac = /^(\d+(?:\.\d+)?)[-/:](\d+(?:\.\d+)?)$/.exec(s);
  const am = /^([+-])(\d+(?:\.\d+)?)$/.exec(s);
  if (dec == null && frac) {
    const n = parseFloat(frac[1]);
    const d = parseFloat(frac[2]);
    if (!(n > 0) || !(d > 0)) return { error: 'Both sides of a fractional price must be above zero, like 5-2.' };
    dec = n / d + 1;
  } else if (dec == null && am) {
    const v = parseFloat(am[2]);
    if (!(v >= 100)) return { error: 'American odds need a sign and at least 100, like +250 or −150.' };
    dec = am[1] === '+' ? v / 100 + 1 : 100 / v + 1;
  } else if (dec == null && /^(\d+\.\d*|\.\d+)$/.test(s) && format === 'decimal') {
    const v = parseFloat(s);
    if (!(v > 1)) return { error: 'Decimal odds must be above 1.00.' };
    dec = v;
  }
  if (dec == null || !Number.isFinite(dec)) {
    const eg = format === 'decimal' ? '5-2, 9/5 or 3.50' : format === 'american' ? '5-2, 9/5 or +250' : '5-2, 9/5 or 12-1';
    return { error: `Enter the price like ${eg}.` };
  }
  if (dec > MAX_DECIMAL + 1e-9) return { error: 'Prices above 999-1 aren\u2019t accepted.' };
  return { decimal: round4(dec) };
}

/** Convenience: the parsed decimal, or null when the input is rejected. */
export function parseOddsInput(input: string, format: OddsFormat): number | null {
  return parsePrice(input, format).decimal ?? null;
}

/** Paper stake: a plain number of dollars (a leading "$" and thousands commas allowed), 0.01 to 100,000. */
export function parseStake(input: string): { value: number; error?: undefined } | { value?: undefined; error: string } {
  const v = Number(input.trim().replace(/^\$/, '').replace(/,/g, ''));
  if (!input.trim() || !Number.isFinite(v)) return { error: 'Stake must be a number of dollars, like 10 or 2.50.' };
  if (v < 0.01) return { error: 'Stake must be at least $0.01.' };
  if (v > 100_000) return { error: 'Stake can be at most $100,000.' };
  return { value: Math.round(v * 100) / 100 };
}

/** Wire format the backend accepts ("5-2", "2.4-1"). */
export function decimalToWire(decimal: number): string {
  const f = exactFraction(decimal);
  const profit = decimal - 1;
  const [n, d] = f.split('-').map(Number);
  if (n && d && Math.abs(n / d - profit) < 0.004) return f;
  return `${Math.round(profit * 100) / 100}-1`;
}

/** Market chance implied by a decimal price (no takeout adjustment). */
export function impliedProb(decimal: number | null | undefined): number | null {
  if (decimal == null || !(decimal > 1)) return null;
  return 1 / decimal;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function nextOddsFormat(f: OddsFormat): OddsFormat {
  return ODDS_FORMATS[(ODDS_FORMATS.indexOf(f) + 1) % ODDS_FORMATS.length];
}

export const ODDS_FORMAT_LABEL: Record<OddsFormat, string> = {
  fractional: '5-2',
  decimal: '3.50',
  american: '+250',
};

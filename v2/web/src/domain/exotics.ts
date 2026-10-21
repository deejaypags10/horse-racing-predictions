// Finishing-order probabilities from the win vector, mirroring the backend
// (edge/model/orders.py): discounted Harville with λ2 = 0.81, λ3 = 0.65.
// Used for the pick/box builder so any combination gets a chance that is
// coherent with the top-combo list the API returns.

export const LAMBDA_SECOND = 0.81;
export const LAMBDA_THIRD = 0.65;

export interface OrderModel {
  keys: string[];
  p: number[];
  q2: number[];
  q3: number[];
}

function discounted(p: number[], lam: number): number[] {
  const q = p.map((x) => Math.pow(Math.max(x, 1e-12), lam));
  const s = q.reduce((a, b) => a + b, 0);
  return q.map((x) => x / s);
}

export function orderModel(entries: { key: string; p: number }[]): OrderModel {
  const tot = entries.reduce((a, e) => a + e.p, 0) || 1;
  const p = entries.map((e) => e.p / tot);
  return { keys: entries.map((e) => e.key), p, q2: discounted(p, LAMBDA_SECOND), q3: discounted(p, LAMBDA_THIRD) };
}

export function exactaProb(m: OrderModel, a: string, b: string): number {
  const i = m.keys.indexOf(a);
  const j = m.keys.indexOf(b);
  if (i < 0 || j < 0 || i === j) return 0;
  return (m.p[i] * m.q2[j]) / (1 - m.q2[i]);
}

export function trifectaProb(m: OrderModel, a: string, b: string, c: string): number {
  const i = m.keys.indexOf(a);
  const j = m.keys.indexOf(b);
  const k = m.keys.indexOf(c);
  if (i < 0 || j < 0 || k < 0 || i === j || j === k || i === k) return 0;
  const rem = 1 - m.q3[i] - m.q3[j];
  if (rem <= 0) return 0;
  return (exactaProb(m, a, b) / rem) * m.q3[k];
}

function permutations<T>(items: T[], n: number): T[][] {
  if (n === 0) return [[]];
  const out: T[][] = [];
  items.forEach((it, idx) => {
    const rest = items.filter((_, i) => i !== idx);
    for (const p of permutations(rest, n - 1)) out.push([it, ...p]);
  });
  return out;
}

export interface BoxResult {
  combos: number;
  p: number;
}

/** Chance that a box of `keys` hits, and how many combinations it costs. */
export function boxProbability(m: OrderModel, keys: string[], kind: 'exacta' | 'trifecta'): BoxResult {
  const n = kind === 'exacta' ? 2 : 3;
  if (keys.length < n) return { combos: 0, p: 0 };
  const perms = permutations(keys, n);
  const p = perms.reduce((acc, c) => acc + (kind === 'exacta' ? exactaProb(m, c[0], c[1]) : trifectaProb(m, c[0], c[1], c[2])), 0);
  return { combos: perms.length, p };
}

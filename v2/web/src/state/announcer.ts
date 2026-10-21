// One app-level polite live region, fed only on threshold events,
// de-duplicated and rate-limited to one message per 10 s (DESIGN 8.2).
const recent = new Map<string, number>();
let lastAt = 0;
let queue: string[] = [];
let timer: number | undefined;

function el(): HTMLElement | null {
  return typeof document !== 'undefined' ? document.getElementById('announcer') : null;
}

function flush() {
  timer = undefined;
  const msg = queue.shift();
  if (!msg) return;
  const node = el();
  if (node) {
    node.textContent = '';
    window.setTimeout(() => { node.textContent = msg; }, 50);
  }
  lastAt = Date.now();
  if (queue.length) timer = window.setTimeout(flush, 10_000);
}

export function announce(message: string, dedupeKey = message): void {
  const now = Date.now();
  const seen = recent.get(dedupeKey);
  if (seen && now - seen < 15 * 60_000) return;
  recent.set(dedupeKey, now);
  queue = [...queue.filter((q) => q !== message), message].slice(-3);
  if (timer) return;
  const wait = Math.max(0, 10_000 - (now - lastAt));
  timer = window.setTimeout(flush, wait);
}

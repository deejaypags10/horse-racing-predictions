// Server-clock alignment. The backend reports `now` in the SOURCE clock (in
// replay mode it is shifted onto the recorded day). Countdowns are always
// computed from the latest server `now` plus client time elapsed since.

let offsetMs = 0;
let synced = false;

export function syncClock(serverNowIso: string | null | undefined, clientNowMs: number = Date.now()): void {
  if (!serverNowIso) return;
  const t = Date.parse(serverNowIso);
  if (Number.isNaN(t)) return;
  offsetMs = t - clientNowMs;
  synced = true;
}

export function serverNow(clientNowMs: number = Date.now()): number {
  return clientNowMs + offsetMs;
}

export function isClockSynced(): boolean {
  return synced;
}

/** Test helper. */
export function resetClock(): void {
  offsetMs = 0;
  synced = false;
}

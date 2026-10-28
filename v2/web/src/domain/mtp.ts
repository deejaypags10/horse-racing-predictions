import type { RaceStatus } from '../api/types';

export type MtpKind = 'mtp' | 'soon' | 'atpost' | 'off' | 'official' | 'cancelled' | 'far' | 'none';
export type MtpTone = 'calm' | 'near' | 'live' | 'done';

export interface MtpState {
  kind: MtpKind;
  minutes: number | null;   // whole minutes to post (floor), when known
  secondsLeft: number | null;
  tone: MtpTone;
}

/** Above this many minutes the MTP column shows "—" and only the post time. */
export const FAR_MINUTES = 60;
/** Within this window after post an open race reads "AT POST". */
export const AT_POST_GRACE_S = 120;

export function mtpState(postIso: string | null | undefined, status: RaceStatus | undefined, nowMs: number): MtpState {
  if (status === 'official') return { kind: 'official', minutes: null, secondsLeft: null, tone: 'done' };
  if (status === 'cancelled') return { kind: 'cancelled', minutes: null, secondsLeft: null, tone: 'done' };
  if (status === 'closed') return { kind: 'off', minutes: null, secondsLeft: null, tone: 'done' };
  if (!postIso) return { kind: 'none', minutes: null, secondsLeft: null, tone: 'calm' };
  const post = Date.parse(postIso);
  if (Number.isNaN(post)) return { kind: 'none', minutes: null, secondsLeft: null, tone: 'calm' };
  const secs = Math.floor((post - nowMs) / 1000);
  if (secs <= 0) {
    if (secs > -AT_POST_GRACE_S) return { kind: 'atpost', minutes: 0, secondsLeft: 0, tone: 'live' };
    return { kind: 'off', minutes: null, secondsLeft: null, tone: 'done' };
  }
  const minutes = Math.floor(secs / 60);
  const tone: MtpTone = minutes < 5 ? 'live' : minutes <= 10 ? 'near' : 'calm';
  if (secs < 60) return { kind: 'soon', minutes: 0, secondsLeft: secs, tone: 'live' };
  if (minutes > FAR_MINUTES) return { kind: 'far', minutes, secondsLeft: secs, tone: 'calm' };
  return { kind: 'mtp', minutes, secondsLeft: secs, tone };
}

/** Compact MTP text for tables and strips. */
export function fmtMtp(s: MtpState): string {
  switch (s.kind) {
    case 'mtp': return String(s.minutes);
    case 'soon': return '<1';
    case 'atpost': return 'AT POST';
    case 'off': return 'OFF';
    case 'official': return 'OFFICIAL';
    case 'cancelled': return 'CANCELLED';
    case 'far':
    case 'none':
    default: return '—';
  }
}

/** Race-header numeral: shows m:ss only under 2 minutes, otherwise minutes. */
export function fmtMtpHero(s: MtpState): string {
  if ((s.kind === 'mtp' || s.kind === 'soon') && s.secondsLeft != null && s.secondsLeft < 120) {
    const m = Math.floor(s.secondsLeft / 60);
    const sec = s.secondsLeft % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }
  if (s.kind === 'far') return String(s.minutes);
  return fmtMtp(s);
}

export function mtpSpeech(s: MtpState): string {
  switch (s.kind) {
    case 'mtp':
    case 'far': return `${s.minutes} minutes to post`;
    case 'soon': return 'under a minute to post';
    case 'atpost': return 'at post';
    case 'off': return 'off, betting closed';
    case 'official': return 'official';
    case 'cancelled': return 'cancelled';
    default: return 'post time unknown';
  }
}

export function needsSecondTicks(s: MtpState): boolean {
  return (s.kind === 'mtp' || s.kind === 'soon') && s.secondsLeft != null && s.secondsLeft < 125;
}

import type { RaceStatus } from '../api/types';
import { fmtMtp, fmtMtpHero, mtpSpeech, mtpState, needsSecondTicks, type MtpState } from '../domain/mtp';
import { fmtTime } from '../domain/format';
import { useNow, useTicker } from '../state/clock';

export function useMtp(post: string | null | undefined, status: RaceStatus | undefined): MtpState {
  const now = useNow();
  return mtpState(post, status, now);
}

/** Compact MTP cell: "4", "<1", "AT POST", "—". */
export function MtpCell({ post, status, showPostWhenFar = false }: { post: string | null | undefined; status?: RaceStatus; showPostWhenFar?: boolean }) {
  const s = useMtp(post, status);
  const text = s.kind === 'far' && showPostWhenFar ? fmtTime(post) : fmtMtp(s);
  return (
    <span role="timer" aria-live="off" className={`mtp mtp-${s.tone} mtp-k-${s.kind}`} aria-label={mtpSpeech(s)}>
      {s.tone === 'live' && <span className="lamp-dot" aria-hidden="true" />}
      <span aria-hidden="true">{text}</span>
    </span>
  );
}

/** Race-header hero numeral. Ticks per second only under 2 minutes. */
export function MtpHero({ post, status }: { post: string | null; status: RaceStatus }) {
  const coarse = useMtp(post, status);
  const fine = useTicker(true, needsSecondTicks(coarse));
  const s = needsSecondTicks(coarse) ? mtpState(post, status, fine) : coarse;
  if (s.kind === 'far') {
    return (
      <div className="mtp-hero mtp-calm mtp-k-far">
        <span className="mtp-hero-label">Post</span>
        <span role="timer" aria-live="off" className="mtp-hero-num" aria-label={mtpSpeech(s)}>
          <span aria-hidden="true">{fmtTime(post)}</span>
        </span>
      </div>
    );
  }
  const word = s.kind === 'mtp' || s.kind === 'soon';
  return (
    <div className={`mtp-hero mtp-${s.tone} mtp-k-${s.kind}`}>
      <span role="timer" aria-live="off" aria-label={mtpSpeech(s)} className="mtp-hero-num">
        {s.tone === 'live' && <span className="lamp-dot lamp-lg" aria-hidden="true" />}
        <span aria-hidden="true">{fmtMtpHero(s)}</span>
      </span>
      {word && <span className="mtp-hero-label" aria-hidden="true">MTP</span>}
    </div>
  );
}

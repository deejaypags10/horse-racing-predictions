import type { SourceStatus } from '../api/types';
import { fmtDateline, fmtTime } from '../domain/format';
import { useNow } from '../state/clock';
import { isClockSynced } from '../domain/clock';

export function ReplayRibbon({ status }: { status: SourceStatus }) {
  const now = useNow();
  if (status.source !== 'archive') return null;
  return (
    <div className="ribbon" role="note" aria-label="Replay mode">
      <div className="ribbon-inner">
        <strong className="ribbon-tag">Replay</strong>
        <span className="ribbon-sep" aria-hidden="true">·</span>
        <span>{fmtDateline(status.replay_date, { year: true })}</span>
        {isClockSynced() && <span className="ribbon-sep" aria-hidden="true">·</span>}
        {isClockSynced() && <span className="num"><time dateTime={new Date(now).toISOString()}>{fmtTime(now)}</time> replay clock</span>}
        <span className="ribbon-note">Recorded card. Betting links are off and nothing here is live.</span>
      </div>
    </div>
  );
}

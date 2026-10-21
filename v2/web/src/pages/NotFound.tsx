import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { TrackResponse } from '../api/types';
import { useApi } from '../api/useApi';
import { fmtDateline, fmtTime } from '../domain/format';

export function NotFoundPage({ what, trackId }: { what?: string; trackId?: string }) {
  const st = useApi<TrackResponse>(trackId ? `track:${trackId}` : null, (s) => api.track(trackId!, s));
  const t = st.data;
  useEffect(() => { document.title = 'Not found · Equine Edge'; }, []);
  return (
    <div className="page notfound">
      <h1 className="page-title">{what ? `We can't find ${what}.` : "We can't find that page."}</h1>
      {t ? (
        <>
          <p className="lede">{t.track.name} ran {t.races.length} races on {fmtDateline(t.track.date)}.</p>
          <ul className="nf-races">
            {t.races.map((r) => (
              <li key={r.id}><Link to={`/r/${r.id}`}><span className="num">R{r.number}</span> <span className="muted num">{fmtTime(r.post_time)}</span></Link></li>
            ))}
          </ul>
          <p><Link to={`/t/${t.track.id}`} className="btn btn-secondary">Open the {t.track.name} card</Link></p>
        </>
      ) : (
        <p className="lede">It may be from another day, or the address has a typo. Today's racing is one tap away.</p>
      )}
      <p><Link to="/" className="btn-link">Go to Today ›</Link></p>
    </div>
  );
}

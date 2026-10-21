import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { BoardTrack } from '../api/types';
import { BreedTag } from '../components/BreedTag';
import { IconStar } from '../components/Icons';
import { MtpCell } from '../components/Mtp';
import { NextUpStrip } from '../components/NextUpStrip';
import { EmptyState, InlineError, SkeletonRows } from '../components/States';
import { BREED_CODE, BREED_KEYS, BREED_LABEL, breedKey, parseBreedParam, type BreedKey } from '../domain/breed';
import { fmtTime, plural } from '../domain/format';
import { mtpState } from '../domain/mtp';
import { useBoard } from '../state/board';
import { useNow } from '../state/clock';
import { moveFocus, useShortcuts } from '../state/keys';
import { useSettings } from '../state/settings';
import { readJSON, writeJSON } from '../state/storage';

const LATER_MIN = 180;

export function BoardPage() {
  const board = useBoard();
  const { settings, togglePin } = useSettings();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const now = useNow();

  const urlBreeds = params.get('breed');
  const breeds: BreedKey[] = useMemo(() => {
    if (urlBreeds !== null) return parseBreedParam(urlBreeds);
    return parseBreedParam(readJSON<string>('ee.breedFilter', ''));
  }, [urlBreeds]);

  useEffect(() => {
    writeJSON('ee.breedFilter', breeds.join(','));
  }, [breeds]);

  useEffect(() => {
    document.title = 'Today · Equine Edge';
  }, []);

  const setBreeds = (next: BreedKey[]) => {
    const p = new URLSearchParams(params);
    if (next.length) p.set('breed', next.join(','));
    else p.delete('breed');
    setParams(p, { replace: true });
    if (!next.length) writeJSON('ee.breedFilter', '');
  };

  const toggleBreed = (b: BreedKey) => {
    setBreeds(breeds.includes(b) ? breeds.filter((x) => x !== b) : [...breeds, b]);
  };

  useShortcuts((e) => {
    if (e.key === '/') { searchRef.current?.focus(); return true; }
    if (e.key === 'j') return moveFocus(listRef.current, '.track-link', 1);
    if (e.key === 'k') return moveFocus(listRef.current, '.track-link', -1);
    return false;
  });

  const data = board.data;
  const tracks = data?.tracks ?? [];
  const counts = useMemo(() => {
    const c: Record<BreedKey, number> = { tb: 0, hn: 0, qh: 0, intl: 0 };
    tracks.forEach((t) => { c[breedKey(t.breed, t.country)] += 1; });
    return c;
  }, [tracks]);

  const filtered = tracks.filter((t) => {
    if (breeds.length && !breeds.includes(breedKey(t.breed, t.country))) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      return t.name.toLowerCase().includes(s) || t.code.toLowerCase().includes(s);
    }
    return true;
  });

  const nextMtp = (t: BoardTrack) => {
    if (!t.next_race?.post_time) return null;
    return Math.floor((Date.parse(t.next_race.post_time) - now) / 60000);
  };
  const byPost = (a: BoardTrack, b: BoardTrack) => (Date.parse(a.next_race?.post_time ?? '') || 9e15) - (Date.parse(b.next_race?.post_time ?? '') || 9e15) || a.name.localeCompare(b.name);
  const sorted = [...filtered].sort(byPost);
  const pinned = sorted.filter((t) => settings.pinned.includes(t.code) && t.next_race);
  const rest = sorted.filter((t) => !pinned.includes(t));
  const finished = rest.filter((t) => !t.next_race);
  const later = rest.filter((t) => t.next_race && (nextMtp(t) ?? 0) > LATER_MIN);
  const active = rest.filter((t) => t.next_race && (nextMtp(t) ?? 0) <= LATER_MIN);
  const nextUp = (data?.next_up ?? []).filter((n) => !breeds.length || breeds.includes(breedKey(n.breed)));

  return (
    <>
      <NextUpStrip items={data ? nextUp : null} loading={board.loading} />
      <div className="page board">
        <div className="page-head board-head">
          <h1 className="page-title">Today's racing</h1>
          <label className="search">
            <span className="visually-hidden">Filter tracks</span>
            <input ref={searchRef} type="search" placeholder="Filter tracks" value={q} onChange={(e) => setQ(e.target.value)} data-search />
            <kbd aria-hidden="true">/</kbd>
          </label>
        </div>

        <div className="chips" role="group" aria-label="Breed">
          <button type="button" className="chip" aria-pressed={breeds.length === 0} onClick={() => setBreeds([])}>
            All <span className="chip-count">{tracks.length}</span>
          </button>
          {BREED_KEYS.map((b) => (
            <button key={b} type="button" className="chip" aria-pressed={breeds.includes(b)} onClick={() => toggleBreed(b)} disabled={counts[b] === 0 && !breeds.includes(b)}>
              <span className="chip-long">{BREED_LABEL[b]}</span><span className="chip-short" aria-hidden="true">{BREED_CODE[b]}</span> <span className="chip-count">{counts[b]}</span>
            </button>
          ))}
        </div>

        {board.error && !data && (
          <InlineError title="Couldn't load today's tracks." onRetry={board.refresh} error={board.error}>
            {board.error.isOutage ? 'The Equine Edge server is not responding. It may still be starting up.' : board.error.message}
          </InlineError>
        )}
        {board.error && data && (
          <p className="stale-note" role="status">Couldn't refresh. Showing tracks as of {fmtTime(board.updatedAt)}.</p>
        )}

        {board.loading && <SkeletonRows rows={8} label="Loading tracks" />}

        {data && tracks.length === 0 && (
          <EmptyState title="No TwinSpires tracks are racing today.">The board fills in as soon as entries are published.</EmptyState>
        )}
        {data && tracks.length > 0 && filtered.length === 0 && (
          <EmptyState
            title={q ? `No tracks match “${q}”.` : `No ${breeds.map((b) => BREED_LABEL[b].toLowerCase()).join(' or ')} tracks race today.`}
            action={<button type="button" className="btn btn-secondary" onClick={() => { setQ(''); setBreeds([]); }}>Show all tracks</button>}
          />
        )}

        {data && filtered.length > 0 && (
          <div ref={listRef} className="board-list">
            {pinned.length > 0 && <TrackGroup title="Pinned" tracks={pinned} pinned onPin={togglePin} isPinned={() => true} />}
            {active.length > 0 && <TrackGroup title="All tracks · by next post" tracks={active} onPin={togglePin} isPinned={(c) => settings.pinned.includes(c)} header />}
            {later.length > 0 && <TrackGroup title="Later today" tracks={later} onPin={togglePin} isPinned={(c) => settings.pinned.includes(c)} />}
            {finished.length > 0 && (
              <details className="finished">
                <summary>Finished today ({finished.length})</summary>
                <TrackGroup title="Finished" hideTitle tracks={finished} onPin={togglePin} isPinned={(c) => settings.pinned.includes(c)} />
              </details>
            )}
            <p className="table-note">
              {plural(filtered.length, 'track')} · post times in your time zone · {data.status.source === 'archive' ? 'recorded card' : `as of ${fmtTime(board.updatedAt)}`}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function TrackGroup({ title, tracks, onPin, isPinned, header, hideTitle, pinned }: {
  title: string;
  tracks: BoardTrack[];
  onPin: (code: string) => void;
  isPinned: (code: string) => boolean;
  header?: boolean;
  hideTitle?: boolean;
  pinned?: boolean;
}) {
  return (
    <section className={`track-group${pinned ? ' is-pinned' : ''}`} aria-label={title}>
      {!hideTitle && <h2 className="group-title"><span>{title}</span></h2>}
      {header && (
        <div className="track-row track-row-head" aria-hidden="true">
          <span />
          <span>Track</span>
          <span>Breed</span>
          <span className="num-col">Race</span>
          <span className="num-col">Next post</span>
          <span className="num-col">MTP</span>
          <span>Surface</span>
          <span>Signal</span>
          <span />
        </div>
      )}
      <ul className="track-list">
        {tracks.map((t) => <TrackRow key={t.id} t={t} pinned={isPinned(t.code)} onPin={() => onPin(t.code)} />)}
      </ul>
    </section>
  );
}

function TrackRow({ t, pinned, onPin }: { t: BoardTrack; pinned: boolean; onPin: () => void }) {
  const now = useNow();
  const nr = t.next_race;
  const s = nr ? mtpState(nr.post_time, 'open', now) : null;
  const done = !nr;
  const overlays = t.overlays_next_hour ?? 0;
  const signal = t.error ? <span className="signal-muted">Card unavailable</span>
    : done ? <span className="signal-muted">{t.official ? `${t.official} of ${t.race_count} official` : 'Finished'}</span>
    : overlays > 0 ? <span className="signal-over">▲ {plural(overlays, 'overlay')}</span>
    : s?.kind === 'far' && (s.minutes ?? 0) > LATER_MIN ? <span className="signal-muted">Opens {fmtTime(t.first_post)}</span>
    : <span className="signal-muted" aria-label="no overlays">—</span>;
  return (
    <li className={`track-row${done ? ' is-done' : ''}`}>
      <button type="button" className="pin" aria-pressed={pinned} aria-label={`Pin ${t.name}`} title={pinned ? `Unpin ${t.name}` : `Pin ${t.name}`} onClick={onPin}>
        <IconStar filled={pinned} />
      </button>
      <Link to={`/t/${t.id}`} className="track-link">
        <span className="track-name">{t.name}</span>
      </Link>
      <span className="track-breed"><BreedTag breed={t.breed} country={t.country} /></span>
      <span className="num-col track-race">{nr ? <>R{nr.number}<span className="of"> of {t.race_count}</span></> : '—'}</span>
      <span className="num-col track-post">{nr ? <time dateTime={nr.post_time ?? undefined}>{fmtTime(nr.post_time)}</time> : 'Finished'}</span>
      <span className="num-col track-mtp">{nr ? <MtpCell post={nr.post_time} status="open" /> : '—'}</span>
      <span className="track-surface">{(t.surfaces ?? []).join(' / ') || '—'}</span>
      <span className="track-signal">{signal}</span>
      <span className="track-chev" aria-hidden="true">›</span>
    </li>
  );
}

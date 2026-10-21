"""Replay a recorded day from the TVG entry captures already in the repo.

These are real cards (57 US tracks, thoroughbred / harness / quarter horse)
captured by the legacy pipeline. The archive source powers demo mode, tests
and development when TwinSpires is unreachable. The clock is shifted so the
replayed day "runs" in real time: on start-up the replay clock sits a few
minutes before the first post of the day and advances normally.
"""
from __future__ import annotations

import json
import re
import logging
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from ..domain import Breed, Race, RaceStatus, Runner, Track, make_race_id, make_track_id
from ..features import distance_furlongs
from ..odds import parse_odds
from .base import SourceError, utcnow

log = logging.getLogger(__name__)

_TRACK_NAMES_FALLBACK = {"CD": "Churchill Downs"}
_WAGER_POOL = re.compile(r"\bP[3-6]\b|Fri-Sat|Sat-Sun|\bDD\b|Stakes Day|Sunset Six")


class ArchiveSource:
    name = "archive"

    def __init__(self, root: Path, replay_date: date | None = None, start_offset_min: float = 25.0):
        self.root = root
        if not root.exists():
            raise SourceError(f"archive directory not found: {root}")
        days = self.available_days()
        if not days:
            raise SourceError(f"no recorded cards in {root}")
        self.replay_date = replay_date if replay_date in days else max(days, key=lambda d: (self._count(d), d))
        self._offset = timedelta(0)
        first_post = self._first_post(self.replay_date)
        # Map real "now" onto the replayed day so countdowns behave.
        anchor = (first_post or datetime.combine(self.replay_date, datetime.min.time(), timezone.utc).replace(hour=16))
        self._offset = (anchor - timedelta(minutes=start_offset_min)) - utcnow()

    # -- clock ---------------------------------------------------------------
    def today(self) -> date:
        return self.replay_date

    def now(self) -> datetime:
        return utcnow() + self._offset

    # -- discovery -----------------------------------------------------------
    def available_days(self) -> list[date]:
        out = set()
        for p in self.root.glob("*/*.json"):
            try:
                out.add(date.fromisoformat(p.stem))
            except ValueError:
                continue
        return sorted(out)

    def _count(self, d: date) -> int:
        return len(list(self.root.glob(f"*/{d.isoformat()}.json")))

    def _first_post(self, d: date) -> datetime | None:
        posts = [r.post_time for t in self.tracks(d) for r in self.card(t) if r.post_time]
        return min(posts) if posts else None

    def tracks(self, day: date) -> list[Track]:
        out = []
        for p in sorted(self.root.glob(f"*/{day.isoformat()}.json")):
            data = _load(p)
            races = data.get("races") or []
            if not races:
                continue
            code = str(data.get("code") or p.parent.name).upper()
            if _WAGER_POOL.search(str(data.get("name") or "")):
                continue  # TVG lists multi-race wager pools (e.g. "BEL P5") as pseudo-tracks
            breed = Breed.parse(((races[0].get("type") or {}).get("name")))
            out.append(Track(
                id=make_track_id(code, day), code=code,
                name=data.get("name") or _TRACK_NAMES_FALLBACK.get(code, code),
                breed=breed, country=((data.get("location") or {}).get("country") or "USA"),
                card_date=day, race_count=len(races), source=self.name,
                provider_ref={"file": str(p.relative_to(self.root))},
            ))
        return out

    def card(self, track: Track) -> list[Race]:
        p = self.root / track.provider_ref.get("file", f"{track.code}/{track.card_date.isoformat()}.json")
        data = _load(p)
        now = self.now()
        races = []
        for r in data.get("races") or []:
            try:
                races.append(self._race(track, r, now))
            except (KeyError, ValueError, TypeError) as exc:
                log.warning("archive: skipping race in %s: %s", p, exc)
        races.sort(key=lambda r: r.number)
        return races

    def _race(self, track: Track, r: dict, now: datetime) -> Race:
        number = int(r["number"])
        post = _parse_dt(r.get("postTime"))
        breed = Breed.parse((r.get("type") or {}).get("name")) if r.get("type") else track.breed
        runners: list[Runner] = []
        for bi in r.get("bettingInterests") or []:
            bi_no = str(bi.get("biNumber"))
            members = bi.get("runners") or []
            for idx, ru in enumerate(members):
                program = str(ru.get("runnerId") or bi_no)
                runners.append(Runner(
                    program=program,
                    post=int(bi_no) if bi_no.isdigit() else None,
                    name=ru.get("horseName") or f"#{program}",
                    jockey=_name(ru.get("jockey")), trainer=_name(ru.get("trainer")),
                    sire=ru.get("sire"), dam=ru.get("dam"), age=ru.get("age"), sex=ru.get("sex"),
                    weight=ru.get("weight"),
                    morning_line=parse_odds(bi.get("morningLineOdds")),
                    live_odds=parse_odds(bi.get("currentOdds")),
                    scratched=bool(ru.get("scratched")),
                    coupled_with=bi_no if len(members) > 1 else None,
                    saddle_color=bi.get("saddleColor"), saddle_text_color=bi.get("numberColor"),
                ))
        # A recorded "current" price equal to the morning line means the pools
        # had not formed when captured; treat it as no live price.
        if runners and all(x.live_odds and x.morning_line and x.live_odds.raw == x.morning_line.raw for x in runners):
            for x in runners:
                x.live_odds = None
        status = RaceStatus.OPEN
        if post and now > post + timedelta(minutes=2):
            status = RaceStatus.CLOSED
        dist_raw = r.get("distance")
        return Race(
            id=make_race_id(track.code, track.card_date, number), track_id=track.id, track_code=track.code,
            track_name=track.name, breed=breed, number=number, card_date=track.card_date, post_time=post,
            distance=dist_raw, distance_furlongs=distance_furlongs(dist_raw, breed.value),
            surface=(r.get("surface") or {}).get("name"), race_class=(r.get("raceClass") or {}).get("name"),
            purse=r.get("purse"), status=status, runners=runners, source=self.name,
            fetched_at=utcnow(), odds_updated_at=None,
        )

    def health(self) -> dict:
        return {"source": self.name, "ok": True, "replay_date": self.replay_date.isoformat(),
                "days_available": [d.isoformat() for d in self.available_days()],
                "detail": "Replaying recorded TVG cards from the repository archive."}


@lru_cache(maxsize=512)
def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SourceError(f"cannot read {path}: {exc}") from exc


def _parse_dt(raw: object) -> datetime | None:
    if not raw or not isinstance(raw, str):
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _name(raw: object) -> str | None:
    """TVG lists people "Last First M"; show them "First M Last"."""
    if not raw or not isinstance(raw, str):
        return None
    parts = raw.split()
    if len(parts) >= 2 and "," not in raw:
        return " ".join(parts[1:] + parts[:1])
    return raw

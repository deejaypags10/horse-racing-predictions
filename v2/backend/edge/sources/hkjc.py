"""Hong Kong Jockey Club meetings (Sha Tin "ST", Happy Valley "HV").

HKJC is not on the TwinSpires adapter, so Hong Kong cards come from meeting
files in ``EDGE_HK_DIR`` (default ``v2/hkjc/``):

``<YYYY-MM-DD>_<VENUE>.json``
    The racecard, as written by ``edge hk-fetch`` or copied from the HKJC
    racecard pages (see ``v2/hkjc/README.md`` for the schema).
``<YYYY-MM-DD>_<VENUE>_odds.csv``
    Optional. ``race,no,win_odds`` with HKJC win odds (dividend per $1,
    stake included, e.g. ``4.5``). ``SCR`` marks a scratching. Fill it by
    hand from the HKJC app or let ``edge hk-fetch --watch`` keep it fresh.
``history.csv``
    Optional. Past runs per horse (one row per start) from the HKJC horse
    pages, so HK runners have form evidence. See ``load_history``.
``<YYYY-MM-DD>_<VENUE>_results.csv``
    Optional. ``race,no,position,win_div,place_div`` (dividends per HK$10)
    so paper tickets settle.

Files are re-read on every card refresh, so editing the odds file while the
app runs is enough. HKJC data is free and needs no credentials.

``fetch_meeting`` pulls the card and win odds from HKJC's public GraphQL
endpoint (the one bet.hkjc.com uses). It has not been verified from an open
network yet: raw responses are saved so the parser can be fixed if the schema
differs.
"""
from __future__ import annotations

import csv
import json
import logging
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from ..domain import Breed, FinishLine, Odds, Race, RaceResult, RaceStatus, Runner, Track, make_race_id, make_track_id
from ..features import horse_key
from ..history import RunRow
from ..odds import parse_odds
from .base import SourceError, utcnow

log = logging.getLogger(__name__)

HK_TZ = ZoneInfo("Asia/Hong_Kong")
VENUES = {"ST": "Sha Tin", "HV": "Happy Valley"}
METRES_PER_FURLONG = 201.168
GRAPHQL_URL = "https://info.cld.hkjc.com/graphql/base/"
_FILE = re.compile(r"^(\d{4}-\d{2}-\d{2})_(ST|HV)\.json$")


class HKJCSource:
    name = "hkjc"

    def __init__(self, root: Path, day: date | None = None):
        self.root = root
        self.day = day
        if not root.exists():
            raise SourceError(f"HKJC meeting directory not found: {root}")

    # -- clock ---------------------------------------------------------------
    def today(self) -> date:
        """Hong Kong's date, so a US-morning session sees that evening's HK card."""
        return self.day or datetime.now(HK_TZ).date()

    def now(self) -> datetime:
        return utcnow()

    # -- discovery -----------------------------------------------------------
    def meetings(self) -> list[tuple[date, str, Path]]:
        out = []
        for p in sorted(self.root.glob("*.json")):
            m = _FILE.match(p.name)
            if m:
                out.append((date.fromisoformat(m.group(1)), m.group(2), p))
        return out

    def tracks(self, day: date) -> list[Track]:
        out = []
        for d, venue, p in self.meetings():
            if d != day:
                continue
            data = _load(p)
            out.append(Track(
                id=make_track_id(venue, d), code=venue, name=VENUES[venue], breed=Breed.THOROUGHBRED,
                country="HKG", card_date=d, race_count=len(data.get("races") or []), source=self.name,
                provider_ref={"file": p.name},
            ))
        return out

    def card(self, track: Track) -> list[Race]:
        p = self.root / track.provider_ref.get("file", f"{track.card_date.isoformat()}_{track.code}.json")
        data = _load(p)
        odds = read_odds(p.with_name(p.stem + "_odds.csv"))
        results = read_results(p.with_name(p.stem + "_results.csv"))
        odds_at = _mtime(p.with_name(p.stem + "_odds.csv"))
        now = self.now()
        races = []
        for r in data.get("races") or []:
            try:
                races.append(_race(track, r, odds, results, now, odds_at))
            except (KeyError, ValueError, TypeError) as exc:
                log.warning("hkjc: skipping race in %s: %s", p, exc)
        races.sort(key=lambda r: r.number)
        return races

    def health(self) -> dict:
        found = self.meetings()
        return {"source": self.name, "ok": bool(found), "dir": str(self.root),
                "meetings": [f"{d.isoformat()} {v}" for d, v, _ in found],
                "detail": "Hong Kong meetings from HKJC card files; odds from the odds file when present."}


# -- parsing ---------------------------------------------------------------------
def _race(track: Track, r: dict, odds: dict, results: dict, now: datetime, odds_at: datetime | None) -> Race:
    number = int(r["race"])
    post = _post_time(track.card_date, r.get("post_local"))
    runners = []
    for ru in r.get("runners") or []:
        if ru.get("reserve"):
            continue  # standbys only run if a starter is withdrawn; they get a number then
        no = str(ru["no"])
        price = odds.get((number, no))
        runners.append(Runner(
            program=no, post=_int(ru.get("draw")), name=str(ru["name"]).strip().title(),
            jockey=ru.get("jockey"), trainer=ru.get("trainer"), age=_int(ru.get("age")), sex=ru.get("sex"),
            weight=_float(ru.get("weight")),
            morning_line=parse_odds(ru.get("morning_line")),
            live_odds=price if isinstance(price, Odds) else None,
            scratched=bool(ru.get("scratched")) or price == "SCR",
        ))
    metres = _float(r.get("distance_m"))
    finish = results.get(number)
    status = RaceStatus.OPEN
    if finish:
        status = RaceStatus.OFFICIAL
    elif post and now > post + timedelta(minutes=2):
        status = RaceStatus.CLOSED
    track_desc = str(r.get("track") or "")
    return Race(
        id=make_race_id(track.code, track.card_date, number), track_id=track.id, track_code=track.code,
        track_name=track.name, breed=Breed.THOROUGHBRED, number=number, country="HKG", card_date=track.card_date,
        post_time=post, distance=f"{int(metres)}m" if metres else None,
        distance_furlongs=round(metres / METRES_PER_FURLONG, 2) if metres else None,
        surface="All Weather" if "all weather" in track_desc.lower() else "Turf",
        race_class=_class(r.get("class")), race_name=(str(r.get("name")).title() if r.get("name") else None),
        purse=_money(r.get("prize_hkd")), status=status, runners=runners,
        result=RaceResult(finish=finish) if finish else None, source="hkjc", fetched_at=utcnow(),
        odds_updated_at=odds_at if any(k[0] == number for k in odds) else None,
        provider_ref={"venue": track.code, "going": str(r.get("going") or ""), "rating_band": str(r.get("rating_band") or "")},
    )


def read_odds(path: Path) -> dict[tuple[int, str], Odds | str]:
    """``(race, no) -> Odds`` (or ``"SCR"``). Missing file → no prices."""
    if not path.exists():
        return {}
    out: dict[tuple[int, str], Odds | str] = {}
    for row in _rows(path):
        key = (int(row["race"]), str(row["no"]).strip())
        raw = str(row.get("win_odds") or "").strip().upper()
        if raw in ("SCR", "WD"):
            out[key] = "SCR"
            continue
        try:
            dec = float(raw)
        except ValueError:
            continue  # blank or "---": pool not formed yet
        if dec > 1.0:
            out[key] = Odds(raw=raw, decimal=dec)
    return out


# Typical prize money (HK$) by class, used as the "purse" of past runs so the
# purse-change feature sees class rises and drops. Group races and 4YO series
# are rated above Class 1.
CLASS_PRIZE = {"5": 875_000.0, "4": 1_170_000.0, "3": 1_860_000.0, "2": 2_750_000.0, "1": 4_300_000.0,
               "4YO": 5_000_000.0, "G3": 5_000_000.0, "G2": 7_000_000.0, "G1": 14_000_000.0}
# HKJC horse pages do not give field size: use the usual maximum per venue.
FIELD_SIZE = {"ST": 14, "HV": 12}
FAVOURITE_MAX_ODDS = 3.5   # proxy for "was favourite" when only the horse's own odds are known


def load_history(root: Path) -> list[RunRow]:
    """Past starts from ``history.csv`` as v2 history rows in the ``hk:`` namespace.

    Columns: brand,horse,date,place,venue,track,distance_m,class,draw,rating,
    win_odds,weight. Non-finishes (WV, PU, DISQ, ...) are skipped.
    """
    path = root / "history.csv"
    if not path.exists():
        return []
    out = []
    with path.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            place = str(row.get("place") or "").strip()
            if not place.isdigit():
                continue
            try:
                day = date.fromisoformat(row["date"])
            except (KeyError, ValueError):
                continue
            venue = str(row.get("venue") or "").strip()
            track = str(row.get("track") or "").lower()
            metres = _float(row.get("distance_m"))
            odds = _float(row.get("win_odds"))
            out.append(RunRow(
                key=horse_key(str(row["horse"]).title(), "hk"), day=day, race_id=f"HK-{row.get('brand')}-{day:%Y%m%d}",
                track=venue if venue in VENUES else "OS",
                breed="thoroughbred",
                surface="synthetic" if "awt" in track or "all weather" in track else
                        ("turf" if "turf" in track or not track else "dirt"),
                dist_f=round(metres / METRES_PER_FURLONG, 2) if metres else None,
                purse=CLASS_PRIZE.get(str(row.get("class") or "").strip().upper()),
                field_size=FIELD_SIZE.get(venue, 12), position=int(place),
                favorite=bool(odds and odds <= FAVOURITE_MAX_ODDS), post=_int(row.get("draw"))))
    return out


def read_results(path: Path) -> dict[int, list[FinishLine]]:
    if not path.exists():
        return {}
    out: dict[int, list[FinishLine]] = {}
    for row in _rows(path):
        div_w, div_p = _float(row.get("win_div")), _float(row.get("place_div"))
        out.setdefault(int(row["race"]), []).append(FinishLine(
            program=str(row["no"]).strip(), position=int(row["position"]),
            # HKJC pays per HK$10; the app's convention is per 2 units.
            win_pay=div_w / 5 if div_w else None, place_pay=div_p / 5 if div_p else None))
    for lines in out.values():
        lines.sort(key=lambda f: f.position)
    return out


def _rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as fh:
        return [r for r in csv.DictReader(fh) if r.get("race") and r.get("no")]


def _load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SourceError(f"cannot read {path}: {exc}") from exc


def _mtime(path: Path) -> datetime | None:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    except OSError:
        return None


def _post_time(day: date, hhmm: object) -> datetime | None:
    if not hhmm or not re.fullmatch(r"\d{1,2}:\d{2}", str(hhmm)):
        return None
    h, m = map(int, str(hhmm).split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=HK_TZ).astimezone(timezone.utc)


def _class(raw: object) -> str | None:
    if raw is None:
        return None
    s = str(raw).strip()
    return f"Class {s}" if s.isdigit() else s


def _money(raw: object) -> float | None:
    if raw is None:
        return None
    s = re.sub(r"[^\d.]", "", str(raw))
    return float(s) if s else None


def _int(raw: object) -> int | None:
    try:
        return int(str(raw).strip())
    except (TypeError, ValueError):
        return None


def _float(raw: object) -> float | None:
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        return None


# -- live fetch (run where racing.hkjc.com / info.cld.hkjc.com are reachable) -----
_MEETING_QUERY = """
query raceMeetings($date: String, $venueCode: String) {
  raceMeetings(date: $date, venueCode: $venueCode) {
    venueCode date
    races {
      no raceName_en postTime distance raceClass_en
      raceTrack { description_en } raceCourse { displayCode }
      runners { no name_en status standbyNo barrierDrawNumber handicapWeight currentRating last6run
                horse { code } jockey { name_en } trainer { name_en } winOdds }
    }
  }
}"""

_ODDS_QUERY = """
query racing($date: String, $venueCode: String, $oddsTypes: [OddsType], $raceNo: Int) {
  raceMeetings(date: $date, venueCode: $venueCode) {
    pmPools(oddsTypes: $oddsTypes, raceNo: $raceNo) { oddsType status lastUpdateTime oddsNodes { combString oddsValue } }
  }
}"""


def _post(query: str, variables: dict, capture: Path | None, label: str) -> dict:
    import httpx

    resp = httpx.post(GRAPHQL_URL, json={"query": query, "variables": variables},
                      headers={"User-Agent": "Mozilla/5.0 (equine-edge personal use)",
                               "Origin": "https://bet.hkjc.com", "Referer": "https://bet.hkjc.com/"},
                      timeout=20.0)
    if capture:
        capture.mkdir(parents=True, exist_ok=True)
        (capture / f"{label}.json").write_text(resp.text, encoding="utf-8")
    if resp.status_code != 200:
        raise SourceError(f"HKJC GraphQL {label}: HTTP {resp.status_code}")
    body = resp.json()
    if body.get("errors"):
        raise SourceError(f"HKJC GraphQL {label}: {body['errors'][:2]}")
    return body.get("data") or {}


def meeting_from_graphql(data: dict, day: date, venue: str) -> dict:
    """Map a ``raceMeetings`` response onto the meeting-file schema."""
    meetings = data.get("raceMeetings") or []
    if not meetings:
        raise SourceError(f"HKJC has no {venue} meeting on {day}")
    races = []
    for r in meetings[0].get("races") or []:
        post = r.get("postTime")
        post_local = None
        if post:
            dt = datetime.fromisoformat(str(post).replace("Z", "+00:00"))
            post_local = (dt if dt.tzinfo else dt.replace(tzinfo=HK_TZ)).astimezone(HK_TZ).strftime("%H:%M")
        runners = []
        for ru in r.get("runners") or []:
            status = str(ru.get("status") or "").lower()
            runners.append({
                "no": str(ru.get("no") or ru.get("standbyNo") or "").lstrip("0") or None,
                "name": ru.get("name_en"), "brand": (ru.get("horse") or {}).get("code"),
                "draw": ru.get("barrierDrawNumber"), "weight": ru.get("handicapWeight"),
                "jockey": (ru.get("jockey") or {}).get("name_en"), "trainer": (ru.get("trainer") or {}).get("name_en"),
                "rating": ru.get("currentRating"), "last6": ru.get("last6run"),
                "reserve": status.startswith("standby") or (not ru.get("no") and bool(ru.get("standbyNo"))),
                "scratched": "scratch" in status or "withdrawn" in status,
            })
        races.append({
            "race": int(r["no"]), "name": r.get("raceName_en"), "class": r.get("raceClass_en"),
            "distance_m": r.get("distance"), "track": (r.get("raceTrack") or {}).get("description_en"),
            "course": (r.get("raceCourse") or {}).get("displayCode"), "post_local": post_local, "runners": runners,
        })
    return {"date": day.isoformat(), "venue": venue, "venue_name": VENUES[venue], "source": "hkjc-graphql",
            "fetched_at": utcnow().isoformat(), "races": races}


def win_odds_from_graphql(data: dict) -> dict[str, str]:
    """``{horse no: win odds}`` from a WIN ``pmPools`` response; ``SCR`` for scratchings."""
    out = {}
    for meeting in data.get("raceMeetings") or []:
        for pool in meeting.get("pmPools") or []:
            if str(pool.get("oddsType")).upper() != "WIN":
                continue
            for node in pool.get("oddsNodes") or []:
                no = str(node.get("combString") or "").lstrip("0")
                val = str(node.get("oddsValue") or "").strip()
                if no:
                    out[no] = "SCR" if val.upper() in ("SCR", "WD") else val
    return out


def fetch_meeting(root: Path, day: date, venue: str, *, card: bool = True, capture: Path | None = None) -> Path:
    """Write ``<day>_<venue>.json`` (if ``card``) and refresh ``<day>_<venue>_odds.csv``."""
    venue = venue.upper()
    if venue not in VENUES:
        raise SourceError(f"venue must be ST or HV, not {venue!r}")
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{day.isoformat()}_{venue}.json"
    ymd = day.isoformat()
    if card or not path.exists():
        data = _post(_MEETING_QUERY, {"date": ymd, "venueCode": venue}, capture, f"meeting_{ymd}_{venue}")
        meeting = meeting_from_graphql(data, day, venue)
        path.write_text(json.dumps(meeting, indent=1, ensure_ascii=False), encoding="utf-8")
    meeting = _load(path)
    rows = []
    for r in meeting.get("races") or []:
        n = int(r["race"])
        try:
            data = _post(_ODDS_QUERY, {"date": ymd, "venueCode": venue, "oddsTypes": ["WIN"], "raceNo": n},
                         capture, f"win_{ymd}_{venue}_{n}")
        except SourceError as exc:
            log.warning("hkjc: no odds for race %s: %s", n, exc)
            continue
        for no, val in win_odds_from_graphql(data).items():
            rows.append({"race": n, "no": no, "win_odds": val})
        time.sleep(0.4)  # politeness
    odds_path = path.with_name(path.stem + "_odds.csv")
    if rows:
        tmp = odds_path.with_suffix(".tmp")
        with tmp.open("w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=["race", "no", "win_odds"])
            w.writeheader()
            w.writerows(rows)
        tmp.replace(odds_path)
    return path

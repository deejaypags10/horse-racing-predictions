"""TwinSpires live source.

TwinSpires' web app reads its program data from unauthenticated JSON
endpoints under ``https://www.twinspires.com/adw``. They are not a
documented public API, so this adapter is written defensively:

* endpoint paths are templates (``ENDPOINTS``) that can be overridden with
  ``EDGE_TS_ENDPOINT_<NAME>`` environment variables without code changes;
* every field is read through an alias list (``_pick``) so renamed keys
  degrade to "missing" instead of crashing;
* every raw response can be captured to disk (``edge ts-probe``) so parser
  fixtures can be refreshed from real traffic;
* requests are rate limited, cached briefly and identified with a plain
  User-Agent. Nothing is sent but GET requests for public program data.

The endpoint shapes below are based on the TwinSpires web client as last
observed by the team and could not be re-verified from the build sandbox
(network policy blocks the host). Run ``edge ts-probe`` (or the
"TwinSpires probe" GitHub Action) on an open network to confirm them; see
docs/DATA_SOURCES.md.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from ..domain import (Breed, FinishLine, Race, RaceResult, RaceStatus, Runner, Track, make_race_id,
                      make_track_id)
from ..features import distance_furlongs
from ..odds import parse_odds
from .base import SourceError, utcnow

log = logging.getLogger(__name__)

ENDPOINTS: dict[str, str] = {
    "tracks": "/todays-tracks?affid={affid}",
    "races": "/todays-tracks/{code}/{type}/races?affid={affid}",
    "entries": "/todays-tracks/{code}/{type}/races/{race}/entries?affid={affid}",
    "odds": "/todays-tracks/{code}/{type}/races/{race}/odds?affid={affid}",
    "results": "/todays-tracks/{code}/{type}/races/{race}/results?affid={affid}",
}

# Seconds each kind of response stays fresh in the in-process cache.
TTL = {"tracks": 120.0, "races": 60.0, "entries": 45.0, "odds": 15.0, "results": 60.0}

USER_AGENT = "EquineEdge/2.0 (personal handicapping tool; low-rate polling)"
MAX_BYTES = 5_000_000
# Provider values that end up in URLs and capture filenames.
_SAFE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$")

_TYPE_TO_BREED = {"thoroughbred": Breed.THOROUGHBRED, "harness": Breed.HARNESS,
                  "quarter horse": Breed.QUARTER_HORSE, "quarterhorse": Breed.QUARTER_HORSE}


def _pick(obj: dict | None, *names: str, default: Any = None) -> Any:
    """First present, non-empty value among ``names`` (case-insensitive)."""
    if not isinstance(obj, dict):
        return default
    lower = {k.lower(): v for k, v in obj.items()}
    for n in names:
        v = lower.get(n.lower())
        if v not in (None, "", []):
            return v
    return default


def _as_list(payload: Any, *keys: str) -> list:
    """Accept either a bare list or a wrapper object holding the list."""
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in keys:
            v = _pick(payload, k)
            if isinstance(v, list):
                return v
        for v in payload.values():
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _parse_time(raw: Any) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        try:
            secs = raw / 1000.0 if raw > 1e11 else float(raw)
            return datetime.fromtimestamp(secs, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(raw, str):
        s = raw.strip()
        if s.isdigit():
            return _parse_time(int(s))
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return None


def _status(raw: Any) -> RaceStatus:
    s = str(raw or "").lower()
    if any(w in s for w in ("official", "final", "result")):
        return RaceStatus.OFFICIAL
    if any(w in s for w in ("cancel", "abandon")):
        return RaceStatus.CANCELLED
    if any(w in s for w in ("closed", "off", "running", "stop", "race off")):
        return RaceStatus.CLOSED
    return RaceStatus.OPEN


class TwinSpiresSource:
    name = "twinspires"

    def __init__(self, base: str, affid: str, min_interval: float = 0.35, capture_dir: Path | None = None,
                 client: httpx.Client | None = None, timeout: float = 10.0):
        self.base = base.rstrip("/")
        self.affid = affid
        self.min_interval = min_interval
        self.capture_dir = capture_dir
        self._client = client or httpx.Client(timeout=timeout, headers={
            "User-Agent": USER_AGENT, "Accept": "application/json"}, follow_redirects=False)
        self._lock = threading.Lock()
        self._last_request = 0.0
        self._cache: dict[str, tuple[float, Any]] = {}
        self._errors: list[dict] = []
        self._ok_at: datetime | None = None
        self.endpoints = {k: os.environ.get(f"EDGE_TS_ENDPOINT_{k.upper()}", v) for k, v in ENDPOINTS.items()}

    # -- clock ---------------------------------------------------------------
    def today(self) -> date:
        # TwinSpires' card date follows US Eastern time; approximate with UTC-5
        # so late west-coast cards stay on "today" until ~midnight ET.
        return datetime.fromtimestamp(time.time() - 5 * 3600, tz=timezone.utc).date()

    def now(self) -> datetime:
        return utcnow()

    # -- HTTP ----------------------------------------------------------------
    def _get(self, kind: str, **params: Any) -> Any:
        path = self.endpoints[kind].format(affid=quote(str(self.affid), safe=""),
                                           **{k: quote(str(v), safe="") for k, v in params.items()})
        url = self.base + path
        hit = self._cache.get(url)
        if hit and time.monotonic() - hit[0] < TTL[kind]:
            return hit[1]
        last_exc: Exception | None = None
        for attempt in range(3):
            with self._lock:
                wait = self.min_interval - (time.monotonic() - self._last_request)
                if wait > 0:
                    time.sleep(wait)
                self._last_request = time.monotonic()
            try:
                with self._client.stream("GET", url) as resp:
                    if resp.status_code == 404:
                        payload: Any = None
                        break
                    if resp.status_code in (429, 500, 502, 503, 504):
                        raise httpx.HTTPStatusError(f"HTTP {resp.status_code}", request=resp.request, response=resp)
                    resp.raise_for_status()
                    body = bytearray()
                    for chunk in resp.iter_bytes():
                        body += chunk
                        if len(body) > MAX_BYTES:
                            raise ValueError(f"{kind} response larger than {MAX_BYTES} bytes")
                # NaN/Infinity literals become None; never let them reach the store
                payload = json.loads(bytes(body), parse_constant=lambda _c: None)
                break
            except (httpx.HTTPError, ValueError, RecursionError) as exc:
                last_exc = exc
                time.sleep(0.5 * 2 ** attempt)
        else:
            self._record_error(kind, url, last_exc)
            if hit:  # serve stale rather than nothing
                return hit[1]
            raise SourceError(f"TwinSpires {kind} request failed: {last_exc}")
        self._ok_at = utcnow()
        self._cache[url] = (time.monotonic(), payload)
        self._capture(kind, params, payload)
        return payload

    def _record_error(self, kind: str, url: str, exc: Exception | None) -> None:
        self._errors.append({"at": utcnow().isoformat(timespec="seconds"), "kind": kind,
                             "error": type(exc).__name__ if exc else "unknown", "detail": str(exc)[:200]})
        del self._errors[:-20]
        log.warning("twinspires %s failed: %s", kind, exc)

    def _capture(self, kind: str, params: dict, payload: Any) -> None:
        if not self.capture_dir or payload is None:
            return
        day = self.today().isoformat()
        parts = [kind] + [str(params[k]) for k in ("code", "type", "race") if k in params]
        name = re.sub(r"[^A-Za-z0-9_-]", "_", "_".join(parts))[:120] + ".json"
        root = self.capture_dir.resolve()
        path = (root / day / name).resolve()
        if root not in path.parents:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, indent=1))
        except OSError as exc:  # capture is best-effort
            log.debug("capture failed: %s", exc)

    # -- parsing ---------------------------------------------------------------
    def tracks(self, day: date) -> list[Track]:
        if day != self.today():
            return []  # the program endpoints only serve today's card
        payload = self._get("tracks")
        return parse_tracks(payload, day, self.name)

    def card(self, track: Track) -> list[Race]:
        code, ttype = track.provider_ref["code"], track.provider_ref["type"]
        races_payload = self._get("races", code=code, type=ttype)
        races = parse_races(races_payload, track, self.name)
        for race in races:
            try:
                entries = self._get("entries", code=code, type=ttype, race=race.number)
                race.runners = parse_entries(entries)
            except SourceError:
                continue
            if race.status == RaceStatus.OPEN and race.runners:
                try:
                    odds = self._get("odds", code=code, type=ttype, race=race.number)
                    apply_odds(race, odds)
                except SourceError:
                    pass
            if race.status in (RaceStatus.OFFICIAL, RaceStatus.CLOSED):
                try:
                    res = self._get("results", code=code, type=ttype, race=race.number)
                    race.result = parse_results(res)
                    if race.result and race.result.finish:
                        race.status = RaceStatus.OFFICIAL
                except SourceError:
                    pass
            race.fetched_at = utcnow()
        return races

    def health(self) -> dict:
        return {"source": self.name, "ok": not self._errors or bool(self._ok_at and self._errors and
                self._ok_at.isoformat() > self._errors[-1]["at"]),
                "last_success": self._ok_at.isoformat(timespec="seconds") if self._ok_at else None,
                "recent_errors": self._errors[-5:], "base": self.base}


# ---------------------------------------------------------------------------
# Pure parsers (unit-tested against fixtures)
# ---------------------------------------------------------------------------

def parse_tracks(payload: Any, day: date, source: str = "twinspires") -> list[Track]:
    out = []
    for t in _as_list(payload, "tracks", "todaysTracks", "data"):
        code = _pick(t, "brisCode", "trackCode", "code", "id")
        ttype = str(_pick(t, "trackType", "type", "breed", default="Thoroughbred"))
        if not code or not _SAFE_ID.fullmatch(str(code)) or not _SAFE_ID.fullmatch(ttype) or " " in str(code):
            continue
        breed = _TYPE_TO_BREED.get(ttype.lower(), Breed.parse(ttype))
        if ttype.lower().startswith("grey") or ttype.lower() == "g":
            continue  # greyhounds are out of scope
        name = str(_pick(t, "name", "trackName", "displayName", default=code))
        country = str(_pick(t, "country", "hostCountry", "countryCode", default="USA"))
        code_s = str(code).upper()
        out.append(Track(
            id=make_track_id(code_s, day), code=code_s, name=name.title() if name.isupper() else name,
            breed=breed, country=country, card_date=day,
            race_count=int(_pick(t, "raceCount", "numberOfRaces", "totalRaces", default=0) or 0),
            source=source,
            provider_ref={"code": str(code).lower(), "type": ttype, "slug": _slug(name)},
        ))
    return out


def parse_races(payload: Any, track: Track, source: str = "twinspires") -> list[Race]:
    out = []
    for r in _as_list(payload, "races", "data"):
        num = _pick(r, "raceNumber", "race", "number", "raceNum")
        try:
            number = int(num)
        except (TypeError, ValueError):
            continue
        dist = _pick(r, "distance", "distanceDescription", "raceDistance")
        surface = _pick(r, "surface", "surfaceDescription", "course")
        if isinstance(surface, dict):
            surface = _pick(surface, "name", "description", "code")
        out.append(Race(
            id=make_race_id(track.code, track.card_date, number), track_id=track.id, track_code=track.code,
            track_name=track.name, breed=track.breed, number=number, card_date=track.card_date,
            post_time=_parse_time(_pick(r, "postTimeLong", "postTime", "postTimeUtc", "post_time")),
            distance=str(dist) if dist is not None else None,
            distance_furlongs=distance_furlongs(dist, track.breed.value),
            surface=str(surface) if surface else None,
            race_class=_pick(r, "raceType", "raceClass", "classification", "type"),
            race_name=_pick(r, "raceName", "name", "title"),
            purse=_to_float(_pick(r, "purse", "purseAmount")),
            status=_status(_pick(r, "status", "raceStatus")),
            source=source, provider_ref=dict(track.provider_ref),
        ))
    out.sort(key=lambda r: r.number)
    return out


def parse_entries(payload: Any) -> list[Runner]:
    runners = []
    for e in _as_list(payload, "entries", "runners", "starters", "data"):
        program = _pick(e, "programNumber", "program", "programNo", "saddleCloth", "number")
        name = _pick(e, "horseName", "name", "runnerName")
        if program is None or not name:
            continue
        program_s = str(program).strip().upper()
        post = _pick(e, "postPosition", "post", "pp")
        coupled = _pick(e, "couplingIndicator", "coupledWith", "entryIndicator")
        m = re.match(r"^(\d+)[A-Z]$", program_s)
        runners.append(Runner(
            program=program_s,
            post=int(post) if isinstance(post, (int, float)) or (isinstance(post, str) and post.isdigit()) else None,
            name=str(name).strip(),
            jockey=_pick(e, "jockeyName", "jockey", "driverName", "driver"),
            trainer=_pick(e, "trainerName", "trainer"),
            sire=_pick(e, "sireName", "sire"), dam=_pick(e, "damName", "dam"),
            age=_to_int(_pick(e, "age")), sex=_pick(e, "sex", "gender"),
            weight=_to_float(_pick(e, "weight", "weightCarried")),
            morning_line=parse_odds(_pick(e, "morningLineOdds", "morningLine", "ml", "mlOdds")),
            live_odds=parse_odds(_pick(e, "liveOdds", "currentOdds", "odds", "winOdds")),
            scratched=bool(_pick(e, "scratched", "isScratched", "scratch", default=False)),
            coupled_with=str(coupled) if coupled else (m.group(1) if m else None),
            saddle_color=_pick(e, "saddleClothColor", "saddleColor", "color"),
            saddle_text_color=_pick(e, "saddleClothTextColor", "numberColor", "textColor"),
        ))
    # A bare "1" is coupled with "1A" too.
    groups = {r.coupled_with for r in runners if r.coupled_with}
    for r in runners:
        if r.coupled_with is None and r.program in groups:
            r.coupled_with = r.program
    return runners


def apply_odds(race: Race, payload: Any) -> None:
    rows = _as_list(payload, "odds", "winOdds", "entries", "data")
    by_prog = {}
    for o in rows:
        prog = _pick(o, "programNumber", "program", "number", "bettingInterest", "biNumber")
        price = parse_odds(_pick(o, "odds", "winOdds", "liveOdds", "currentOdds", "value"))
        if prog is not None and price is not None:
            by_prog[str(prog).strip().upper()] = price
    if not by_prog:
        return
    for r in race.runners:
        key = r.coupled_with or r.program
        price = by_prog.get(r.program) or by_prog.get(key)
        if price:
            r.live_odds = price
    race.odds_updated_at = utcnow()


def parse_results(payload: Any) -> RaceResult | None:
    if not payload:
        return None
    rows = _as_list(payload, "finishers", "results", "runners", "finishOrder", "data")
    finish = []
    for f in rows:
        prog = _pick(f, "programNumber", "program", "number")
        pos = _to_int(_pick(f, "finishPosition", "position", "place", "finish"))
        if prog is None or not pos:
            continue
        finish.append(FinishLine(program=str(prog).strip().upper(), position=pos,
                                 win_pay=_to_float(_pick(f, "winPayoff", "win", "winPrice")),
                                 place_pay=_to_float(_pick(f, "placePayoff", "place", "placePrice")),
                                 show_pay=_to_float(_pick(f, "showPayoff", "show", "showPrice"))))
    exotics = {}
    for x in _as_list(payload if isinstance(payload, dict) else {}, "exotics", "payoffs", "exoticPayoffs", "wagers"):
        kind = str(_pick(x, "wagerType", "poolType", "type", "name", default="")).lower()
        pay = _to_float(_pick(x, "payoff", "payout", "amount", "price"))
        if kind and pay:
            exotics[kind] = pay
    if not finish:
        return None
    finish.sort(key=lambda f: f.position)
    return RaceResult(finish=finish, exotic_pays=exotics, official_at=utcnow())


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(str(v).replace("$", "").replace(",", ""))
    except ValueError:
        return None
    return f if math.isfinite(f) else None


def _to_int(v: Any) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError, OverflowError):
        return None


def deep_link(race: Race, track: Track | None = None) -> str | None:
    """TwinSpires program page for a race (the user places bets there)."""
    ref = race.provider_ref or (track.provider_ref if track else {})
    code = ref.get("code") or race.track_code.lower()
    ttype = ref.get("type") or {"harness": "Harness"}.get(race.breed.value, "Thoroughbred")
    slug = ref.get("slug") or _slug(race.track_name)
    return f"https://www.twinspires.com/bet/program/classic/{slug}/{code}/{ttype}/{race.number}/advanced"

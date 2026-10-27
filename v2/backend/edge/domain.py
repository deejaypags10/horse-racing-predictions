"""Canonical, source-independent racing data model.

Every adapter (TwinSpires live, TVG archive, recorded fixtures) produces these
objects. Nothing downstream of ``edge.sources`` may depend on a provider's
field names.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field


class Breed(str, Enum):
    THOROUGHBRED = "thoroughbred"
    HARNESS = "harness"
    QUARTER_HORSE = "quarter_horse"
    OTHER = "other"  # Arabian, mixed cards, anything we cannot classify

    @classmethod
    def parse(cls, raw: str | None) -> "Breed":
        s = (raw or "").strip().lower()
        if not s:
            return cls.THOROUGHBRED
        if s in {"h", "harness", "standardbred", "trot", "pace"} or "harness" in s:
            return cls.HARNESS
        if s in {"q", "qh", "quarter horse", "quarterhorse"} or "quarter" in s:
            return cls.QUARTER_HORSE
        if s in {"t", "tb", "thoroughbred"} or "thoroughbred" in s:
            return cls.THOROUGHBRED
        return cls.OTHER


class RaceStatus(str, Enum):
    OPEN = "open"          # betting open, not yet run
    CLOSED = "closed"      # off / running, betting closed
    OFFICIAL = "official"  # result official
    CANCELLED = "cancelled"


class Track(BaseModel):
    """A track *meeting* on one card date."""

    id: str                      # e.g. "CD-20260606"
    code: str                    # provider track code (BRIS code on TwinSpires)
    name: str
    breed: Breed
    country: str = "USA"
    card_date: date
    race_count: int = 0
    source: str
    # Provider-specific identifiers needed for deep links (e.g. TwinSpires
    # "trackType" and URL slug). Opaque to the rest of the app.
    provider_ref: dict[str, str] = Field(default_factory=dict)


class Odds(BaseModel):
    """A price as offered, kept in both raw and numeric form."""

    raw: str
    decimal: float  # total return per 1 unit staked (5-2 -> 3.5)

    @property
    def implied(self) -> float:
        return 1.0 / self.decimal


class Runner(BaseModel):
    program: str                 # program number as printed: "1", "1A", "12"
    post: int | None = None      # post position (starting gate / draw)
    name: str
    jockey: str | None = None    # driver for harness
    trainer: str | None = None
    sire: str | None = None
    dam: str | None = None
    age: int | None = None
    sex: str | None = None
    weight: float | None = None
    morning_line: Odds | None = None
    live_odds: Odds | None = None
    scratched: bool = False
    coupled_with: str | None = None  # entry/coupling group, e.g. "1" for 1 & 1A
    saddle_color: str | None = None
    saddle_text_color: str | None = None


class FinishLine(BaseModel):
    program: str
    position: int
    win_pay: float | None = None    # per $2
    place_pay: float | None = None
    show_pay: float | None = None


class RaceResult(BaseModel):
    finish: list[FinishLine]
    exotic_pays: dict[str, float] = Field(default_factory=dict)  # "exacta" -> $2 payout
    official_at: datetime | None = None


class Race(BaseModel):
    id: str                      # "CD-20260606-7"
    track_id: str
    track_code: str
    track_name: str
    breed: Breed
    number: int
    country: str = "USA"
    card_date: date
    post_time: datetime | None = None  # timezone-aware UTC
    distance: str | None = None        # as printed: "6f", "1 1/16m", "1m", "350y"
    distance_furlongs: float | None = None
    surface: str | None = None         # Dirt / Turf / Synthetic / ...
    race_class: str | None = None      # Claiming, Allowance, Stakes, Pace ...
    race_name: str | None = None
    purse: float | None = None
    status: RaceStatus = RaceStatus.OPEN
    runners: list[Runner] = Field(default_factory=list)
    result: RaceResult | None = None
    source: str
    fetched_at: datetime | None = None
    odds_updated_at: datetime | None = None
    provider_ref: dict[str, str] = Field(default_factory=dict)

    @property
    def active_runners(self) -> list[Runner]:
        return [r for r in self.runners if not r.scratched]


def make_track_id(code: str, card_date: date) -> str:
    return f"{code.upper()}-{card_date:%Y%m%d}"


def make_race_id(code: str, card_date: date, number: int) -> str:
    return f"{make_track_id(code, card_date)}-{int(number)}"


def parse_race_id(race_id: str) -> tuple[str, date, int]:
    """Inverse of :func:`make_race_id`. Raises ``ValueError`` on bad input."""
    parts = race_id.split("-")
    if len(parts) != 3:
        raise ValueError(f"bad race id: {race_id!r}")
    code, ymd, num = parts
    if (not code or not code.isalnum() or code != code.upper() or len(ymd) != 8 or not ymd.isdigit()
            or not num.isdigit() or num != str(int(num))):
        raise ValueError(f"bad race id: {race_id!r}")
    return code, _ymd(ymd, race_id), int(num)


def _ymd(ymd: str, whole: str) -> date:
    try:
        return datetime.strptime(ymd, "%Y%m%d").date()
    except ValueError:
        raise ValueError(f"bad date in id: {whole!r}") from None


def parse_track_id(track_id: str) -> tuple[str, date]:
    parts = track_id.split("-")
    if (len(parts) != 2 or not parts[0].isalnum() or parts[0] != parts[0].upper() or len(parts[1]) != 8
            or not parts[1].isdigit()):
        raise ValueError(f"bad track id: {track_id!r}")
    return parts[0], _ymd(parts[1], track_id)

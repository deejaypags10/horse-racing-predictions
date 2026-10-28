"""The contract every race-data provider implements."""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Protocol

from ..domain import Race, Track


class SourceError(RuntimeError):
    """Provider unreachable or returned something we cannot parse."""


class RaceSource(Protocol):
    name: str

    def today(self) -> date:
        """The card date this source considers "today"."""
        ...

    def now(self) -> datetime:
        """Clock used for minutes-to-post. Replay sources shift it."""
        ...

    def tracks(self, day: date) -> list[Track]:
        ...

    def card(self, track: Track) -> list[Race]:
        """Every race on the track's card, with runners, odds and results."""
        ...

    def health(self) -> dict:
        ...


def utcnow() -> datetime:
    return datetime.now(timezone.utc)

"""Handicapper picks: a separate signal shown beside the model, never blended in.

Picks come from any tipster or handicapper as a small CSV, one row per
selection:

    source,date,track,race,program,horse,kind
    BarberShopTake,2026-10-28,ST,8,4,Bustling City,best
    BarberShopTake,2026-10-28,ST,8,2,,leg

``kind`` is one of:

* ``top``  - the handicapper's top pick for the race
* ``best`` - top pick marked as their best bet of the card ("BB")
* ``next`` - top pick marked as their next best ("NB")
* ``leg``  - one horse in a multi-race leg (quaddie / pick-4 / pick-6)

``BB``, ``NB`` and ``quaddie`` are accepted as aliases.

``horse`` is optional (useful for checking a transcription); ``program`` is
the saddle-cloth number the picks are matched on.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

KINDS = ("top", "best", "next", "leg")
ALIASES = {"bb": "best", "nb": "next", "quaddie": "leg"}  # as tipsters write them
TOP_KINDS = ("top", "best", "next")
FIELDS = ("source", "date", "track", "race", "program", "horse", "kind")


@dataclass(frozen=True, slots=True)
class Pick:
    source: str
    day: date
    track: str
    race: int
    program: str
    horse: str
    kind: str


@dataclass
class RacePicks:
    """Every source's picks for one race."""
    top: dict[str, Pick] = field(default_factory=dict)        # source -> top pick
    legs: dict[str, list[str]] = field(default_factory=dict)  # source -> programs in its multi-race leg


def load_picks(path: Path) -> list[Pick]:
    """Read a picks CSV. Raises ``ValueError`` naming the line on bad input."""
    out: list[Pick] = []
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        missing = [f for f in FIELDS if f != "horse" and f not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing columns {missing}")
        for n, row in enumerate(reader, start=2):
            try:
                kind = row["kind"].strip().lower()
                kind = ALIASES.get(kind, kind)
                if kind not in KINDS:
                    raise ValueError(f"kind must be one of {KINDS}")
                program = row["program"].strip().upper()
                if not program:
                    raise ValueError("program is required")
                out.append(Pick(source=row["source"].strip(), day=date.fromisoformat(row["date"].strip()),
                                track=row["track"].strip().upper(), race=int(row["race"]), program=program,
                                horse=(row.get("horse") or "").strip(), kind=kind))
            except (KeyError, ValueError) as exc:
                raise ValueError(f"{path}:{n}: {exc}") from None
    return out


def by_race(picks: list[Pick]) -> dict[tuple[str, date, int], RacePicks]:
    """Group picks by (track, date, race). A second top pick from one source for one race is an error."""
    races: dict[tuple[str, date, int], RacePicks] = {}
    for p in picks:
        rp = races.setdefault((p.track, p.day, p.race), RacePicks())
        if p.kind in TOP_KINDS:
            if p.source in rp.top:
                raise ValueError(f"{p.source} has two top picks in {p.track} race {p.race}")
            rp.top[p.source] = p
        else:
            rp.legs.setdefault(p.source, []).append(p.program)
    return races


def consensus(rp: RacePicks, model_p: dict[str, float]) -> dict:
    """Compare one race's picks with the model's win chances (program -> probability).

    Returns, per source, where the model ranks their top pick and how much
    win probability their multi-race leg covers. Nothing here changes the
    model's numbers.
    """
    ranked = sorted(model_p, key=lambda k: -model_p[k])
    model_top = ranked[0] if ranked else None
    tops = []
    for src, p in rp.top.items():
        rank = ranked.index(p.program) + 1 if p.program in model_p else None
        tops.append({"source": src, "program": p.program, "horse": p.horse, "tag": p.kind,
                     "model_p": model_p.get(p.program), "model_rank": rank, "agrees": p.program == model_top})
    legs = []
    for src, programs in rp.legs.items():
        cover = sum(model_p.get(x, 0.0) for x in programs)
        left_out = [k for k in ranked[:3] if k not in programs]
        legs.append({"source": src, "programs": programs, "model_cover": cover, "model_top3_left_out": left_out})
    return {"model_top": model_top, "tops": tops, "legs": legs}

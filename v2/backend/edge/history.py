"""Horse form history: the legacy results archive plus results v2 ingests.

The archive is the TVG results parquet the legacy pipeline keeps appending
(``data/processed/us_races_cleaned.parquet``). It has ~800k runner rows
across 130+ US tracks and all three breeds, but no jockey/trainer columns,
and its odds column is unreliable (see docs/DECISIONS.md, D-007), so we use
only finishing positions, conditions and the favourite flag.

Lookups are cutoff-based: ``past(key, before=day)`` never returns a run on or
after ``day``. This is the single guard against look-ahead leakage.
"""
from __future__ import annotations

import logging
from bisect import bisect_left
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

from .features import PastRun, breed_group, horse_key, normalise_surface

log = logging.getLogger(__name__)

MAX_RUNS = 20


def _breed_from_race_type(rt: str) -> str:
    s = (rt or "").lower()
    if "harness" in s:
        return "harness"
    if "quarter" in s:
        return "quarter_horse"
    return "thoroughbred"


def _dist_f(value: float, race_type: str) -> float | None:
    if value is None or not np.isfinite(value) or value <= 0:
        return None
    rt = (race_type or "").lower()
    if "harness" in rt:
        return value * 8.0 if value < 4 else value / 220.0
    if "larc" in rt or "mixed" in rt:
        return value / 201.168
    if "quarter" in rt:
        return value / 220.0
    if value > 40:
        return value / 220.0
    return float(value)


@dataclass
class RunRow:
    """Flat runner-level result row, the unit both the archive and the
    SQLite results store produce."""

    key: str
    day: date
    race_id: str
    track: str
    breed: str
    surface: str
    dist_f: float | None
    purse: float | None
    field_size: int
    position: int
    favorite: bool
    post: int | None


def load_archive(path: Path) -> pd.DataFrame:
    """Read the legacy parquet into the canonical run-row frame."""
    cols = ["horse", "date", "track_code", "surface", "distance", "race_type", "position",
            "race_id", "field_size", "purse", "draw", "is_favorite"]
    df = pd.read_parquet(path, columns=cols)
    df = df[df["horse"].astype(str).str.len() > 0].copy()
    breed = df["race_type"].astype(str).map(_breed_from_race_type)
    df["breed"] = breed
    df["key"] = [horse_key(h, breed_group(b)) for h, b in zip(df["horse"].astype(str), breed)]
    df["day"] = pd.to_datetime(df["date"]).dt.date
    df["track"] = df["track_code"].astype(str).str.upper()
    df["surface"] = df["surface"].astype(str).map(normalise_surface)
    df["dist_f"] = [_dist_f(v, rt) for v, rt in zip(df["distance"].astype(float), df["race_type"].astype(str))]
    df["position"] = pd.to_numeric(df["position"], errors="coerce").fillna(0).astype(int)
    df["field_size"] = pd.to_numeric(df["field_size"], errors="coerce").fillna(0).astype(int)
    df["purse"] = pd.to_numeric(df["purse"], errors="coerce")
    df["post"] = pd.to_numeric(df["draw"], errors="coerce")
    df["favorite"] = df["is_favorite"].fillna(False).astype(bool)
    df["race_id"] = df["race_id"].astype(str)
    df = dedupe_mirrors(df)
    return df[["key", "day", "race_id", "track", "breed", "surface", "dist_f", "purse",
               "field_size", "position", "favorite", "post"]]


def dedupe_mirrors(df: pd.DataFrame) -> pd.DataFrame:
    """Keep one run per horse per day.

    TVG republishes big cards under wagering "mirror" codes (SX5, SA5, GT3,
    OD6, CH5, SAS ...), so the archive holds the same start up to five
    times. Left in, a single Derby run reads as five starts of "strong"
    evidence and whole races are double-counted in training. A horse never
    runs twice in a day, so (horse, day) is the identity; we keep the row
    from the most plausible real track: codes without digits first, then
    the code with the most rows overall.
    """
    if df.empty:
        return df
    volume = df["track"].map(df["track"].value_counts())
    has_digit = df["track"].str.contains(r"\d", regex=True)
    order = pd.DataFrame({"d": has_digit.astype(int), "v": -volume}, index=df.index)
    ranked = df.assign(_d=order["d"], _v=order["v"]).sort_values(["key", "day", "_d", "_v"], kind="mergesort")
    return ranked.drop_duplicates(["key", "day"], keep="first").drop(columns=["_d", "_v"])


class History:
    """Immutable, cutoff-queryable index of past runs keyed by horse."""

    def __init__(self, runs: pd.DataFrame):
        runs = runs.sort_values(["key", "day"], kind="mergesort").reset_index(drop=True)
        self._keys = runs["key"].to_numpy()
        self._days = runs["day"].to_numpy()
        self._track = runs["track"].to_numpy()
        self._surface = runs["surface"].to_numpy()
        self._dist = runs["dist_f"].to_numpy(dtype=float, na_value=np.nan)
        self._purse = runs["purse"].to_numpy(dtype=float, na_value=np.nan)
        self._fs = runs["field_size"].to_numpy()
        self._pos = runs["position"].to_numpy()
        self._fav = runs["favorite"].to_numpy()
        # key -> (start, stop) slice into the sorted arrays
        self._index: dict[str, tuple[int, int]] = {}
        if len(runs):
            change = np.flatnonzero(self._keys[1:] != self._keys[:-1]) + 1
            starts = np.concatenate([[0], change])
            stops = np.concatenate([change, [len(runs)]])
            for s, e in zip(starts, stops):
                self._index[self._keys[s]] = (int(s), int(e))
        self.n_runs = len(runs)
        self.n_horses = len(self._index)
        self.last_day: date | None = max(self._days) if len(runs) else None
        self.first_day: date | None = min(self._days) if len(runs) else None

    @classmethod
    def from_sources(cls, archive: Path | None, extra: Iterable[RunRow] = ()) -> "History":
        frames = []
        if archive and archive.exists():
            frames.append(load_archive(archive))
            log.info("history: loaded archive %s (%d rows)", archive, len(frames[0]))
        else:
            log.warning("history: archive %s not found; form features will be empty", archive)
        extra_df = pd.DataFrame([r.__dict__ for r in extra])
        if len(extra_df):
            frames.append(extra_df)
        if not frames:
            return cls.empty()
        runs = pd.concat(frames, ignore_index=True)
        # The same race may arrive from the archive and from v2 ingestion, and
        # a horse runs at most once a day.
        runs = runs.drop_duplicates(["key", "day"], keep="last")
        return cls(runs)

    @classmethod
    def empty(cls) -> "History":
        return cls(pd.DataFrame(columns=["key", "day", "race_id", "track", "breed", "surface", "dist_f",
                                         "purse", "field_size", "position", "favorite", "post"]))

    def past(self, key: str, before: date, limit: int = MAX_RUNS) -> list[PastRun]:
        span = self._index.get(key)
        if span is None:
            return []
        s, e = span
        cut = s + bisect_left(self._days[s:e].tolist(), before)
        lo = max(s, cut - limit)
        out = []
        for i in range(lo, cut):
            d = self._dist[i]
            p = self._purse[i]
            out.append(PastRun(
                day=self._days[i], track=self._track[i], surface=self._surface[i],
                dist_f=None if np.isnan(d) else float(d), purse=None if np.isnan(p) else float(p),
                field_size=int(self._fs[i]), position=int(self._pos[i]), favorite=bool(self._fav[i]),
            ))
        return out

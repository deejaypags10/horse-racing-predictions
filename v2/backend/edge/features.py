"""Point-in-time runner features.

One function, :func:`runner_features`, is used for both training and live
inference, so the model never sees a feature computed differently at
prediction time than it was trained on. Every input is a run that finished
*strictly before* the race being scored; the caller guarantees that by
querying :class:`edge.history.History` with the race date as the cutoff.

All features are track-agnostic: they describe a horse relative to its own
past and to today's race conditions, never "how good is track X". That is
what lets one model score a card at a track it has never seen.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date

import numpy as np

FEATURES: tuple[str, ...] = (
    "has_history",
    "log_starts",
    "win_rate",
    "top3_rate",
    "form_last",
    "form_avg3",
    "won_last",
    "fav_last",
    "log_days",
    "layoff",
    "purse_delta",
    "same_surface",
    "surface_win_rate",
    "dist_delta",
    "track_seen",
    "post_rel",
    "post_rel_sq",
    "recent_starts",
)

# Empirical-Bayes priors for the shrunk rates (≈ 1 / typical field size).
WIN_PRIOR, TOP3_PRIOR, PRIOR_STRENGTH = 0.12, 0.36, 4.0
DEFAULT_LOG_DAYS = math.log1p(28.0)


@dataclass(frozen=True, slots=True)
class PastRun:
    day: date
    track: str
    surface: str
    dist_f: float | None
    purse: float | None
    field_size: int
    position: int            # 1..n; 0 = finished outside the recorded places
    favorite: bool


@dataclass(frozen=True, slots=True)
class RaceContext:
    day: date
    track: str
    surface: str
    dist_f: float | None
    purse: float | None
    field_size: int


def finish_score(position: int, field_size: int) -> float:
    """1.0 = won, 0.0 = last. Unknown positions (0) are treated as the
    midpoint of the unplaced runners, which is what results feeds that only
    publish the first four finishers imply."""
    fs = max(int(field_size), 2)
    pos = position if position > 0 else (min(5, fs) + fs) / 2.0
    pos = min(max(pos, 1.0), float(fs))
    return 1.0 - (pos - 1.0) / (fs - 1.0)


def runner_features(past: list[PastRun], ctx: RaceContext, post: int | None) -> np.ndarray:
    """Feature vector for one runner. ``past`` is ordered oldest → newest."""
    n = len(past)
    fs = max(ctx.field_size, 1)
    if post and fs > 1:
        post_rel = (min(post, fs) - 1) / (fs - 1)
    else:
        post_rel = 0.5
    if n == 0:
        return np.array(
            [0.0, 0.0, WIN_PRIOR, TOP3_PRIOR, 0.5, 0.5, 0.0, 0.0, DEFAULT_LOG_DAYS, 0.0,
             0.0, 0.0, WIN_PRIOR, 0.0, 0.0, post_rel, post_rel * post_rel, 0.0]
        )

    wins = sum(1 for r in past if r.position == 1)
    top3 = sum(1 for r in past if 1 <= r.position <= 3)
    last = past[-1]
    last3 = past[-3:]
    scores3 = [finish_score(r.position, r.field_size) for r in last3]

    days = max((ctx.day - last.day).days, 1)
    surf = [r for r in past if r.surface == ctx.surface]
    surf_wins = sum(1 for r in surf if r.position == 1)

    purses = [math.log(r.purse) for r in last3 if r.purse and r.purse > 0]
    purse_delta = (math.log(ctx.purse) - sum(purses) / len(purses)) if purses and ctx.purse and ctx.purse > 0 else 0.0
    purse_delta = max(min(purse_delta, 2.0), -2.0)

    if ctx.dist_f and last.dist_f:
        dist_delta = min(abs(ctx.dist_f - last.dist_f) / ctx.dist_f, 1.0)
    else:
        dist_delta = 0.0

    recent = sum(1 for r in past if 0 < (ctx.day - r.day).days <= 60)

    return np.array(
        [
            1.0,
            math.log1p(n),
            (wins + WIN_PRIOR * PRIOR_STRENGTH) / (n + PRIOR_STRENGTH),
            (top3 + TOP3_PRIOR * PRIOR_STRENGTH) / (n + PRIOR_STRENGTH),
            scores3[-1],
            sum(scores3) / len(scores3),
            1.0 if last.position == 1 else 0.0,
            1.0 if last.favorite else 0.0,
            math.log1p(days),
            1.0 if days > 90 else 0.0,
            purse_delta,
            1.0 if last.surface == ctx.surface else 0.0,
            (surf_wins + WIN_PRIOR * PRIOR_STRENGTH) / (len(surf) + PRIOR_STRENGTH),
            dist_delta,
            1.0 if any(r.track == ctx.track for r in past) else 0.0,
            post_rel,
            post_rel * post_rel,
            math.log1p(recent),
        ]
    )


# --------------------------------------------------------------------------
# Normalisation helpers shared by every source
# --------------------------------------------------------------------------

_SUFFIX = re.compile(r"\s*\((?:[a-z]{2,3})\)\s*$")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def horse_key(name: str, breed_group: str) -> str:
    s = (name or "").strip().lower()
    s = _SUFFIX.sub("", s)
    s = _NON_ALNUM.sub("", s)
    return f"{breed_group}:{s}"


def breed_group(breed: str, country: str = "USA") -> str:
    """History namespace: harness horses never collide with runners, and
    Hong Kong horses never borrow a US namesake's form."""
    if country == "HKG":
        return "hk"
    return "h" if breed == "harness" else "r"


def normalise_surface(raw: str | None) -> str:
    s = (raw or "").strip().lower()
    if not s:
        return "dirt"
    if "turf" in s or s in {"t", "grass"}:
        return "turf"
    if "synth" in s or "tapeta" in s or "poly" in s or "all weather" in s or s in {"aw", "s"}:
        return "synthetic"
    return "dirt"


_FRACTION_WORDS = {"1/16": 1 / 16, "1/8": 1 / 8, "3/16": 3 / 16, "1/4": 0.25, "5/16": 5 / 16,
                   "3/8": 3 / 8, "1/2": 0.5, "5/8": 5 / 8, "3/4": 0.75, "7/8": 7 / 8, "70y": 70 / 1760}


def distance_furlongs(raw: object, breed: str | None = None) -> float | None:
    """Parse "6f", "6 1/2 Furlongs", "1 1/16m", "1m 70y", "350y", "1 Mile", or a
    bare number (interpreted per breed: harness miles, QH yards, TB furlongs,
    large values as yards/metres)."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        v = float(raw)
        if not math.isfinite(v) or v <= 0:
            return None
        if breed == "harness" and v < 4:
            return v * 8.0
        if breed == "quarter_horse" or v > 100:
            return v / 220.0 if v < 1200 or breed == "quarter_horse" else v / 201.168
        return v
    s = str(raw).strip().lower()
    if not s:
        return None
    try:
        return distance_furlongs(float(s), breed)
    except ValueError:
        pass
    total = 0.0
    found = False
    for num, frac, unit in re.findall(r"(\d+(?:\.\d+)?)?\s*(\d+/\d+)?\s*(miles?|mi|m|furlongs?|f|yards?|yds?|y|meters?|metres?|mtrs?)\b", s):
        if not num and not frac:
            continue
        val = (float(num) if num else 0.0) + (_FRACTION_WORDS.get(frac, 0.0) if frac else 0.0)
        if frac and frac not in _FRACTION_WORDS:
            a, b = frac.split("/")
            val += float(a) / float(b)
        if unit.startswith("mi") or (unit == "m" and val <= 20):
            total += val * 8.0
        elif unit.startswith("f"):
            total += val
        elif unit == "m":
            total += val / 201.168  # "1200m" is metres, "1m" is a mile
        elif unit.startswith("y"):
            total += val / 220.0
        else:
            total += val / 201.168
        found = True
    return round(total, 4) if found and total > 0 else None

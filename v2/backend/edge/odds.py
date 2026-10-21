"""Odds parsing and market probability helpers.

US tote and morning-line odds are quoted "to 1": ``5-2`` means a $1 win
returns $2.50 profit, i.e. decimal 3.5. We store decimal (total return).
"""
from __future__ import annotations

import math
import re
from collections.abc import Sequence

from .domain import Odds

_FRACTION = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*[-/:]\s*(\d+(?:\.\d+)?)\s*$")
_NUMBER = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*$")
_EVENS = {"even", "evens", "evs", "ev", "e"}

# Tote boards never pay less than 1-20 ($2.10 on a $2 bet) and display
# longshots as e.g. 99-1; clamp to a sane range so bad data cannot produce
# negative or infinite probabilities.
MIN_DECIMAL = 1.05
MAX_DECIMAL = 1000.0


def parse_odds(raw: object, *, to_one: bool = True) -> Odds | None:
    """Parse a provider odds value into :class:`Odds`.

    Accepts ``"5-2"``, ``"5/2"``, ``"9-5"``, ``"EVEN"``, ``"12"`` (12-1),
    numbers, and ``{"numerator": 5, "denominator": 2}`` dicts (TVG style,
    where a null denominator means "to 1"). ``to_one=False`` treats a bare
    number as a decimal price instead (some international feeds).
    Returns ``None`` for missing / unparseable / scratched markers.
    """
    if raw is None:
        return None
    if isinstance(raw, dict):
        num = raw.get("numerator")
        den = raw.get("denominator")
        if num is None:
            return None
        try:
            num_f = float(num)
            den_f = float(den) if den not in (None, 0, "0", "") else 1.0
        except (TypeError, ValueError):
            return None
        label = f"{_fmt(num_f)}-{_fmt(den_f)}"
        return _build(label, num_f / den_f + 1.0)
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        if not math.isfinite(raw) or raw <= 0:
            return None
        return _build(f"{_fmt(raw)}-1" if to_one else f"{raw:g}", raw + 1.0 if to_one else float(raw))
    if not isinstance(raw, str):
        return None
    s = raw.strip()
    if not s or s.upper() in {"SCR", "SC", "-", "--", "N/A", "NA"}:
        return None
    if s.lower() in _EVENS:
        return _build("1-1", 2.0)
    m = _FRACTION.match(s)
    if m:
        num, den = float(m.group(1)), float(m.group(2))
        if den <= 0:
            return None
        return _build(s.replace("/", "-").replace(":", "-").replace(" ", ""), num / den + 1.0)
    m = _NUMBER.match(s)
    if m:
        val = float(m.group(1))
        if val <= 0:
            return None
        if to_one:
            return _build(f"{_fmt(val)}-1", val + 1.0)
        return _build(s, val)
    return None


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


def _build(label: str, decimal: float) -> Odds | None:
    if not math.isfinite(decimal):
        return None
    decimal = min(max(decimal, MIN_DECIMAL), MAX_DECIMAL)
    return Odds(raw=label, decimal=round(decimal, 4))


def market_probabilities(decimals: Sequence[float | None], *, power: float = 1.0) -> list[float | None]:
    """De-vig a set of prices into probabilities that sum to 1.

    ``power`` > 1 applies a simple favourite-longshot correction
    (p_i ∝ implied_i ** power). Runners without a price get ``None``; the
    priced runners are normalised among themselves.
    """
    implied = [None if d is None or d <= 1.0 else (1.0 / d) ** power for d in decimals]
    total = sum(x for x in implied if x is not None)
    if total <= 0:
        return [None] * len(decimals)
    return [None if x is None else x / total for x in implied]


def overround(decimals: Sequence[float | None]) -> float | None:
    vals = [1.0 / d for d in decimals if d and d > 1.0]
    return sum(vals) if vals else None


def fair_decimal(p: float) -> float | None:
    """Decimal price at which a bet with win probability ``p`` breaks even."""
    if p is None or p <= 0:
        return None
    return min(1.0 / p, MAX_DECIMAL)


def decimal_to_us(decimal: float | None) -> str | None:
    """Render a decimal price the way a tote board would ("5-2", "9-5", "12-1")."""
    if decimal is None:
        return None
    profit = decimal - 1.0
    if profit <= 0:
        return None
    # Standard tote increments below 5-1, then whole numbers.
    ladder = [
        (0.05, "1-20"), (0.1, "1-10"), (0.2, "1-5"), (0.4, "2-5"), (0.5, "1-2"), (0.6, "3-5"),
        (0.8, "4-5"), (1.0, "1-1"), (1.2, "6-5"), (1.4, "7-5"), (1.5, "3-2"), (1.6, "8-5"),
        (1.8, "9-5"), (2.0, "2-1"), (2.5, "5-2"), (3.0, "3-1"), (3.5, "7-2"), (4.0, "4-1"),
        (4.5, "9-2"), (5.0, "5-1"),
    ]
    if profit < 5.25:
        best = min(ladder, key=lambda kv: abs(kv[0] - profit))
        return best[1]
    return f"{int(round(profit))}-1"

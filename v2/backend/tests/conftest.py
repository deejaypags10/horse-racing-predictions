from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixtures() -> Path:
    return FIX


def load(name: str):
    return json.loads((FIX / name).read_text())


@pytest.fixture
def tiny_history_frame() -> pd.DataFrame:
    """Two horses with known past runs, used by feature/history tests."""
    from edge.features import horse_key
    rows = []
    d0 = date(2026, 5, 1)
    for i, pos in enumerate([1, 3, 0, 2]):
        rows.append(dict(key=horse_key("Midday Sun", "r"), day=d0 + timedelta(days=14 * i), race_id=f"A{i}",
                         track="CD", breed="thoroughbred", surface="dirt", dist_f=6.0, purse=30000.0,
                         field_size=8, position=pos, favorite=pos == 1, post=3))
    rows.append(dict(key=horse_key("Evening Star", "r"), day=d0, race_id="A0", track="GP", breed="thoroughbred",
                     surface="turf", dist_f=8.0, purse=50000.0, field_size=8, position=5, favorite=False, post=5))
    return pd.DataFrame(rows)

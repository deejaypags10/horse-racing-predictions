from datetime import date

import numpy as np
import pytest

from edge.features import (FEATURES, PastRun, RaceContext, distance_furlongs, finish_score, horse_key,
                           normalise_surface, runner_features)


@pytest.mark.parametrize("raw,breed,f", [
    ("6f", None, 6.0), ("6 1/2 Furlongs", None, 6.5), ("1 1/16m", None, 8.5), ("1 Mile", None, 8.0),
    ("1m 70y", None, 8 + 70 / 220), ("350y", None, 350 / 220), ("1200m", None, 1200 / 201.168),
    (1.0, "harness", 8.0), (350, "quarter_horse", 350 / 220), ("6 F", None, 6.0), ("1 1/16 Miles", None, 8.5),
    (None, None, None), ("", None, None), ("about", None, None),
])
def test_distance_furlongs(raw, breed, f):
    got = distance_furlongs(raw, breed)
    if f is None:
        assert got is None
    else:
        assert got == pytest.approx(f, rel=1e-3)


def test_surface_and_key_normalisation():
    assert normalise_surface("Inner Track") == "dirt"
    assert normalise_surface("Turf") == "turf"
    assert normalise_surface("Tapeta") == "synthetic"
    assert horse_key("Lion Lake (IRE)", "r") == horse_key("lion lake", "r") == "r:lionlake"
    assert horse_key("Lion Lake", "h") != horse_key("Lion Lake", "r")


def test_finish_score_bounds():
    assert finish_score(1, 8) == 1.0
    assert finish_score(8, 8) == 0.0
    assert 0.0 < finish_score(0, 8) < finish_score(4, 8)


def test_no_history_vector_is_neutral():
    ctx = RaceContext(date(2026, 6, 6), "CD", "dirt", 6.0, 30000.0, 8)
    x = runner_features([], ctx, 1)
    assert len(x) == len(FEATURES)
    assert x[FEATURES.index("has_history")] == 0.0
    assert x[FEATURES.index("post_rel")] == 0.0


def test_features_reflect_form():
    ctx = RaceContext(date(2026, 6, 6), "CD", "dirt", 6.0, 30000.0, 8)
    good = [PastRun(date(2026, 5, 1), "CD", "dirt", 6.0, 30000.0, 8, 1, True)]
    bad = [PastRun(date(2026, 5, 1), "GP", "turf", 9.0, 90000.0, 8, 8, False)]
    xg, xb = runner_features(good, ctx, 4), runner_features(bad, ctx, 4)
    f = FEATURES.index
    assert xg[f("won_last")] == 1 and xb[f("won_last")] == 0
    assert xg[f("form_last")] > xb[f("form_last")]
    assert xg[f("track_seen")] == 1 and xb[f("track_seen")] == 0
    assert xb[f("purse_delta")] < 0 < xb[f("dist_delta")]
    assert np.isfinite(xg).all() and np.isfinite(xb).all()

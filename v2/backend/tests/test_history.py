from datetime import date

from edge.features import horse_key
from edge.history import History


def test_cutoff_excludes_same_day_and_future(tiny_history_frame):
    h = History(tiny_history_frame)
    k = horse_key("Midday Sun", "r")
    assert len(h.past(k, before=date(2026, 5, 1))) == 0
    assert len(h.past(k, before=date(2026, 5, 2))) == 1
    runs = h.past(k, before=date(2026, 7, 1))
    assert [r.position for r in runs] == [1, 3, 0, 2]          # oldest → newest
    assert runs == sorted(runs, key=lambda r: r.day)
    assert len(h.past(k, before=date(2026, 7, 1), limit=2)) == 2
    assert h.past("r:nobody", before=date(2026, 7, 1)) == []
    assert h.n_horses == 2


def test_empty_history():
    h = History.empty()
    assert h.n_runs == 0 and h.past("r:x", before=date(2026, 1, 1)) == []


def test_mirror_codes_collapse_to_one_start(tiny_history_frame):
    import pandas as pd
    from edge.history import dedupe_mirrors
    row = tiny_history_frame.iloc[0].to_dict()
    dup = pd.DataFrame([row, {**row, "track": "SX5"}, {**row, "track": "OD6"}])
    out = dedupe_mirrors(pd.concat([tiny_history_frame, dup], ignore_index=True))
    assert len(out) == len(tiny_history_frame)
    assert out[out["day"] == row["day"]]["track"].tolist().count("SX5") == 0

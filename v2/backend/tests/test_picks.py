from datetime import date

import pytest

from edge.picks import by_race, consensus, load_picks

CSV = """source,date,track,race,program,horse,kind
Tipster,2026-10-28,st,8,4,Bustling City,BB
Tipster,2026-10-28,ST,8,2,,leg
Tipster,2026-10-28,ST,8,3,,leg
Tipster,2026-10-28,ST,9,11,Nezha,top
"""


def write(tmp_path, text):
    p = tmp_path / "picks.csv"
    p.write_text(text)
    return p


def test_load_and_group(tmp_path):
    picks = load_picks(write(tmp_path, CSV))
    assert len(picks) == 4 and picks[0].track == "ST" and picks[0].day == date(2026, 10, 28)
    races = by_race(picks)
    r8 = races[("ST", date(2026, 10, 28), 8)]
    assert r8.top["Tipster"].program == "4" and r8.top["Tipster"].kind == "best"
    assert r8.legs["Tipster"] == ["2", "3"]


def test_consensus_reports_agreement_and_leg_cover(tmp_path):
    races = by_race(load_picks(write(tmp_path, CSV)))
    model = {"4": 0.57, "8": 0.12, "3": 0.09, "2": 0.08, "6": 0.14}
    c = consensus(races[("ST", date(2026, 10, 28), 8)], model)
    assert c["model_top"] == "4"
    assert c["tops"][0]["agrees"] and c["tops"][0]["model_rank"] == 1
    leg = c["legs"][0]
    assert leg["model_cover"] == pytest.approx(0.17)
    assert leg["model_top3_left_out"] == ["4", "6", "8"]
    c9 = consensus(races[("ST", date(2026, 10, 28), 9)], {"4": 0.2, "11": 0.1, "6": 0.12})
    assert not c9["tops"][0]["agrees"] and c9["tops"][0]["model_rank"] == 3


@pytest.mark.parametrize("bad", [
    "source,date,track,race,program,horse,kind\nT,2026-10-28,ST,1,4,,favourite\n",
    "source,date,track,race,program,horse,kind\nT,28/10/2026,ST,1,4,,top\n",
    "source,date,track,race,program,horse,kind\nT,2026-10-28,ST,1,,,top\n",
    "source,date,race,program,kind\nT,2026-10-28,1,4,top\n",
])
def test_bad_rows_name_the_problem(tmp_path, bad):
    p = tmp_path / "bad.csv"
    p.write_text(bad)
    with pytest.raises(ValueError):
        load_picks(p)


def test_two_top_picks_from_one_source_is_an_error(tmp_path):
    p = write(tmp_path, CSV + "Tipster,2026-10-28,ST,9,4,Sky Vino,top\n")
    with pytest.raises(ValueError):
        by_race(load_picks(p))

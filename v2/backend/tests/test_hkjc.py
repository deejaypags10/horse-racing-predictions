import json
import warnings
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from edge.api import create_app
from edge.config import Settings
from edge.features import FEATURES, horse_key
from edge.history import History
from edge.model.logit import BreedModel, FormModel
from edge.service import Service
from edge.sources.hkjc import HKJCSource, meeting_from_graphql, read_odds, win_odds_from_graphql
from edge.store import Store

warnings.filterwarnings("ignore", category=DeprecationWarning)

DAY = date(2099, 1, 7)


def _meeting(root, day=DAY, venue="HV"):
    card = {"date": day.isoformat(), "venue": venue, "races": [{
        "race": 1, "name": "TEST HANDICAP", "class": "Class 4", "distance_m": 1200, "track": "Turf, Course C",
        "going": "Good", "post_local": "19:15", "prize_hkd": 1170000, "runners": [
            {"no": "1", "name": "GO GO GO", "draw": 3, "weight": 133, "jockey": "A B", "trainer": "C D"},
            {"no": "2", "name": "SECOND HORSE", "draw": 1, "weight": 130},
            {"no": "3", "name": "THIRD HORSE", "draw": 2, "weight": 120},
            {"no": "1", "name": "STANDBY ONE", "reserve": True},
        ]}]}
    (root / f"{day.isoformat()}_{venue}.json").write_text(json.dumps(card))
    return root


@pytest.fixture
def hk_dir(tmp_path):
    d = tmp_path / "hk"
    d.mkdir()
    return _meeting(d)


def _service(tmp_path, root, history=None):
    s = Settings.load()
    st = Settings(**{**s.__dict__, "db_path": tmp_path / "t.sqlite3", "web_dist": tmp_path / "nodist",
                     "source": "hkjc", "hk_dir": root})
    k = len(FEATURES)
    model = FormModel({"thoroughbred": BreedModel(np.zeros(k), np.ones(k), np.ones(k))}, version="test")
    hist = history if history is not None else History(pd.DataFrame(columns=[
        "key", "day", "race_id", "track", "breed", "surface", "dist_f", "purse", "field_size", "position",
        "favorite", "post"]))
    svc = Service(st, source=HKJCSource(root, DAY), history=hist, model=model, store=Store(st.db_path))
    return svc, TestClient(create_app(service=svc, settings=st))


def test_card_from_meeting_file(hk_dir):
    src = HKJCSource(hk_dir, DAY)
    [track] = src.tracks(DAY)
    assert (track.id, track.name, track.country) == ("HV-20990107", "Happy Valley", "HKG")
    [race] = src.card(track)
    assert [r.program for r in race.runners] == ["1", "2", "3"]          # standby left out
    assert race.post_time.isoformat() == "2099-01-07T11:15:00+00:00"     # 19:15 HKT
    assert race.surface == "Turf" and race.distance == "1200m" and abs(race.distance_furlongs - 5.97) < 0.01
    assert race.country == "HKG" and all(r.live_odds is None for r in race.runners)


def test_odds_file_prices_and_scratchings(hk_dir):
    (hk_dir / f"{DAY.isoformat()}_HV_odds.csv").write_text("race,no,win_odds\n1,1,2.5\n1,2,SCR\n1,3,---\n")
    odds = read_odds(hk_dir / f"{DAY.isoformat()}_HV_odds.csv")
    assert odds[(1, "1")].decimal == 2.5 and odds[(1, "2")] == "SCR" and (1, "3") not in odds
    src = HKJCSource(hk_dir, DAY)
    [race] = src.card(src.tracks(DAY)[0])
    by = {r.program: r for r in race.runners}
    assert by["2"].scratched and by["1"].live_odds.decimal == 2.5


def test_market_only_and_no_us_form_leak(tmp_path, hk_dir):
    # A US horse that shares a name with an HK runner must not lend it form.
    rows = [dict(key=horse_key("Go Go Go", "r"), day=DAY - timedelta(days=30 * i), race_id=f"U{i}", track="CD",
                 breed="thoroughbred", surface="dirt", dist_f=6.0, purse=30000.0, field_size=8, position=1,
                 favorite=True, post=3) for i in range(1, 8)]
    (hk_dir / f"{DAY.isoformat()}_HV_odds.csv").write_text("race,no,win_odds\n1,1,3.0\n1,2,3.0\n1,3,6.0\n")
    svc, c = _service(tmp_path, hk_dir, History(pd.DataFrame(rows)))
    view = c.get("/api/races/HV-20990107-1").json()
    p = view["prediction"]
    assert p["market"] == "live" and p["evidence"] == "none" and abs(p["sum_p"] - 1) < 1e-6
    by = {r["program"]: r["model"] for r in view["runners"]}
    assert by["1"]["p_model"] == pytest.approx(by["1"]["p_market"], abs=1e-4)  # model = de-vigged market
    assert by["1"]["p_model"] == pytest.approx(by["2"]["p_model"]) and by["1"]["starts"] == 0
    assert not any(m["value"] for m in by.values())
    assert view["race"]["deep_link"] is None


def test_results_file_settles_tickets(tmp_path, hk_dir):
    odds = hk_dir / f"{DAY.isoformat()}_HV_odds.csv"
    odds.write_text("race,no,win_odds\n1,1,3.0\n1,2,3.0\n1,3,6.0\n")
    svc, c = _service(tmp_path, hk_dir)
    t = c.post("/api/tickets", json={"race_id": "HV-20990107-1", "kind": "win", "selection": ["3"], "stake": 10})
    assert t.status_code == 201, t.text
    (hk_dir / f"{DAY.isoformat()}_HV_results.csv").write_text(
        "race,no,position,win_div,place_div\n1,3,1,61.0,18.5\n1,1,2,,12.0\n1,2,3,,14.0\n")
    svc.invalidate("HV-20990107")
    view = c.get("/api/races/HV-20990107-1").json()
    assert view["race"]["status"] == "official"
    [ticket] = c.get("/api/tickets").json()["tickets"]
    assert ticket["status"] == "won" and ticket["payout"] == pytest.approx(61.0)  # HK$61 per HK$10


def test_graphql_mapping():
    data = {"raceMeetings": [{"venueCode": "HV", "date": "2099-01-07", "races": [{
        "no": "1", "raceName_en": "TEST HANDICAP", "postTime": "2099-01-07T19:15:00+08:00", "distance": 1200,
        "raceClass_en": "Class 4", "raceTrack": {"description_en": "Turf"}, "raceCourse": {"displayCode": "C"},
        "runners": [
            {"no": "01", "name_en": "GO GO GO", "status": "Declared", "barrierDrawNumber": "3", "handicapWeight": "133",
             "jockey": {"name_en": "A B"}, "trainer": {"name_en": "C D"}, "horse": {"code": "K001"}},
            {"no": "", "standbyNo": "1", "name_en": "STANDBY ONE", "status": "Standby"},
            {"no": "02", "name_en": "OUT", "status": "Scratched"},
        ]}]}]}
    m = meeting_from_graphql(data, DAY, "HV")
    [r] = m["races"]
    assert r["post_local"] == "19:15" and r["runners"][0]["no"] == "1" and r["runners"][1]["reserve"]
    assert r["runners"][2]["scratched"]
    odds = win_odds_from_graphql({"raceMeetings": [{"pmPools": [
        {"oddsType": "WIN", "oddsNodes": [{"combString": "01", "oddsValue": "4.5"}, {"combString": "02", "oddsValue": "SCR"}]},
        {"oddsType": "PLA", "oddsNodes": [{"combString": "01", "oddsValue": "1.5"}]}]}]})
    assert odds == {"1": "4.5", "2": "SCR"}

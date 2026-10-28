import copy
import warnings
from datetime import date

import numpy as np
import pytest
from fastapi.testclient import TestClient

from conftest import load
from edge.api import create_app
from edge.config import Settings
from edge.features import FEATURES
from edge.history import History
from edge.model.logit import BreedModel, FormModel
from edge.service import Service
from edge.store import Store
from test_twinspires import ROUTES, make_source

warnings.filterwarnings("ignore", category=DeprecationWarning)


def _settings(tmp_path):
    s = Settings.load()
    return Settings(**{**s.__dict__, "db_path": tmp_path / "t.sqlite3", "web_dist": tmp_path / "nodist"})


def _model():
    k = len(FEATURES)
    return FormModel({"thoroughbred": BreedModel(np.zeros(k), np.ones(k), np.zeros(k))}, version="test")


@pytest.fixture
def live(monkeypatch, tmp_path, tiny_history_frame):
    routes = copy.deepcopy(ROUTES)
    src, _ = make_source(monkeypatch, routes)
    svc = Service(_settings(tmp_path), source=src, history=History(tiny_history_frame), model=_model(),
                  store=Store(tmp_path / "t.sqlite3"))
    client = TestClient(create_app(service=svc, settings=_settings(tmp_path)))
    return svc, client, routes, src


def test_race_view_contract(live):
    svc, c, *_ = live
    r = c.get("/api/races/CD-20260606-2")
    assert r.status_code == 200
    body = r.json()
    assert body["prediction"]["market"] == "live"
    assert body["prediction"]["sum_p"] == pytest.approx(1.0, abs=1e-6)
    assert body["race"]["deep_link"].endswith("/cd/Thoroughbred/2/advanced")
    by = {x["program"]: x for x in body["runners"]}
    assert by["4"]["scratched"] and by["4"]["model"] is None
    assert by["1"]["model"] == by["1A"]["model"]                   # one coupled interest
    # what-if scratch recomputes; bad input rejected
    w = c.get("/api/races/CD-20260606-2?whatif=2").json()
    assert w["prediction"]["whatif"] == ["2"]
    assert c.get("/api/races/CD-20260606-2?whatif=<script>").status_code == 400
    assert c.get("/api/races/CD-20260606-9").status_code == 404
    assert c.get("/api/races/not-an-id").status_code == 404
    assert svc.store.snapshot_count("CD-20260606-2") == 1         # live open race snapshotted once


def test_board_and_track(live):
    _, c, *_ = live
    b = c.get("/api/board").json()
    assert b["status"]["live"] is True
    assert {t["code"] for t in b["tracks"]} >= {"CD"}
    t = c.get("/api/tracks/CD-20260606").json()
    assert [r["number"] for r in t["races"]] == [1, 2]
    assert t["races"][0]["finish"] == ["3", "1", "2"]
    assert c.get("/api/tracks/ZZ-20260606").status_code == 404


def test_ticket_lifecycle_and_settlement(live):
    svc, c, routes, src = live
    bad = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["4"], "stake": 5})
    assert bad.status_code == 400 and "not an active" in bad.json()["detail"]
    assert c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["2"],
                                        "stake": -1}).status_code == 400
    assert c.post("/api/tickets", json={"race_id": "CD-20260606-1", "kind": "win", "selection": ["3"],
                                        "stake": 5}).status_code == 400          # already official
    assert c.post("/api/tickets", content=b"nope", headers={"content-type": "application/json"}).status_code == 400

    win = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["3"],
                                       "stake": 10, "odds_taken": "6-1"})
    assert win.status_code == 201
    ex = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "exacta", "selection": ["3", "1"], "stake": 2})
    lose = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "show", "selection": ["5"], "stake": 4})
    gone = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["5"], "stake": 4})
    assert ex.status_code == lose.status_code == gone.status_code == 201
    assert ex.json()["model_prob"] > 0
    assert c.delete(f"/api/tickets/{gone.json()['id']}").status_code == 204

    # race 2 goes official
    routes["/cd/Thoroughbred/races"] = {"races": [load("twinspires/races_cd.json")["races"][0],
                                                  {**load("twinspires/races_cd.json")["races"][1], "status": "Official"}]}
    routes["/cd/Thoroughbred/races/2/results"] = load("twinspires/results_cd_1.json")
    src._cache.clear()
    svc._cache.clear()
    c.get("/api/tracks/CD-20260606")
    t = c.get("/api/tickets").json()
    by = {x["id"]: x for x in t["tickets"]}
    assert by[win.json()["id"]]["status"] == "won" and by[win.json()["id"]]["payout"] == pytest.approx(42.0)
    assert by[win.json()["id"]]["closing_odds"] == pytest.approx(6.0)   # 5-1 snapshot before the off
    assert by[win.json()["id"]]["clv"] is not None
    assert by[ex.json()["id"]]["status"] == "won" and by[ex.json()["id"]]["payout"] == pytest.approx(31.6)
    assert by[lose.json()["id"]]["status"] == "lost"
    assert t["summary"]["settled"] == 3 and t["summary"]["staked"] == 16.0
    assert c.delete(f"/api/tickets/{win.json()['id']}").status_code == 404      # settled tickets are immutable
    # result became history for the form model
    rows = svc._result_runs()
    assert {r.position for r in rows if r.race_id == "CD-20260606-2"} >= {1, 2, 3}


def test_security_headers_and_model(live):
    _, c, *_ = live
    r = c.get("/api/status")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["cache-control"] == "no-store"
    m = c.get("/api/model").json()
    assert m["version"] == "test" and "live" in m["blend"]
    assert c.delete("/api/tickets/../../etc").status_code in (404, 405)


def test_poller_refreshes_due_tracks(live):
    from edge.poller import Poller
    svc, _, routes, src = live
    # make the fixture's open race due: post 5 minutes from the source clock
    from datetime import timedelta
    post = svc.source.now() + timedelta(minutes=5)
    routes["/cd/Thoroughbred/races"] = {"races": [{**load("twinspires/races_cd.json")["races"][1],
                                                   "postTime": post.isoformat()}]}
    src._cache.clear(); svc._cache.clear()
    assert Poller(svc).tick() == 1
    assert svc.store.snapshot_count("CD-20260606-2") == 1


def test_cannot_withdraw_ticket_after_off(live):
    svc, c, routes, src = live
    t = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["2"], "stake": 5}).json()
    routes["/cd/Thoroughbred/races"] = {"races": [{**load("twinspires/races_cd.json")["races"][1], "status": "Closed"}]}
    src._cache.clear(); svc._cache.clear()
    r = c.delete(f"/api/tickets/{t['id']}")
    assert r.status_code == 400 and "closed" in r.json()["detail"]


def test_id_normalisation_and_errors(live):
    _, c, *_ = live
    assert c.get("/api/races/cd-20260606-2").status_code == 404
    assert c.get("/api/races/CD-20260606-02").status_code == 404
    r = c.get("/api/races/CD-20261399-2")
    assert r.status_code == 404 and "unconverted" not in r.json()["detail"]
    assert c.post("/api/tickets", json={"kind": "win"}).status_code == 400
    assert c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["2"], "stake": 5},
                  headers={"origin": "http://127.0.0.1:9999"}).status_code == 201

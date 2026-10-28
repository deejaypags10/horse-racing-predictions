"""Regression tests for the v2 security review findings."""
import copy
import json

import httpx
import pytest

from conftest import load
from edge.sources.twinspires import TwinSpiresSource, _parse_time, _to_float, parse_tracks
from test_service_api import live  # noqa: F401  (fixture)
from test_twinspires import DAY, ROUTES, make_source


def test_foreign_host_and_origin_refused(live):  # noqa: F811
    _, c, *_ = live
    assert c.get("/api/status", headers={"host": "rebind.evil.example:8765"}).status_code == 400
    body = {"race_id": "CD-20260606-2", "kind": "win", "selection": ["2"], "stake": 5}
    r = c.post("/api/tickets", json=body, headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    r = c.post("/api/tickets", content=json.dumps(body), headers={"content-type": "text/plain"})
    assert r.status_code == 415
    assert c.post("/api/tickets", json=body, headers={"origin": "http://127.0.0.1:8765"}).status_code == 201


@pytest.mark.parametrize("stake", [0.001, True, "1e999", None, [1]])
def test_bad_stakes(live, stake):  # noqa: F811
    _, c, *_ = live
    r = c.post("/api/tickets", json={"race_id": "CD-20260606-2", "kind": "win", "selection": ["2"], "stake": stake})
    assert r.status_code == 400


def test_track_values_cannot_escape_paths(monkeypatch, tmp_path):
    evil = [{"brisCode": "cd", "trackType": "x/../../../../tmp/pwned", "name": "Evil"},
            {"brisCode": "../etc", "trackType": "Thoroughbred", "name": "Evil2"},
            {"brisCode": "cd", "trackType": "Thoroughbred", "name": "Fine"}]
    assert [t.name for t in parse_tracks(evil, DAY)] == ["Fine"]
    raw = []
    client = httpx.Client(transport=httpx.MockTransport(
        lambda req: raw.append(req.url.raw_path) or httpx.Response(200, json={"races": []})))
    src = TwinSpiresSource("https://example.test/adw", "1", min_interval=0, client=client)
    src.capture_dir = tmp_path / "cap"
    src._get("races", code="../../x", type="a/b")
    assert raw[0].startswith(b"/adw/todays-tracks/..%2F..%2Fx/a%2Fb/races")
    written = list((tmp_path / "cap").rglob("*.json"))
    assert written and all((tmp_path / "cap") in p.parents for p in written)


def test_non_finite_and_overflow_values_are_dropped():
    assert _to_float("1e999") is None and _to_float("NaN") is None and _to_float("$1,200") == 1200.0
    assert _parse_time(99999999999999999999) is None
    assert _parse_time(float("nan")) is None


def test_nan_literals_and_oversized_responses(monkeypatch):
    def handler(request):
        if request.url.path.endswith("/todays-tracks"):
            return httpx.Response(200, content=b'[{"brisCode": "cd", "trackType": "Thoroughbred", "name": "CD", "raceCount": NaN}]')
        return httpx.Response(200, content=b"[" + b" " * 6_000_000 + b"]")
    src = TwinSpiresSource("https://example.test/adw", "1", min_interval=0, client=httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(src, "today", lambda: DAY)
    monkeypatch.setattr("time.sleep", lambda s: None)
    assert src.tracks(DAY)[0].race_count == 0
    from edge.sources.base import SourceError
    with pytest.raises(SourceError):
        src._get("races", code="cd", type="Thoroughbred")


def test_null_byte_path_is_404(live):  # noqa: F811
    _, c, *_ = live
    assert c.get("/%00").status_code == 404

from datetime import date

import httpx
import pytest

from conftest import load
from edge.domain import Breed, RaceStatus
from edge.sources.base import SourceError
from edge.sources.twinspires import (TwinSpiresSource, apply_odds, deep_link, parse_entries, parse_races,
                                     parse_results, parse_tracks)

DAY = date(2026, 6, 6)


def test_parse_tracks_filters_and_normalises():
    tracks = parse_tracks(load("twinspires/tracks.json"), DAY)
    codes = [t.code for t in tracks]
    assert codes == ["CD", "M", "LAD", "HK"]                      # greyhound + codeless dropped
    m = tracks[1]
    assert m.breed == Breed.HARNESS and m.name == "Meadowlands" and m.id == "M-20260606"
    assert tracks[3].country == "HKG"
    assert tracks[0].provider_ref == {"code": "cd", "type": "Thoroughbred", "slug": "churchill-downs"}


def test_parse_races_and_entries():
    track = parse_tracks(load("twinspires/tracks.json"), DAY)[0]
    races = parse_races(load("twinspires/races_cd.json"), track)
    assert [r.number for r in races] == [1, 2]
    assert races[0].status == RaceStatus.OFFICIAL and races[0].post_time.tzinfo is not None
    assert races[1].surface == "Turf" and races[1].purse == 90000 and races[1].distance_furlongs == 8.5
    runners = parse_entries(load("twinspires/entries_cd_2.json"))
    by = {r.program: r for r in runners}
    assert by["1A"].coupled_with == "1" and by["1"].coupled_with == "1"
    assert by["2"].live_odds.decimal == 2.8 and by["2"].morning_line.decimal == 2.6
    assert by["4"].scratched and by["5"].morning_line.decimal == 21.0
    assert by["2"].jockey == "Flavien Prat"


def test_apply_odds_and_results():
    track = parse_tracks(load("twinspires/tracks.json"), DAY)[0]
    race = parse_races(load("twinspires/races_cd.json"), track)[1]
    race.runners = parse_entries(load("twinspires/entries_cd_2.json"))
    apply_odds(race, {"odds": [{"programNumber": "3", "odds": "7-2"}, {"programNumber": "1", "odds": "2-1"}]})
    by = {r.program: r for r in race.runners}
    assert by["3"].live_odds.decimal == 4.5
    assert by["1A"].live_odds.decimal == 3.0                       # coupled runner inherits the entry price
    res = parse_results(load("twinspires/results_cd_1.json"))
    assert [f.program for f in res.finish] == ["3", "1", "2"]
    assert res.finish[0].win_pay == 8.4 and res.exotic_pays == {"exacta": 31.6, "trifecta": 88.2}
    assert parse_results(None) is None and parse_results({"finishers": []}) is None


def test_deep_link():
    track = parse_tracks(load("twinspires/tracks.json"), DAY)[1]
    race = parse_races({"races": [{"raceNumber": 5}]}, track)[0]
    assert deep_link(race) == "https://www.twinspires.com/bet/program/classic/meadowlands/m/Harness/5/advanced"


def _transport(routes: dict[str, object], calls: list[str]):
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        calls.append(path)
        for suffix, payload in routes.items():
            if path.endswith(suffix):
                if isinstance(payload, int):
                    return httpx.Response(payload)
                return httpx.Response(200, json=payload)
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def make_source(monkeypatch, routes, calls=None):
    calls = calls if calls is not None else []
    client = httpx.Client(transport=_transport(routes, calls))
    src = TwinSpiresSource("https://example.test/adw", "2800", min_interval=0, client=client)
    monkeypatch.setattr(src, "today", lambda: DAY)
    return src, calls


ROUTES = {
    "/todays-tracks": load("twinspires/tracks.json"),
    "/cd/Thoroughbred/races": load("twinspires/races_cd.json"),
    "/cd/Thoroughbred/races/2/entries": load("twinspires/entries_cd_2.json"),
    "/cd/Thoroughbred/races/1/entries": load("twinspires/entries_cd_2.json"),
    "/cd/Thoroughbred/races/1/results": load("twinspires/results_cd_1.json"),
}


def test_source_card_end_to_end_and_caching(monkeypatch):
    src, calls = make_source(monkeypatch, ROUTES)
    tracks = src.tracks(DAY)
    assert src.tracks(date(2026, 6, 7)) == []                    # program endpoints only serve today
    card = src.card(tracks[0])
    assert card[0].status == RaceStatus.OFFICIAL and card[0].result.finish[0].program == "3"
    assert len(card[1].runners) == 6
    n = len(calls)
    src.card(tracks[0])
    assert len(calls) == n                                       # served from cache
    assert src.health()["ok"]


def test_source_errors_surface(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda s: None)
    src, _ = make_source(monkeypatch, {"/todays-tracks": 503})
    with pytest.raises(SourceError):
        src.tracks(DAY)
    assert src.health()["recent_errors"][0]["kind"] == "tracks"


def test_capture_writes_raw_payloads(monkeypatch, tmp_path):
    src, _ = make_source(monkeypatch, ROUTES)
    src.capture_dir = tmp_path
    src.tracks(DAY)
    assert (tmp_path / DAY.isoformat() / "tracks.json").exists()

from datetime import date

from edge.domain import Breed
from edge.sources.archive import ArchiveSource


def test_archive_replays_recorded_day(fixtures):
    src = ArchiveSource(fixtures / "tvg", date(2026, 6, 6))
    assert src.today() == date(2026, 6, 6)
    tracks = {t.code: t for t in src.tracks(date(2026, 6, 6))}
    assert set(tracks) == {"CD", "YON"}
    assert tracks["YON"].breed == Breed.HARNESS
    card = src.card(tracks["CD"])
    assert card[0].number == 1 and card[0].post_time.tzinfo
    r = card[0].runners[0]
    assert r.jockey == "Edgar Morales" and r.morning_line.raw == "5-2"
    # replay clock starts shortly before the first post
    first = min(x.post_time for x in card)
    assert 0 < (first - src.now()).total_seconds() < 60 * 60


def test_archive_coupled_entries(fixtures):
    src = ArchiveSource(fixtures / "tvg", date(2026, 6, 5))
    t = src.tracks(date(2026, 6, 5))[0]
    race = next(r for r in src.card(t) if r.number == 4)
    progs = {r.program: r.coupled_with for r in race.runners}
    assert progs["1"] == "1" and progs["1A"] == "1"


def test_archive_defaults_to_busiest_day(fixtures):
    src = ArchiveSource(fixtures / "tvg")
    assert src.today() == date(2026, 6, 6)

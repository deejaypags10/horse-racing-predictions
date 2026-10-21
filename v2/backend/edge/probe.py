"""``edge ts-probe``: verify the TwinSpires endpoints from the current network.

Calls each endpoint for a small sample of today's tracks, saves the raw
responses under ``var/captures/<date>/`` (via the adapter's capture hook) and
reports, per endpoint, whether the call worked and which of the fields our
parsers look for were present. Use the captures to refresh test fixtures.
"""
from __future__ import annotations

from .config import Settings
from .sources.base import SourceError
from .sources.twinspires import TwinSpiresSource


def probe(sample: int = 2) -> dict:
    s = Settings.load()
    src = TwinSpiresSource(s.ts_base, s.ts_affid, s.ts_min_interval, s.capture_dir)
    report: dict = {"base": s.ts_base, "date": src.today().isoformat(), "endpoints": {}, "ok": False,
                    "capture_dir": str(s.capture_dir / src.today().isoformat())}

    def ok(name: str, **info) -> None:
        report["endpoints"][name] = {"ok": True, **info}

    def fail(name: str, exc: Exception) -> None:
        report["endpoints"][name] = {"ok": False, "error": str(exc)[:300]}

    try:
        tracks = src.tracks(src.today())
        ok("tracks", count=len(tracks), sample=[f"{t.code}/{t.provider_ref.get('type')} {t.name}" for t in tracks[:8]],
           breeds=sorted({t.breed.value for t in tracks}))
    except SourceError as exc:
        fail("tracks", exc)
        return report
    if not tracks:
        report["note"] = "tracks endpoint answered but returned no parseable tracks; inspect the capture"
        return report

    parsed_runners = 0
    for t in tracks[:sample]:
        try:
            races = src.card(t)
        except SourceError as exc:
            fail(f"card:{t.code}", exc)
            continue
        runners = [r for race in races for r in race.runners]
        parsed_runners += len(runners)
        ok(f"card:{t.code}", races=len(races), runners=len(runners),
           with_post_time=sum(1 for r in races if r.post_time),
           with_ml=sum(1 for r in runners if r.morning_line), with_live=sum(1 for r in runners if r.live_odds),
           with_jockey=sum(1 for r in runners if r.jockey), scratched=sum(1 for r in runners if r.scratched),
           with_results=sum(1 for r in races if r.result))
    report["ok"] = parsed_runners > 0
    report["health"] = src.health()
    return report

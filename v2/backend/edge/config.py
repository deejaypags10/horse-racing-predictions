"""Runtime settings, read once from environment variables (prefix ``EDGE_``).

Nothing here is secret: TwinSpires' public program data needs no
credentials. If a future source does, read it from the environment and never
log or persist it.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date
from pathlib import Path

V2_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = V2_ROOT.parent


def _path(name: str, default: Path) -> Path:
    raw = os.environ.get(name)
    return Path(raw).expanduser().resolve() if raw else default


@dataclass(frozen=True)
class Settings:
    source: str                 # "twinspires" | "archive"
    history_path: Path          # legacy TVG results parquet
    model_path: Path            # trained form model (JSON)
    db_path: Path               # SQLite: snapshots, results, tickets
    archive_dir: Path           # recorded TVG entries used by the archive source
    capture_dir: Path           # where raw TwinSpires responses are saved
    replay_date: date | None    # archive source: which recorded day to replay
    ts_base: str
    ts_affid: str
    ts_min_interval: float      # seconds between TwinSpires requests (politeness)
    web_dist: Path              # built SPA to serve
    poll: bool                  # live mode: background refresh for snapshots/results

    @classmethod
    def load(cls) -> "Settings":
        replay = os.environ.get("EDGE_REPLAY_DATE")
        return cls(
            source=os.environ.get("EDGE_SOURCE", "archive").strip().lower(),
            history_path=_path("EDGE_HISTORY_PATH", REPO_ROOT / "data" / "processed" / "us_races_cleaned.parquet"),
            model_path=_path("EDGE_MODEL_PATH", V2_ROOT / "backend" / "edge" / "model" / "artifacts" / "form_model.json"),
            db_path=_path("EDGE_DB_PATH", V2_ROOT / "var" / "edge.sqlite3"),
            archive_dir=_path("EDGE_ARCHIVE_DIR", REPO_ROOT / "scraping" / "scrapers" / "us" / "output" / "raw" / "tvg"),
            capture_dir=_path("EDGE_CAPTURE_DIR", V2_ROOT / "var" / "captures"),
            replay_date=date.fromisoformat(replay) if replay else None,
            ts_base=os.environ.get("EDGE_TS_BASE", "https://www.twinspires.com/adw").rstrip("/"),
            ts_affid=os.environ.get("EDGE_TS_AFFID", "2800"),
            ts_min_interval=float(os.environ.get("EDGE_TS_MIN_INTERVAL", "0.35")),
            web_dist=_path("EDGE_WEB_DIST", V2_ROOT / "web" / "dist"),
            poll=os.environ.get("EDGE_POLL", "1") not in ("0", "false", "no"),
        )

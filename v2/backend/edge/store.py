"""SQLite persistence: prediction snapshots, results, paper tickets.

Single-file, single-user. Every write is its own transaction; ticket rows
are append-only except for the settlement columns, so a decision can never
be silently rewritten after the fact.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

SCHEMA = """
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id     TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    post_time   TEXT,
    model       TEXT NOT NULL,
    market      TEXT NOT NULL,          -- 'live' | 'morning_line' | 'none'
    payload     TEXT NOT NULL           -- JSON: [{bi, p_model, p_market, odds}]
);
CREATE INDEX IF NOT EXISTS snapshots_race ON snapshots(race_id, captured_at);

CREATE TABLE IF NOT EXISTS results (
    race_id     TEXT PRIMARY KEY,
    recorded_at TEXT NOT NULL,
    payload     TEXT NOT NULL           -- JSON RaceResult + race conditions for history
);

CREATE TABLE IF NOT EXISTS tickets (
    id           TEXT PRIMARY KEY,
    created_at   TEXT NOT NULL,
    race_id      TEXT NOT NULL,
    track_name   TEXT NOT NULL,
    race_number  INTEGER NOT NULL,
    post_time    TEXT,
    kind         TEXT NOT NULL,         -- win | place | show | exacta | trifecta
    selection    TEXT NOT NULL,         -- JSON list of program numbers (order matters for exotics)
    stake        REAL NOT NULL,
    odds_taken   REAL,                  -- decimal, win/place/show only
    model_prob   REAL,
    fair_decimal REAL,
    model        TEXT,
    note         TEXT,
    status       TEXT NOT NULL DEFAULT 'open',   -- open | won | lost | void
    payout       REAL,
    closing_odds REAL,
    settled_at   TEXT
);
CREATE INDEX IF NOT EXISTS tickets_race ON tickets(race_id);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path):
        self.path = path
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(SCHEMA)

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._conn.execute("BEGIN IMMEDIATE")
            try:
                yield self._conn
                self._conn.execute("COMMIT")
            except BaseException:
                self._conn.execute("ROLLBACK")
                raise

    def _query(self, sql: str, args: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self._conn.execute(sql, args))

    # -- snapshots -------------------------------------------------------------
    def add_snapshot(self, race_id: str, post_time: str | None, model: str, market: str, payload: list[dict]) -> None:
        with self.tx() as c:
            c.execute("INSERT INTO snapshots(race_id, captured_at, post_time, model, market, payload) VALUES (?,?,?,?,?,?)",
                      (race_id, _now(), post_time, model, market, json.dumps(payload)))

    def last_snapshot(self, race_id: str, before: str | None = None) -> dict | None:
        sql = "SELECT * FROM snapshots WHERE race_id = ?"
        args: tuple = (race_id,)
        if before:
            sql += " AND captured_at <= ?"
            args += (before,)
        rows = self._query(sql + " ORDER BY captured_at DESC, id DESC LIMIT 1", args)
        return _snap(rows[0]) if rows else None

    def snapshot_count(self, race_id: str) -> int:
        return int(self._query("SELECT COUNT(*) FROM snapshots WHERE race_id = ?", (race_id,))[0][0])

    def pre_post_snapshots(self) -> list[dict]:
        """Latest snapshot taken before post time, for every race with a result."""
        rows = self._query(
            """SELECT s.* FROM snapshots s JOIN results r ON r.race_id = s.race_id
               WHERE s.post_time IS NULL OR s.captured_at <= s.post_time
               ORDER BY s.race_id, s.captured_at""")
        latest: dict[str, sqlite3.Row] = {}
        for r in rows:
            latest[r["race_id"]] = r
        return [_snap(r) for r in latest.values()]

    # -- results ---------------------------------------------------------------
    def put_result(self, race_id: str, payload: dict) -> bool:
        with self.tx() as c:
            cur = c.execute("INSERT OR IGNORE INTO results(race_id, recorded_at, payload) VALUES (?,?,?)",
                            (race_id, _now(), json.dumps(payload)))
            return cur.rowcount > 0

    def result(self, race_id: str) -> dict | None:
        rows = self._query("SELECT payload FROM results WHERE race_id = ?", (race_id,))
        return json.loads(rows[0]["payload"]) if rows else None

    def all_results(self) -> dict[str, dict]:
        return {r["race_id"]: json.loads(r["payload"]) for r in self._query("SELECT race_id, payload FROM results")}

    # -- tickets ---------------------------------------------------------------
    def add_ticket(self, t: dict[str, Any]) -> dict:
        tid = uuid.uuid4().hex[:12]
        with self.tx() as c:
            c.execute(
                """INSERT INTO tickets(id, created_at, race_id, track_name, race_number, post_time, kind, selection,
                   stake, odds_taken, model_prob, fair_decimal, model, note)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (tid, _now(), t["race_id"], t["track_name"], t["race_number"], t.get("post_time"), t["kind"],
                 json.dumps(t["selection"]), t["stake"], t.get("odds_taken"), t.get("model_prob"),
                 t.get("fair_decimal"), t.get("model"), t.get("note")))
        return self.ticket(tid)  # type: ignore[return-value]

    def ticket(self, tid: str) -> dict | None:
        rows = self._query("SELECT * FROM tickets WHERE id = ?", (tid,))
        return _ticket(rows[0]) if rows else None

    def tickets(self) -> list[dict]:
        return [_ticket(r) for r in self._query("SELECT * FROM tickets ORDER BY created_at DESC")]

    def open_tickets(self) -> list[dict]:
        return [_ticket(r) for r in self._query("SELECT * FROM tickets WHERE status = 'open' ORDER BY created_at")]

    def settle_ticket(self, tid: str, status: str, payout: float, closing_odds: float | None) -> None:
        with self.tx() as c:
            c.execute("UPDATE tickets SET status = ?, payout = ?, closing_odds = ?, settled_at = ? WHERE id = ? AND status = 'open'",
                      (status, payout, closing_odds, _now(), tid))

    def delete_ticket(self, tid: str) -> bool:
        """Only unsettled tickets can be withdrawn."""
        with self.tx() as c:
            return c.execute("DELETE FROM tickets WHERE id = ? AND status = 'open'", (tid,)).rowcount > 0


def _snap(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["payload"] = json.loads(d["payload"])
    return d


def _ticket(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["selection"] = json.loads(d["selection"])
    return d

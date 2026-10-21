"""Background refresh for live mode.

Keeps the data the track record and ticket settlement depend on flowing even
when nobody has a race open:

* every ``interval`` seconds, list today's tracks;
* for tracks with a race inside ``window`` minutes of post, or a race that
  went off recently but is not yet official, refresh the card. Refreshing
  predicts each open race (which records a pre-post snapshot) and stores any
  official result (which settles tickets and extends horse history).

Archive/replay mode never starts the poller.
"""
from __future__ import annotations

import logging
import threading
from datetime import timedelta

from .domain import RaceStatus
from .sources.base import SourceError

log = logging.getLogger(__name__)


class Poller:
    def __init__(self, service, interval: float = 45.0, window_min: int = 20, settle_min: int = 90):
        self.service = service
        self.interval = interval
        self.window = timedelta(minutes=window_min)
        self.settle = timedelta(minutes=settle_min)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.cycles = 0
        self.last_error: str | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, name="edge-poller", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.tick()
                self.last_error = None
            except Exception as exc:  # never let the thread die
                self.last_error = f"{type(exc).__name__}: {exc}"
                log.exception("poller tick failed")
            self._stop.wait(self.interval)

    def tick(self) -> int:
        svc = self.service
        now = svc.source.now()
        refreshed = 0
        for track in svc.tracks():
            races = svc.card(track)  # cached; cheap when nothing is due
            due = any(
                r.post_time and (
                    (r.status == RaceStatus.OPEN and r.post_time - now <= self.window and r.post_time > now - timedelta(minutes=5))
                    or (r.status != RaceStatus.OFFICIAL and now - self.settle <= r.post_time <= now))
                for r in races)
            if not due:
                continue
            svc.invalidate(track.id)
            try:
                for r in svc.card(track):
                    if r.status == RaceStatus.OPEN:
                        svc.predict(r)
                refreshed += 1
            except SourceError as exc:
                log.warning("poller: %s: %s", track.code, exc)
        self.cycles += 1
        return refreshed

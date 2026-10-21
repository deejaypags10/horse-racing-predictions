"""Application service: the only thing the HTTP layer talks to.

Owns the source, history, model and store, caches cards briefly, turns
domain objects into the JSON shapes documented in docs/API.md, records
prediction snapshots, and settles paper tickets when results arrive.
"""
from __future__ import annotations

import logging
import math
import threading
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .config import Settings
from .domain import Race, RaceStatus, Track, parse_race_id, parse_track_id
from .features import breed_group, horse_key, normalise_surface
from .history import History, RunRow
from .model.logit import FormModel
from .model.predict import RacePrediction, predict_race, to_us
from .odds import parse_odds
from .sources.archive import ArchiveSource
from .sources.base import RaceSource, SourceError
from .sources.twinspires import TwinSpiresSource, deep_link
from .store import Store

log = logging.getLogger(__name__)

TICKET_KINDS = {"win": 1, "place": 1, "show": 1, "exacta": 2, "trifecta": 3}
SNAPSHOT_EVERY = timedelta(seconds=60)


class NotFound(LookupError):
    pass


class BadRequest(ValueError):
    pass


@dataclass
class _Cached:
    at: float
    value: object


def build_source(settings: Settings) -> RaceSource:
    if settings.source == "twinspires":
        return TwinSpiresSource(settings.ts_base, settings.ts_affid, settings.ts_min_interval, settings.capture_dir)
    return ArchiveSource(settings.archive_dir, settings.replay_date)


class Service:
    def __init__(self, settings: Settings, source: RaceSource | None = None, history: History | None = None,
                 model: FormModel | None = None, store: Store | None = None):
        self.settings = settings
        self.source = source or build_source(settings)
        self.store = store or Store(settings.db_path)
        self.model = model or self._load_model(settings.model_path)
        self.history = history if history is not None else History.from_sources(
            settings.history_path, self._result_runs())
        self._cache: dict[str, _Cached] = {}
        self._lock = threading.RLock()
        self._last_snapshot: dict[str, datetime] = {}
        self.started_at = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ setup
    @staticmethod
    def _load_model(path: Path) -> FormModel:
        try:
            return FormModel.load(path)
        except FileNotFoundError:
            log.warning("no trained model at %s; predictions fall back to the market only", path)
        except ValueError as exc:
            log.error("%s", exc)
        return FormModel.null()

    @property
    def live(self) -> bool:
        return self.source.name == "twinspires"

    def _ttl(self, kind: str) -> float:
        if not self.live:
            return 3600.0
        return {"tracks": 60.0, "card": 20.0}[kind]

    def _cached(self, key: str, kind: str, fn):
        with self._lock:
            hit = self._cache.get(key)
            if hit and time.monotonic() - hit.at < self._ttl(kind):
                return hit.value
        value = fn()
        with self._lock:
            self._cache[key] = _Cached(time.monotonic(), value)
        return value

    def invalidate(self, track_id: str) -> None:
        with self._lock:
            self._cache.pop(f"card:{track_id}", None)

    # ------------------------------------------------------------- lookups
    def today(self) -> date:
        return self.source.today()

    def tracks(self, day: date | None = None) -> list[Track]:
        day = day or self.today()
        return self._cached(f"tracks:{day}", "tracks", lambda: self.source.tracks(day))

    def track(self, track_id: str) -> Track:
        try:
            code, day = parse_track_id(track_id)
        except ValueError as exc:
            raise NotFound(str(exc)) from exc
        for t in self.tracks(day):
            if t.code == code:
                return t
        raise NotFound(f"no card for {code} on {day}")

    def card(self, track: Track) -> list[Race]:
        races = self._cached(f"card:{track.id}", "card", lambda: self.source.card(track))
        for r in races:
            self._apply_now(r)
            if r.result and r.status == RaceStatus.OFFICIAL:
                self._on_result(r)
        return races

    def _apply_now(self, race: Race) -> None:
        """Archive races change status as the replay clock passes post time."""
        if self.live or race.status == RaceStatus.OFFICIAL or not race.post_time:
            return
        race.status = RaceStatus.CLOSED if self.source.now() > race.post_time + timedelta(minutes=2) else RaceStatus.OPEN

    def race(self, race_id: str) -> tuple[Track, Race, list[Race]]:
        try:
            code, day, number = parse_race_id(race_id)
        except ValueError as exc:
            raise NotFound(str(exc)) from exc
        from .domain import make_track_id
        track = self.track(make_track_id(code, day))
        races = self.card(track)
        for r in races:
            if r.number == number:
                return track, r, races
        raise NotFound(f"{track.name} has no race {number} on {day}")

    # ------------------------------------------------------------- views
    def predict(self, race: Race, whatif: frozenset[str] = frozenset()) -> RacePrediction:
        pred = predict_race(race, self.history, self.model, whatif)
        if not whatif and race.status == RaceStatus.OPEN:
            self._maybe_snapshot(race, pred)
        return pred

    def _maybe_snapshot(self, race: Race, pred: RacePrediction) -> None:
        if pred.market != "live" or not pred.interests:
            return
        now = datetime.now(timezone.utc)
        last = self._last_snapshot.get(race.id)
        if last and now - last < SNAPSHOT_EVERY:
            return
        self._last_snapshot[race.id] = now
        self.store.add_snapshot(
            race.id, race.post_time.isoformat() if race.post_time else None, pred.model_version, pred.market,
            [{"bi": i.key, "p_model": round(i.p_model, 5), "p_market": round(i.p_market or 0, 5),
              "form_term": round(i.form_term, 5), "odds": i.price} for i in pred.interests])

    def board(self, day: date | None = None) -> dict:
        day = day or self.today()
        now = self.source.now()
        tracks = self.tracks(day)
        rows, upcoming = [], []
        for t in tracks:
            try:
                races = self.card(t)
            except SourceError as exc:
                rows.append({**self._track_dto(t), "error": str(exc), "races": []})
                continue
            except Exception as exc:  # malformed provider data for one track
                log.exception("board: %s failed", t.code)
                rows.append({**self._track_dto(t), "error": f"could not read this card ({type(exc).__name__})", "races": []})
                continue
            nxt = next((r for r in races if r.status == RaceStatus.OPEN and r.post_time and r.post_time >= now - timedelta(minutes=2)), None)
            official = sum(1 for r in races if r.status == RaceStatus.OFFICIAL)
            overlays = 0
            for r in races:
                if r.status != RaceStatus.OPEN or not r.post_time:
                    continue
                if r.post_time - now > timedelta(hours=3):
                    continue
                pred = self.predict(r)
                best = _best_value(pred)
                if best and r.post_time - now <= timedelta(minutes=60):
                    overlays += 1
                top = max(pred.interests, key=lambda i: i.p_model) if pred.interests else None
                upcoming.append({
                    "race_id": r.id, "track_id": t.id, "track_code": t.code, "track_name": t.name,
                    "breed": t.breed.value, "number": r.number, "post_time": _iso(r.post_time),
                    "mtp": _mtp(r.post_time, now), "market": pred.market,
                    "top_pick": _pick_dto(top), "best_value": _pick_dto(best),
                })
            rows.append({
                **self._track_dto(t),
                "next_race": None if not nxt else {"race_id": nxt.id, "number": nxt.number,
                                                   "post_time": _iso(nxt.post_time), "mtp": _mtp(nxt.post_time, now)},
                "official": official, "overlays_next_hour": overlays,
                "surfaces": sorted({r.surface for r in races if r.surface}),
                "first_post": _iso(min((r.post_time for r in races if r.post_time), default=None)),
                "last_post": _iso(max((r.post_time for r in races if r.post_time), default=None)),
            })
        upcoming.sort(key=lambda u: u["post_time"] or "")
        upcoming = [u for u in upcoming if u["mtp"] is not None and u["mtp"] >= -2][:12]
        return {"date": day.isoformat(), "now": _iso(now), "tracks": rows, "next_up": upcoming, "status": self.status()}

    def track_view(self, track_id: str) -> dict:
        t = self.track(track_id)
        now = self.source.now()
        races = self.card(t)
        out = []
        next_open = next((r.number for r in races if r.status == RaceStatus.OPEN and r.post_time and r.post_time >= now - timedelta(minutes=2)), None)
        for r in races:
            pred = self.predict(r)
            top = max(pred.interests, key=lambda i: i.p_model) if pred.interests else None
            out.append({
                **_race_header(r, now), "is_next": r.number == next_open,
                "market": pred.market, "evidence": pred.evidence,
                "top_pick": _pick_dto(top), "best_value": _pick_dto(_best_value(pred)),
                "finish": [f.program for f in r.result.finish[:4]] if r.result else [],
            })
        return {"track": self._track_dto(t), "now": _iso(now), "races": out, "status": self.status()}

    def race_view(self, race_id: str, whatif: frozenset[str] = frozenset()) -> dict:
        t, r, races = self.race(race_id)
        now = self.source.now()
        pred = self.predict(r, whatif)
        by_bi = {i.key: i for i in pred.interests}
        runners = []
        for ru in r.runners:
            bi = by_bi.get(ru.coupled_with or ru.program)
            past = self.history.past(horse_key(ru.name, breed_group(r.breed.value)), before=r.card_date, limit=5)
            runners.append({
                "program": ru.program, "interest": ru.coupled_with or ru.program, "post": ru.post,
                "name": ru.name, "jockey": ru.jockey, "trainer": ru.trainer, "sire": ru.sire, "dam": ru.dam,
                "age": ru.age, "sex": ru.sex, "weight": ru.weight,
                "morning_line": ru.morning_line.raw if ru.morning_line else None,
                "morning_line_decimal": ru.morning_line.decimal if ru.morning_line else None,
                "live_odds": ru.live_odds.raw if ru.live_odds else None,
                "live_decimal": ru.live_odds.decimal if ru.live_odds else None,
                "scratched": ru.scratched, "whatif_scratched": ru.program in whatif and not ru.scratched,
                "saddle_color": ru.saddle_color, "saddle_text_color": ru.saddle_text_color,
                "coupled": bool(ru.coupled_with),
                "model": None if bi is None else _interest_dto(bi),
                "recent": [{"date": p.day.isoformat(), "track": p.track, "surface": p.surface,
                            "dist_f": p.dist_f, "position": p.position or None, "field": p.field_size,
                            "favorite": p.favorite} for p in reversed(past)],
            })
        exotics = {
            "exacta": [{"combo": list(c), "p": round(p, 5), "fair_2": round(2.0 / p, 2)} for c, p in pred.exacta],
            "trifecta": [{"combo": list(c), "p": round(p, 5), "fair_1": round(1.0 / p, 2)} for c, p in pred.trifecta],
        }
        result = None
        if r.result:
            result = {"finish": [f.model_dump() for f in r.result.finish], "exotics": r.result.exotic_pays}
        idx = [x.number for x in races]
        pos = idx.index(r.number)
        return {
            "race": {**_race_header(r, now), "track_id": t.id, "track_name": t.name, "track_code": t.code,
                     "country": t.country, "prev": races[pos - 1].id if pos > 0 else None,
                     "next": races[pos + 1].id if pos + 1 < len(races) else None,
                     "race_numbers": [{"id": x.id, "number": x.number, "status": x.status.value} for x in races],
                     "deep_link": None if not self.live else deep_link(r, t),
                     "fetched_at": _iso(r.fetched_at), "odds_updated_at": _iso(r.odds_updated_at)},
            "now": _iso(now),
            "prediction": {
                "market": pred.market, "model_version": pred.model_version, "weights": pred.weights,
                "evidence": pred.evidence, "coverage": round(pred.coverage, 3),
                "overround": None if pred.overround is None else round(pred.overround, 4),
                "whatif": pred.scratched_by_user, "active_interests": len(pred.interests),
                "sum_p": round(sum(i.p_model for i in pred.interests), 6),
            },
            "runners": runners, "exotics": exotics, "result": result, "status": self.status(),
        }

    def _track_dto(self, t: Track) -> dict:
        return {"id": t.id, "code": t.code, "name": t.name, "breed": t.breed.value, "country": t.country,
                "date": t.card_date.isoformat(), "race_count": t.race_count}

    # ------------------------------------------------------------- tickets
    def create_ticket(self, body: dict) -> dict:
        kind = str(body.get("kind", "")).lower()
        if kind not in TICKET_KINDS:
            raise BadRequest(f"kind must be one of {sorted(TICKET_KINDS)}")
        sel = body.get("selection")
        if not isinstance(sel, list) or len(sel) != TICKET_KINDS[kind] or len(set(map(str, sel))) != len(sel):
            raise BadRequest(f"{kind} needs exactly {TICKET_KINDS[kind]} distinct selections")
        sel = [str(s).upper() for s in sel]
        raw_stake = body.get("stake")
        if isinstance(raw_stake, bool) or not isinstance(raw_stake, (int, float, str)):
            raise BadRequest("stake must be a number")
        try:
            stake = round(float(raw_stake), 2)
        except (TypeError, ValueError):
            raise BadRequest("stake must be a number") from None
        if not math.isfinite(stake) or not (0.01 <= stake <= 100_000):
            raise BadRequest("stake must be between $0.01 and $100,000")
        t, r, _ = self.race(str(body.get("race_id", "")))
        if r.status != RaceStatus.OPEN:
            raise BadRequest("betting on this race is closed")
        pred = self.predict(r)
        by_bi = {i.key: i for i in pred.interests}
        for s in sel:
            if s not in by_bi:
                raise BadRequest(f"#{s} is not an active betting interest in this race")
        odds_taken = None
        if body.get("odds_taken") not in (None, ""):
            o = parse_odds(body["odds_taken"])
            if o is None:
                raise BadRequest("price taken must look like 5-2, 9/5 or 12")
            odds_taken = o.decimal
        model_prob = None
        if kind == "win":
            model_prob = by_bi[sel[0]].p_model
        elif kind == "place":
            model_prob = by_bi[sel[0]].p_top2
        elif kind == "show":
            model_prob = by_bi[sel[0]].p_top3
        else:
            combos = pred.exacta if kind == "exacta" else pred.trifecta
            model_prob = next((p for c, p in combos if list(c) == sel), None)
            if model_prob is None:
                full = predict_race(r, self.history, self.model)
                from .model.orders import order_probabilities
                import numpy as np
                op = order_probabilities(np.array([i.p_model for i in full.interests]))
                ix = [[i.key for i in full.interests].index(s) for s in sel]
                model_prob = float(op.exacta[ix[0], ix[1]] if kind == "exacta" else
                                   (op.trifecta[ix[0], ix[1], ix[2]] if op.trifecta is not None else 0.0))
        note = str(body.get("note") or "")[:280] or None
        return self.store.add_ticket({
            "race_id": r.id, "track_name": t.name, "race_number": r.number, "post_time": _iso(r.post_time),
            "kind": kind, "selection": sel, "stake": stake, "odds_taken": odds_taken,
            "model_prob": model_prob, "fair_decimal": (1.0 / model_prob) if model_prob else None,
            "model": pred.model_version, "note": note,
        })

    def tickets_view(self) -> dict:
        self._settle_from_known_results()
        tickets = self.store.tickets()
        settled = [x for x in tickets if x["status"] in ("won", "lost")]
        staked = sum(x["stake"] for x in settled)
        returned = sum(x["payout"] or 0 for x in settled)
        clvs = [x["clv"] for x in map(_with_clv, settled) if x.get("clv") is not None]
        return {
            "tickets": [_with_clv(x) for x in tickets],
            "summary": {
                "count": len(tickets), "settled": len(settled), "open": sum(1 for x in tickets if x["status"] == "open"),
                "staked": round(staked, 2), "returned": round(returned, 2), "net": round(returned - staked, 2),
                "roi": round((returned - staked) / staked, 4) if staked else None,
                "roi_ci": _bootstrap_roi(settled) if len(settled) >= 10 else None,
                "avg_clv": round(sum(clvs) / len(clvs), 4) if clvs else None,
                "beat_close": sum(1 for c in clvs if c > 0), "clv_n": len(clvs),
            },
        }

    def delete_ticket(self, tid: str) -> None:
        if not self.store.delete_ticket(tid):
            raise NotFound("no open ticket with that id")

    # ------------------------------------------------------------- results
    def _on_result(self, race: Race) -> None:
        if not race.result:
            return
        payload = {
            "finish": [f.model_dump() for f in race.result.finish], "exotics": race.result.exotic_pays,
            "track": race.track_code, "breed": race.breed.value, "surface": race.surface,
            "dist_f": race.distance_furlongs, "purse": race.purse, "date": race.card_date.isoformat(),
            "runners": [{"program": r.program, "name": r.name, "post": r.post, "scratched": r.scratched,
                         "interest": r.coupled_with or r.program,
                         "final_decimal": r.live_odds.decimal if r.live_odds else None} for r in race.runners],
        }
        if self.store.put_result(race.id, payload):
            self._settle_race(race.id, payload)

    def _settle_from_known_results(self) -> None:
        results = None
        for t in self.store.open_tickets():
            results = results if results is not None else self.store.all_results()
            if t["race_id"] in results:
                self._settle_race(t["race_id"], results[t["race_id"]])

    def _settle_race(self, race_id: str, res: dict) -> None:
        finish = {f["program"]: f for f in res.get("finish", [])}
        order = [f["program"] for f in sorted(res.get("finish", []), key=lambda f: f["position"])]
        interest = {r["program"]: r["interest"] for r in res.get("runners", [])}
        active_bi = {r["interest"] for r in res.get("runners", []) if not r.get("scratched")}
        ord_bi = [interest.get(p, p) for p in order]
        snap = self.store.last_snapshot(race_id)
        closing = {x["bi"]: x.get("odds") for x in snap["payload"]} if snap else {}
        final = {r["interest"]: r.get("final_decimal") for r in res.get("runners", []) if r.get("final_decimal")}
        for t in self.store.open_tickets():
            if t["race_id"] != race_id:
                continue
            sel, kind, stake = t["selection"], t["kind"], t["stake"]
            if any(s not in active_bi for s in sel):
                self.store.settle_ticket(t["id"], "void", stake, None)
                continue
            payout = 0.0
            lead = finish.get(sel[0]) or next((finish[p] for p in order if interest.get(p, p) == sel[0]), None)
            if kind == "win" and ord_bi[:1] == sel:
                pay = lead.get("win_pay") if lead else None
                payout = stake * pay / 2.0 if pay else stake * (t["odds_taken"] or 0)
            elif kind == "place" and sel[0] in ord_bi[:2]:
                pay = lead.get("place_pay") if lead else None
                payout = stake * pay / 2.0 if pay else 0.0
            elif kind == "show" and sel[0] in ord_bi[:3]:
                pay = lead.get("show_pay") if lead else None
                payout = stake * pay / 2.0 if pay else 0.0
            elif kind in ("exacta", "trifecta") and ord_bi[:len(sel)] == sel:
                pay = res.get("exotics", {}).get(kind)
                base = 2.0 if kind == "exacta" else 1.0
                payout = stake * pay / base if pay else 0.0
            close = closing.get(sel[0]) or final.get(sel[0]) if kind == "win" else None
            self.store.settle_ticket(t["id"], "won" if payout > 0 else "lost", round(payout, 2), close)

    def _result_runs(self) -> list[RunRow]:
        rows: list[RunRow] = []
        for race_id, res in self.store.all_results().items():
            try:
                day = date.fromisoformat(res["date"])
            except (KeyError, ValueError):
                continue
            pos = {f["program"]: f["position"] for f in res.get("finish", [])}
            active = [r for r in res.get("runners", []) if not r.get("scratched")]
            fav = min(active, key=lambda r: r.get("final_decimal") or 1e9)["program"] if active else None
            for r in active:
                rows.append(RunRow(
                    key=horse_key(r["name"], breed_group(res.get("breed", ""))), day=day, race_id=race_id,
                    track=res.get("track", ""), breed=res.get("breed", ""), surface=normalise_surface(res.get("surface")),
                    dist_f=res.get("dist_f"), purse=res.get("purse"), field_size=len(active),
                    position=int(pos.get(r["program"], 0)), favorite=r["program"] == fav, post=r.get("post")))
        return rows

    # ------------------------------------------------------------- meta
    def status(self) -> dict:
        h = self.source.health()
        return {
            "source": self.source.name, "live": self.live, "ok": h.get("ok", True),
            "replay_date": h.get("replay_date"), "detail": h.get("detail"),
            "last_success": h.get("last_success"), "recent_errors": h.get("recent_errors", []),
            "model_version": self.model.version, "model_loaded": bool(self.model.breeds),
            "history_runs": self.history.n_runs, "history_horses": self.history.n_horses,
            "history_through": self.history.last_day.isoformat() if self.history.last_day else None,
        }

    def model_card(self) -> dict:
        meta = self.model.meta or {}
        record = self._track_record()
        return {"version": self.model.version, "features": list(self.model.features), "meta": meta,
                "track_record": record, "blend": __import__("edge.model.predict", fromlist=["BLEND"]).BLEND}

    def _track_record(self) -> dict:
        """Live, out-of-sample record from pre-post snapshots and results."""
        snaps = self.store.pre_post_snapshots()
        results = self.store.all_results()
        ll_m, ll_k, n = 0.0, 0.0, 0
        for s in snaps:
            res = results.get(s["race_id"])
            if not res or not res.get("finish"):
                continue
            winner_prog = min(res["finish"], key=lambda f: f["position"])["program"]
            interest = {r["program"]: r["interest"] for r in res.get("runners", [])}
            w = interest.get(winner_prog, winner_prog)
            row = next((x for x in s["payload"] if x["bi"] == w), None)
            if not row or not row["p_model"] or not row["p_market"]:
                continue
            ll_m += -math.log(row["p_model"])
            ll_k += -math.log(row["p_market"])
            n += 1
        return {"races": n, "log_loss_model": round(ll_m / n, 4) if n else None,
                "log_loss_market": round(ll_k / n, 4) if n else None}


# ----------------------------------------------------------------- helpers

def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def _mtp(post: datetime | None, now: datetime) -> int | None:
    if not post:
        return None
    return int(math.floor((post - now).total_seconds() / 60.0))


def _race_header(r: Race, now: datetime) -> dict:
    return {"id": r.id, "number": r.number, "post_time": _iso(r.post_time), "mtp": _mtp(r.post_time, now),
            "status": r.status.value, "distance": r.distance, "distance_furlongs": r.distance_furlongs,
            "surface": r.surface, "race_class": r.race_class, "race_name": r.race_name, "purse": r.purse,
            "breed": r.breed.value, "field": len(r.active_runners), "date": r.card_date.isoformat()}


def _best_value(pred: RacePrediction):
    vals = [i for i in pred.interests if i.value]
    return max(vals, key=lambda i: i.edge_pts or 0) if vals else None


def _pick_dto(i) -> dict | None:
    if i is None:
        return None
    return {"program": i.key, "name": i.names[0], "p_model": round(i.p_model, 4),
            "edge_pts": None if i.edge_pts is None else round(i.edge_pts, 2), "evidence": i.evidence}


def _interest_dto(i) -> dict:
    return {
        "key": i.key, "p_model": round(i.p_model, 5), "p_market": None if i.p_market is None else round(i.p_market, 5),
        "p_form": round(i.p_form, 5), "p_top2": round(i.p_top2, 5), "p_top3": round(i.p_top3, 5),
        "fair_decimal": None if i.fair is None else round(i.fair, 3), "fair_us": to_us(i.fair),
        "min_price_decimal": None if i.min_price is None else round(i.min_price, 3), "min_price_us": to_us(i.min_price),
        "price_decimal": i.price, "price_source": i.price_source,
        "edge_pts": None if i.edge_pts is None else round(i.edge_pts, 2),
        "exp_return": None if i.exp_return is None else round(i.exp_return, 4),
        "value": i.value, "evidence": i.evidence, "starts": i.starts, "rank": i.rank,
    }


def _with_clv(t: dict) -> dict:
    t = dict(t)
    t["clv"] = None
    if t["kind"] == "win" and t.get("odds_taken") and t.get("closing_odds"):
        # Closing-line value in probability points: market chance at close minus
        # chance implied by the price taken. Positive = beat the close.
        t["clv"] = round(100.0 * (1.0 / t["closing_odds"] - 1.0 / t["odds_taken"]), 3)
    return t


def _bootstrap_roi(settled: list[dict], n: int = 2000) -> list[float]:
    import random
    rng = random.Random(7)
    vals = []
    for _ in range(n):
        sample = [rng.choice(settled) for _ in settled]
        st = sum(x["stake"] for x in sample)
        vals.append((sum(x["payout"] or 0 for x in sample) - st) / st if st else 0.0)
    vals.sort()
    return [round(vals[int(0.025 * n)], 4), round(vals[int(0.975 * n)], 4)]

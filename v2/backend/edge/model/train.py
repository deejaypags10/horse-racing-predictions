"""Train and evaluate the form model on the results archive.

Walk-forward protocol (no random splits, no same-day leakage):

1. Build features for every race chronologically. A day's races see only
   runs from strictly earlier days, then that day's runs join the history.
2. Evaluate: fit on races before ``--test-from``; score races on/after it.
3. Production: refit on everything and save JSON coefficients plus a model
   card with the held-out metrics.

Only races whose recorded runner count equals the declared field size and
that have exactly one winner are used, so the likelihood is over the true
field (the archive omits runners in ~40% of races).
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from ..features import FEATURES, PastRun, RaceContext, runner_features
from ..history import load_archive
from .logit import BreedModel, FormModel, fit_breed, race_softmax

log = logging.getLogger(__name__)

BREEDS = ("thoroughbred", "harness", "quarter_horse")


@dataclass
class Dataset:
    X: np.ndarray
    starts: np.ndarray          # race offsets
    winner: np.ndarray          # absolute row index of each race's winner
    days: np.ndarray            # race day per race
    breed: np.ndarray           # breed per race
    favorite: np.ndarray        # per row: was the betting favourite
    second: np.ndarray          # absolute row index of runner-up, -1 if unknown
    has_hist: np.ndarray        # per row


def build_dataset(runs: pd.DataFrame, max_history: int = 20) -> Dataset:
    t0 = time.time()
    runs = runs.sort_values(["day", "race_id", "post"], kind="mergesort")
    hist: dict[str, list[PastRun]] = defaultdict(list)
    rows, starts, winners, seconds, days, breeds, favs, hh = [], [], [], [], [], [], [], []
    n_rows = 0
    for day, day_df in runs.groupby("day", sort=True):
        pending: list[tuple[str, PastRun]] = []
        for race_id, r in day_df.groupby("race_id", sort=False):
            keys = r["key"].tolist()
            pos = r["position"].to_numpy()
            fs = int(r["field_size"].iloc[0])
            track = r["track"].iloc[0]
            surface = r["surface"].iloc[0]
            dist = r["dist_f"].iloc[0]
            dist = None if dist is None or (isinstance(dist, float) and math.isnan(dist)) else float(dist)
            purse = r["purse"].iloc[0]
            purse = None if purse is None or pd.isna(purse) else float(purse)
            fav = r["favorite"].to_numpy()
            posts = r["post"].to_numpy()
            for k, p, f in zip(keys, pos, fav):
                pending.append((k, PastRun(day, track, surface, dist, purse, fs, int(p), bool(f))))
            usable = (
                len(r) == fs and fs >= 2 and (pos == 1).sum() == 1 and len(set(keys)) == len(keys)
            )
            if not usable:
                continue
            ctx = RaceContext(day, track, surface, dist, purse, fs)
            starts.append(n_rows)
            for k, p, f, post in zip(keys, pos, fav, posts):
                past = hist[k][-max_history:]
                rows.append(runner_features(past, ctx, None if pd.isna(post) else int(post)))
                favs.append(bool(f))
                hh.append(bool(past))
            winners.append(n_rows + int(np.flatnonzero(pos == 1)[0]))
            sec = np.flatnonzero(pos == 2)
            seconds.append(n_rows + int(sec[0]) if len(sec) == 1 else -1)
            days.append(day)
            breeds.append(r["breed"].iloc[0])
            n_rows += len(r)
        for k, run in pending:
            hist[k].append(run)
    log.info("dataset: %d races, %d runners in %.1fs", len(starts), n_rows, time.time() - t0)
    return Dataset(
        X=np.vstack(rows) if rows else np.zeros((0, len(FEATURES))),
        starts=np.array(starts, dtype=int),
        winner=np.array(winners, dtype=int),
        days=np.array(days),
        breed=np.array(breeds),
        favorite=np.array(favs, dtype=bool),
        second=np.array(seconds, dtype=int),
        has_hist=np.array(hh, dtype=bool),
    )


def _subset(ds: Dataset, race_mask: np.ndarray) -> Dataset:
    """Select races (and their rows), re-basing offsets."""
    bounds = np.append(ds.starts, len(ds.X))
    idx = np.flatnonzero(race_mask)
    row_parts, new_starts, new_win, new_sec = [], [], [], []
    off = 0
    for r in idx:
        a, b = bounds[r], bounds[r + 1]
        row_parts.append(np.arange(a, b))
        new_starts.append(off)
        new_win.append(off + ds.winner[r] - a)
        new_sec.append(off + ds.second[r] - a if ds.second[r] >= 0 else -1)
        off += b - a
    rows = np.concatenate(row_parts) if row_parts else np.zeros(0, dtype=int)
    return Dataset(ds.X[rows], np.array(new_starts, dtype=int), np.array(new_win, dtype=int),
                   ds.days[idx], ds.breed[idx], ds.favorite[rows], np.array(new_sec, dtype=int), ds.has_hist[rows])


def fit(ds: Dataset, l2: float = 1.0) -> dict[str, BreedModel]:
    models = {}
    for b in BREEDS:
        sub = _subset(ds, ds.breed == b)
        if len(sub.starts) < 200:
            log.warning("breed %s: only %d races, skipping", b, len(sub.starts))
            continue
        models[b] = fit_breed(sub.X, sub.starts, sub.winner, l2=l2)
        log.info("breed %s: fitted on %d races", b, len(sub.starts))
    return models


def evaluate(models: dict[str, BreedModel], ds: Dataset) -> dict:
    """Held-out metrics per breed and overall."""
    out: dict[str, dict] = {}
    calib_all: list[tuple[np.ndarray, np.ndarray]] = []
    for b in BREEDS + ("all",):
        sub = ds if b == "all" else _subset(ds, ds.breed == b)
        n = len(sub.starts)
        if n == 0:
            continue
        scores = np.zeros(len(sub.X))
        for bb in BREEDS:
            if bb not in models:
                continue
            m = sub.breed == bb
            if not m.any():
                continue
            bounds = np.append(sub.starts, len(sub.X))
            rows = np.concatenate([np.arange(bounds[i], bounds[i + 1]) for i in np.flatnonzero(m)])
            scores[rows] = models[bb].score(sub.X[rows])
        p = race_softmax(scores, sub.starts)
        sizes = np.diff(np.append(sub.starts, len(sub.X)))
        ll_model = -np.log(p[sub.winner]).mean()
        ll_uniform = np.log(sizes).mean()
        gid = np.repeat(np.arange(n), sizes)
        # top-1 accuracy
        best = np.zeros(n, dtype=int)
        bestp = np.full(n, -1.0)
        for i, (g, v) in enumerate(zip(gid, p)):
            if v > bestp[g]:
                bestp[g], best[g] = v, i
        top1 = (best == sub.winner).mean()
        # favourite baseline (where exactly one favourite is flagged)
        fav_rows = np.flatnonzero(sub.favorite)
        fav_by_race = np.full(n, -1)
        counts = np.bincount(gid[fav_rows], minlength=n)
        fav_by_race[gid[fav_rows]] = fav_rows
        has_one = counts == 1
        fav_acc = float((fav_by_race[has_one] == sub.winner[has_one]).mean()) if has_one.any() else None
        model_acc_same = float((best[has_one] == sub.winner[has_one]).mean()) if has_one.any() else None
        # second place under discounted Harville, conditional on the true winner
        from .orders import LAMBDA_SECOND
        sec_ll, sec_unif = [], []
        bounds = np.append(sub.starts, len(sub.X))
        for r in np.flatnonzero(sub.second >= 0)[:20000]:
            a, bnd = bounds[r], bounds[r + 1]
            pr = p[a:bnd]
            q = np.power(pr, LAMBDA_SECOND)
            q[sub.winner[r] - a] = 0.0
            q = q / q.sum()
            sec_ll.append(-math.log(max(q[sub.second[r] - a], 1e-12)))
            sec_unif.append(math.log(bnd - a - 1))
        # calibration bins
        y = np.zeros(len(p))
        y[sub.winner] = 1.0
        if b == "all":
            calib_all.append((p, y))
        out[b] = {
            "races": int(n),
            "runners": int(len(p)),
            "log_loss": round(float(ll_model), 4),
            "log_loss_uniform": round(float(ll_uniform), 4),
            "log_loss_gain_vs_uniform": round(float(ll_uniform - ll_model), 4),
            "top1": round(float(top1), 4),
            "top1_uniform": round(float((1.0 / sizes).mean()), 4),
            "favorite_top1": None if fav_acc is None else round(fav_acc, 4),
            "model_top1_same_races": None if model_acc_same is None else round(model_acc_same, 4),
            "second_log_loss": round(float(np.mean(sec_ll)), 4) if sec_ll else None,
            "second_log_loss_uniform": round(float(np.mean(sec_unif)), 4) if sec_unif else None,
            "share_runners_with_history": round(float(sub.has_hist.mean()), 4),
        }
    if calib_all:
        p, y = calib_all[0]
        edges = np.array([0, 0.03, 0.06, 0.1, 0.15, 0.2, 0.3, 0.4, 0.55, 1.0001])
        bins = []
        for lo, hi in zip(edges[:-1], edges[1:]):
            m = (p >= lo) & (p < hi)
            if m.sum() < 50:
                continue
            bins.append({"lo": float(lo), "hi": float(min(hi, 1.0)), "n": int(m.sum()),
                         "predicted": round(float(p[m].mean()), 4), "observed": round(float(y[m].mean()), 4)})
        out["calibration"] = bins  # type: ignore[assignment]
    return out


def coefficient_table(models: dict[str, BreedModel]) -> dict:
    return {b: {f: round(float(c), 4) for f, c in zip(FEATURES, m.coef)} for b, m in models.items()}


def main(argv: list[str] | None = None) -> int:
    from ..config import Settings

    settings = Settings.load()
    ap = argparse.ArgumentParser(prog="edge train", description=__doc__.splitlines()[0])
    ap.add_argument("--archive", type=Path, default=settings.history_path)
    ap.add_argument("--out", type=Path, default=settings.model_path)
    ap.add_argument("--test-from", default="2026-01-01", help="first day of the held-out period")
    ap.add_argument("--l2", type=float, default=1.0)
    ap.add_argument("--limit-days", type=int, default=0, help="debug: only use the last N days")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    runs = load_archive(args.archive)
    if args.limit_days:
        cutoff = max(runs["day"]) - pd.Timedelta(days=args.limit_days)
        runs = runs[runs["day"] >= cutoff]
    ds = build_dataset(runs)
    test_from = date.fromisoformat(args.test_from)
    train_mask = ds.days < test_from
    test = _subset(ds, ~train_mask)
    eval_models = fit(_subset(ds, train_mask), l2=args.l2)
    metrics = evaluate(eval_models, test)
    log.info("held-out metrics: %s", json.dumps(metrics.get("all"), indent=1))

    final = fit(ds, l2=args.l2)
    version = datetime.now(timezone.utc).strftime("form-%Y%m%d-%H%M")
    model = FormModel(
        breeds=final,
        version=version,
        meta={
            "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "archive": str(args.archive.name),
            "train_period": [str(min(ds.days)), str(max(ds.days))],
            "evaluation": {
                "protocol": f"fit on races before {test_from}, scored on {test_from}..{max(ds.days)}",
                "metrics": metrics,
            },
            "coefficients": coefficient_table(final),
            "l2": args.l2,
        },
    )
    model.save(args.out)
    log.info("saved %s (%s)", args.out, version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

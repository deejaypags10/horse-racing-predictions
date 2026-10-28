"""``edge calibrate``: refit the market/form blend from the app's own record.

Uses the last pre-post snapshot of every race that has an official result.
Each snapshot stores, per betting interest, the de-vigged live market chance
``q`` and the evidence-weighted form term ``f``; we fit

    P(win) ∝ exp(a · log q + b · f)

by maximum likelihood (the same conditional logit as the form model) and
write ``artifacts/blend.json``. Refuses to write with fewer than
``--min-races`` races, because a blend fitted on a handful of races would be
noise presented as precision.
"""
from __future__ import annotations

import argparse
import json
import math
from datetime import datetime, timezone

import numpy as np
from scipy.optimize import minimize

from ..config import Settings
from ..store import Store
from .predict import BLEND, BLEND_FILE


def collect(store: Store) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    results = store.all_results()
    rows, starts, winners = [], [], []
    for snap in store.pre_post_snapshots():
        if snap["market"] != "live":
            continue
        res = results.get(snap["race_id"])
        if not res or not res.get("finish"):
            continue
        interest = {r["program"]: r["interest"] for r in res.get("runners", [])}
        win_prog = min(res["finish"], key=lambda f: f["position"])["program"]
        win_bi = interest.get(win_prog, win_prog)
        payload = [x for x in snap["payload"] if x.get("p_market") and "form_term" in x]
        keys = [x["bi"] for x in payload]
        if win_bi not in keys or len(payload) < 2:
            continue
        starts.append(len(rows))
        winners.append(len(rows) + keys.index(win_bi))
        rows.extend([math.log(x["p_market"]), x["form_term"]] for x in payload)
    return np.array(rows, dtype=float).reshape(-1, 2), np.array(starts, dtype=int), np.array(winners, dtype=int)


def fit_blend(X: np.ndarray, starts: np.ndarray, winners: np.ndarray) -> tuple[float, float, float, float]:
    gid = np.repeat(np.arange(len(starts)), np.diff(np.append(starts, len(X))))

    def nll(beta):
        s = X @ beta
        mx = np.maximum.reduceat(s, starts)
        e = np.exp(s - mx[gid])
        den = np.add.reduceat(e, starts)
        p = e / den[gid]
        ll = (s[winners] - mx - np.log(den)).sum()
        grad = X[winners].sum(axis=0) - (p[:, None] * X).sum(axis=0)
        return -ll / len(starts), -grad / len(starts)

    res = minimize(nll, np.array([1.0, 0.0]), jac=True, method="L-BFGS-B")
    market_only = nll(np.array([1.0, 0.0]))[0]
    return float(res.x[0]), float(res.x[1]), float(res.fun), float(market_only)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="edge calibrate", description=__doc__.splitlines()[0])
    ap.add_argument("--min-races", type=int, default=500)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    store = Store(Settings.load().db_path)
    X, starts, winners = collect(store)
    n = len(starts)
    if n < max(args.min_races, 30):
        print(f"only {n} settled live-priced races recorded; need {args.min_races}. Blend unchanged: {BLEND['live']}")
        return 1
    a, b, ll, ll_market = fit_blend(X, starts, winners)
    print(f"{n} races: a={a:.3f} b={b:.3f} log loss {ll:.4f} vs market-only {ll_market:.4f}")
    if not args.dry_run:
        BLEND_FILE.write_text(json.dumps({
            "weights": {"live": {"a": round(a, 4), "b": round(max(b, 0.0), 4)}},
            "races": n, "log_loss": ll, "log_loss_market": ll_market,
            "fitted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}, indent=1))
        print(f"wrote {BLEND_FILE}")
    return 0

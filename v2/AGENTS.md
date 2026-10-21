# AGENTS.md — Equine Edge v2

Instructions for any engineer or AI agent working in `v2/`. Read this first,
then `docs/PROGRESS.md` (state of play) and `docs/DECISIONS.md` (why things
are the way they are). Keep all three current when you change something.

## What this is

A personal, local-only race analysis app for **any track on TwinSpires**:
today board → track card → race view with model win chances, fair odds and
edge against the tote → exotics helper → paper tickets that settle
automatically → an honest track record. The user bets on TwinSpires
themselves; we never place wagers.

Product spec: `docs/PRODUCT.md`. Design spec: `docs/DESIGN.md`.

## Layout

```
v2/
  backend/edge/            Python package (FastAPI + numpy/scipy)
    domain.py              canonical Track/Race/Runner/Odds/Result — sources map INTO this
    odds.py                odds parsing, de-vig, fair price, US tote rendering
    features.py            the ONE runner-feature function used by training and inference
    history.py             cutoff-queryable horse history (legacy parquet + v2 results)
    model/logit.py         conditional logit per breed, JSON params (no pickle)
    model/train.py         walk-forward training + evaluation → artifacts/form_model.json
    model/predict.py       race predictor: form + market blend → coherent distribution
    model/orders.py        discounted Harville: place/show/exacta/trifecta from win probs
    model/calibrate.py     refit blend weights from recorded snapshots + results
    sources/twinspires.py  live adapter (defensive parsing, captures, rate limit)
    sources/archive.py     replay of recorded TVG cards (demo/dev/tests)
    service.py             app service: caching, DTOs, snapshots, tickets, settlement
    poller.py              live-mode background refresh
    store.py               SQLite (snapshots, results, tickets)
    api.py, cli.py         HTTP + `edge` CLI
  backend/tests/           pytest; offline only, fixtures in tests/fixtures
  web/                     React + TypeScript + Vite SPA (no UI/chart libraries)
  docs/                    product, design, architecture, decisions, progress, model card
```

## Commands

```bash
cd v2/backend && python -m venv .venv && . .venv/bin/activate && pip install -e '.[dev]'
pytest -q                                  # backend tests (offline)
edge train                                 # retrain form model (~1 min) from data/processed/us_races_cleaned.parquet
edge serve                                 # http://127.0.0.1:8765 — replay mode by default
EDGE_SOURCE=twinspires edge serve          # live TwinSpires mode
edge ts-probe                              # check TwinSpires endpoints from this network, save captures
edge calibrate --dry-run                   # refit blend weights once ≥500 live races are recorded
cd v2/web && npm ci && npm run dev         # Vite dev server, proxies /api → :8765
npm test && npx tsc --noEmit && npm run build
```

## Rules (non-negotiable)

1. **One feature path.** Training and inference both call
   `features.runner_features` with history from `History.past(key, before=race_day)`.
   Never compute a feature from "now" or from data on/after the race day.
2. **Coherent or absent.** Every probability shown comes from one win
   distribution per race that sums to 1 over active betting interests;
   place/show/exotics derive from it via `model/orders.py`. Never sum
   cumulative fields or shrink outputs independently.
3. **The market is the prior.** With no evidence, the model equals the
   de-vigged market. Value flags require live tote odds, evidence ≥ "some",
   edge ≥ 2 pts and expected return ≥ 10%. "No value" is a normal answer.
4. **Sources stay at the edge.** Provider field names never leak past
   `sources/`. Add a provider by implementing `RaceSource`.
5. **No pickles, no secrets.** Model params are JSON. TwinSpires program
   data needs no credentials; if a future source does, read it from env and
   never log it.
6. **Local only.** The API has no auth and binds 127.0.0.1. Don't deploy it
   publicly, don't add real-money wagering.
7. **Tests are offline.** Use fixtures; refresh TwinSpires fixtures from real
   `edge ts-probe` captures (current ones are synthetic — see
   `tests/fixtures/twinspires/README.md`).
8. **Legacy stays put.** Code outside `v2/` is the original app. Its daily
   GitHub workflows still feed `data/processed/us_races_cleaned.parquet`,
   which v2 trains on. Don't move or delete legacy files in v2 work.
9. Don't name a source folder `lib/`, `build/`, `dist/` or `var/` — the root
   `.gitignore` ignores them.

## Handover checklist

Before stopping: run both test suites, update `docs/PROGRESS.md` (done /
next / known issues), record new decisions in `docs/DECISIONS.md`, commit.

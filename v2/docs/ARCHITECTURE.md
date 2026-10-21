# Architecture

```
            ┌──────────────── sources/ ────────────────┐
TwinSpires ─┤ twinspires.py  (live, cached, captured)  │
TVG archive ┤ archive.py     (replay of recorded days) ├──► domain.Track / Race / Runner
            └──────────────────────────────────────────┘                │
                                                                         ▼
 legacy parquet ─┐                                         service.Service ── store.Store (SQLite)
 v2 results  ────┴─► history.History ─► features ─► model.predict ──┤        snapshots · results · tickets
                         (cutoff by race day)        │  form model   │
                                                     │  + market     ▼
                                                     └► orders ──► api.py (FastAPI, 127.0.0.1)
                                                                         │  /api/* JSON
                                                                         ▼
                                                                    web/ (React SPA)
```

## Request path (race view)

1. `GET /api/races/CD-20260606-7?whatif=3` → `Service.race_view`.
2. Card comes from the cache (20 s live, 1 h replay) or the source.
3. `predict_race`: active runners → betting interests → features from
   `History.past(horse, before=race day)` → per-breed form scores → market
   chances from live odds (else morning line) → log-space blend weighted
   by evidence → win distribution → discounted-Harville order
   probabilities → fair odds, edge points, expected return, value flag.
4. If the race is open, the market is live and this is not a what-if, a
   snapshot (p_model, p_market, form term, price per interest) is stored at
   most once a minute. These are the frozen pre-race predictions the track
   record and `edge calibrate` use.
5. JSON goes back with the source clock (`now`) so the client computes
   minutes-to-post against the replay clock in demo mode.

## Results and settlement

When a card refresh sees an official result, `Service._on_result` stores it
once (`INSERT OR IGNORE`), settles open tickets for that race (win/place/
show from $2 pays, exotics from the result's payoffs, void if the selection
was scratched) and records CLV from the last snapshot. On the next start,
stored results are merged into `History`, so v2 keeps learning form for
tracks the legacy archive never covered. In live mode `poller.Poller`
refreshes cards near post and after the off so this happens without the
UI open.

## Why these boundaries

- **Domain objects are provider-neutral** so a second source (or a change in
  TwinSpires' JSON) touches one file.
- **One features function** removes the training/inference skew that the
  legacy app had (wall-clock "days since", placeholder jockey counts).
- **The service owns state; the API is thin** — the same service drives the
  CLI, the poller and tests.
- **SQLite, single file** — a personal tool needs durability and
  transactions, not a server.

## Performance

Start-up loads ~795k history rows into sorted numpy arrays (~8 s, ~150 MB).
A race prediction is ~10 ms; the replay board (40 tracks, ~400 races) is
~100 ms warm. Live mode is bounded by polite request spacing, not CPU.

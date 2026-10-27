# Hong Kong meetings (HKJC)

Equine Edge reads Hong Kong cards from this folder when started with
`EDGE_SOURCE=hkjc` (or point `EDGE_HK_DIR` somewhere else).

| File | What | Who writes it |
|---|---|---|
| `YYYY-MM-DD_ST.json` / `_HV.json` | racecard (ST = Sha Tin, HV = Happy Valley) | `edge hk-fetch`, or transcribed from racing.hkjc.com |
| `YYYY-MM-DD_ST_odds.csv` | `race,no,win_odds` (HKJC win odds, stake included, e.g. `4.5`; `SCR` = scratched) | `edge hk-fetch --odds-only`, or by hand |
| `YYYY-MM-DD_ST_results.csv` | `race,no,position,win_div,place_div` (dividends per HK$10) | by hand, from HKJC results |

Files are re-read on every refresh, so editing a CSV while the app runs is enough.

## Race day

```bash
cd v2/backend && . .venv/bin/activate

# Try the live HKJC feed first (unverified; saves raw replies to v2/var/captures/hkjc)
edge hk-fetch --venue ST --odds-only            # keep the card here, add current odds
edge hk-fetch --venue ST --odds-only --watch 60 # keep odds fresh until Ctrl-C

# If that fails, copy win odds from the HKJC app into YYYY-MM-DD_ST_odds.csv
cp 2026-10-28_ST_odds.template.csv 2026-10-28_ST_odds.csv   # then fill in win_odds

edge hk-show --venue ST                         # terminal table, every race
EDGE_SOURCE=hkjc edge serve                     # or the full app on http://127.0.0.1:8765
```

## What the numbers mean (read this)

v2's form model is trained on US races only, so every Hong Kong runner has
"no evidence" and the model's chance **equals the de-vigged HKJC market**.
Value flags never fire. A Hong Kong session tests the pipeline (card,
odds, scratchings, probabilities, exotics, paper tickets, settlement), not
the model's judgement. Real HK picks need HK form history (HKJC publishes
results free; an ingestion job is the next step).

HKJC "place" pays the first 3 (first 2 with 4 to 6 runners); the app's
place tickets settle on the first 2, so use win and exotics for HK tests.

The 2026-10-28 Sha Tin card was transcribed from the HKJC racecard pages on
2026-10-27. Check scratchings and standby changes before racing.

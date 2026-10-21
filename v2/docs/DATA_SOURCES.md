# Data sources

## TwinSpires (live) — `EDGE_SOURCE=twinspires`

Read-only GET requests to the JSON that the TwinSpires web program uses.
No account or credentials. Default base `https://www.twinspires.com/adw`,
affiliate id `2800` (override with `EDGE_TS_BASE`, `EDGE_TS_AFFID`).

| Kind | Default path (override env) | Cached |
|---|---|---|
| tracks | `/todays-tracks?affid={affid}` (`EDGE_TS_ENDPOINT_TRACKS`) | 120 s |
| races | `/todays-tracks/{code}/{type}/races?affid={affid}` (`…_RACES`) | 60 s |
| entries | `/todays-tracks/{code}/{type}/races/{race}/entries?affid={affid}` (`…_ENTRIES`) | 45 s |
| odds | `/todays-tracks/{code}/{type}/races/{race}/odds?affid={affid}` (`…_ODDS`) | 15 s |
| results | `/todays-tracks/{code}/{type}/races/{race}/results?affid={affid}` (`…_RESULTS`) | 60 s |

`{code}` is the lower-case BRIS track code and `{type}` the TwinSpires
track type (`Thoroughbred`, `Harness`). Greyhound tracks are skipped.
Requests are spaced ≥ 0.35 s apart (`EDGE_TS_MIN_INTERVAL`), retried with
backoff on 429/5xx, and stale cache is served if a refresh fails.

**Verification status: unverified from the build environment.** The cloud
sandbox's network policy blocked `www.twinspires.com`. Paths and field
aliases come from the TwinSpires web client as previously observed; the
parsers accept several alternative field names per value. To verify:

1. Locally: `EDGE_CAPTURE_DIR=./captures edge ts-probe --races 3`. The
   report lists, per endpoint, whether it answered and how many races,
   runners, morning lines, live odds, jockeys and results parsed.
2. Or on GitHub: run the manual **"v2 — TwinSpires probe"** workflow and
   download the `twinspires-captures` artifact.
3. If a path differs, set the `EDGE_TS_ENDPOINT_*` variable; if a field
   name differs, add it to the alias list in `sources/twinspires.py` and
   replace the synthetic fixtures in `backend/tests/fixtures/twinspires/`
   with the real captures.

Terms of use: this is personal, low-rate, read-only use of public program
pages. Review TwinSpires' terms before using it any other way.

Bet links: `https://www.twinspires.com/bet/program/classic/{slug}/{code}/{type}/{race}/advanced`.

## Archive replay (default) — `EDGE_SOURCE=archive`

Real TVG cards captured by the legacy pipeline in
`scraping/scrapers/us/output/raw/tvg/<TRACK>/<date>.json` (57 tracks,
May–June 2026, with morning lines, connections, coupled entries and
scratches). `EDGE_REPLAY_DATE=2026-06-05` picks the day (default: the
busiest recorded day). The replay clock starts 25 minutes before that
day's first post and runs in real time, so countdowns and race status
behave like a live day. No results exist for these days, and the recorded
"current odds" equal the morning line, so replay is market = morning line
and never shows value flags.

## History — `EDGE_HISTORY_PATH`

`data/processed/us_races_cleaned.parquet` (legacy TVG results archive,
~795k runner rows, 2025-01 → 2026-05-09) plus every official result v2
stores in SQLite. Horses are matched by normalised name within a breed
namespace (harness vs runners), e.g. "Lion Lake (IRE)" → `r:lionlake`.

# 15 backend enhancements

**Architecture recommendation:** keep Streamlit and batch predictions initially. Use typed adapters, immutable snapshots, a small transactional repository, and versioned model bundles. SQLite suits one persistent process; shared multi-instance or ephemeral hosting requires a durable external database/object store. Do not begin by splitting everything into microservices.

**Code status:** proposed interfaces/schemas and original sketches. SQL examples target SQLite unless stated otherwise. Deployment/storage migration, credentials, and integration tests are not executed in this assessment.

## B01 — Canonical race, runner, and prediction contract

**Priority:** P0. **Status:** hardens existing normalized ingestion. **Effort:** 5–9 days.

Use provider ID mappings to canonical IDs rather than joining horse names and dates. Keep track-local date, UTC off time, runner status, snapshot, price type, and explicit cumulative probability names. A runner ID identifies a horse's entry in one race; a horse ID identifies the animal across races.

**Integrate:** US ingestion adapters, UK flattening, prediction CSV boundary, odds/result joins. Existing schema work is retained; migrate with a version marker.

```python
from dataclasses import dataclass
from math import isfinite

@dataclass(frozen=True)
class RunnerPrediction:
    schema_version: int
    race_id: str
    runner_id: str
    horse_id: str
    snapshot_id: str
    bundle_id: str
    status: str
    p_win: float
    p_top2: float
    p_top3: float

    def validate(self):
        if not all((self.race_id, self.runner_id, self.horse_id,
                    self.snapshot_id, self.bundle_id)):
            raise ValueError("Missing canonical identity or provenance")
        if self.status not in {"declared", "scratched", "finished", "void"}:
            raise ValueError("Invalid runner status")
        ps = (self.p_win, self.p_top2, self.p_top3)
        if not all(isfinite(p) for p in ps) or not 0 <= ps[0] <= ps[1] <= ps[2] <= 1:
            raise ValueError("Invalid cumulative probabilities")
```

**Accept:** enforce IDs, active field sum, unique `(snapshot_id, runner_id)`, timezone-aware times, and stage-specific required fields at ingestion/publish. Quarantine the saved UK sample with blank courses; do not guess identity.

## B02 — Transactional paper/portfolio ledger

**Priority:** P1; prerequisite for private multiuser features. **Status:** replaces read-overwrite CSV/JSON. **Effort:** 5–8 days.

Store stakes/payouts as integer minor currency units, with append-only decisions and settlement corrections. Use idempotency and owner scoping; calculate balances from ledger entries rather than trusting a mutable JSON balance. Use PostgreSQL for multi-instance hosting.

**Integrate:** Betting Manager and `rl_bankroll_manager.py`. Depends on B01/B11. Example records one immutable paper decision; settlement is a separate event table.

```python
import sqlite3
from contextlib import closing

def add_paper_bet(db_path, owner, bet_id, runner_id, stake_minor, currency):
    if stake_minor <= 0 or currency not in {"GBP", "USD", "EUR"}:
        raise ValueError("Invalid stake/currency")
    with closing(sqlite3.connect(db_path, timeout=10)) as db:
        db.execute("PRAGMA journal_mode=WAL")
        with db:
            db.execute("""CREATE TABLE IF NOT EXISTS paper_bets (
                owner_id TEXT NOT NULL, bet_id TEXT NOT NULL,
                runner_id TEXT NOT NULL, stake_minor INTEGER NOT NULL CHECK(stake_minor>0),
                currency TEXT NOT NULL, PRIMARY KEY(owner_id,bet_id))""")
            db.execute("INSERT INTO paper_bets VALUES (?,?,?,?,?)",
                       (owner, bet_id, runner_id, stake_minor, currency))
```

**Accept:** duplicate IDs cannot charge twice; concurrent writes preserve totals; settlements distinguish win/loss/void/dead heat and original versus correction. Migration reconciles historical balance and preserves a backup before switching.

## B03 — Durable idempotent jobs

**Priority:** P1. **Status:** replaces UI-bound subprocess execution. **Effort:** 6–10 days.

The UI enqueues work and polls status; a worker owns ingestion, prediction, and training. Jobs include date, jurisdiction, data hash, bundle ID, and requested stage so reruns deduplicate the same work. A process timeout is not an orchestration policy.

**Integrate:** `fetch_racecards()`, `generate_predictions()`, US subprocess controls. Requires B07/B12/B14. SQLite job table is a local pilot; an external worker queue is a later deployment choice.

```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN
    ('queued','running','succeeded','failed','withheld')),
  attempt INTEGER NOT NULL DEFAULT 0,
  lease_until TEXT,
  output_snapshot_id TEXT,
  public_error TEXT
);
-- Within BEGIN IMMEDIATE, select a queued or expired leased job,
-- then claim that exact job before committing. The worker renews its lease.
UPDATE jobs SET state='running', attempt=attempt+1, lease_until=?
WHERE job_id=? AND state='queued';
```

**Accept:** two clicks create one job; worker crash releases via expiring lease; publish is atomic and validated. Production claiming must include expired leases and compare-and-set ownership, not merely the illustrated queued update.

## B04 — Source clients with bounded retry and quota budgets

**Priority:** P1. **Status:** unifies numerous fetchers. **Effort:** 4–7 days.

Share timeout, retry, rate-limit, raw-capture, and quota behavior across adapters. Retry transient reads, not arbitrary writes. Honor Retry-After, limit attempts, and avoid storing query-string API keys in log output. Treat documented 500-call limits as repository assumptions until the current account contract is verified.

**Integrate:** `scraping/common.py`, `scripts/fetch_racecards*.py`, odds fetchers. Existing requests dependency includes urllib3; test its locked version.

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def source_session():
    policy = Retry(total=3, connect=2, read=2, backoff_factor=0.5,
                   status_forcelist=(429, 502, 503, 504),
                   allowed_methods=frozenset({"GET"}),
                   respect_retry_after_header=True)
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=policy))
    return session

def fetch_json(session, url, *, params=None, auth=None):
    response = session.get(url, params=params, auth=auth, timeout=(5, 25))
    response.raise_for_status()
    return response.json()
```

**Accept:** 401/403 fail promptly, 429 backs off, malformed payloads quarantine. Add a shared monthly usage counter and cache reservation before requests; retries also consume quota. The snippet is a client core, not the whole budget implementation.

## B05 — Event time and availability time for every record

**Priority:** P0. **Status:** extends historical date-only feature handling. **Effort:** 7–12 days.

Keep the time an event occurred and the time the system could observe it. Race result corrections, odds feeds, weather forecasts, and horse ratings can all arrive late. Point-in-time reconstruction must exclude unavailable information even if its nominal date is earlier.

**Integrate:** raw capture manifests, feature engineering, inference, replay. Start with Parquet and a snapshot manifest; Feast is inspiration, not a mandatory service ([R08](06_RESEARCH.md#r08--feast)).

```python
import pandas as pd

def prior_results(history, horse_id, decision_cutoff):
    cutoff = pd.Timestamp(decision_cutoff)
    if cutoff.tzinfo is None:
        raise ValueError("Cutoff must include UTC offset")
    work = history.copy()
    work["event_at"] = pd.to_datetime(work.event_at, utc=True)
    work["available_at"] = pd.to_datetime(work.available_at, utc=True)
    return work.loc[
        work.horse_id.eq(horse_id)
        & work.event_at.lt(cutoff) & work.available_at.lt(cutoff)
    ].sort_values(["event_at", "available_at"], ascending=False)
```

**Accept:** adding a future race or later correction does not alter an earlier snapshot. Missing availability times in old datasets are marked unverified; assigning capture time retroactively cannot recover original availability.

## B06 — Inference feature contract with value/lineage checks

**Priority:** P0. **Status:** strengthens `validate_feature_contract.py`. **Effort:** 4–7 days.

The current script checks which historical dataset has the most expected columns. Also validate the actual features supplied to the selected model: order, types, units, missingness, placeholders, provider lineage, and train/inference parity. A zero-filled US speed column is not a populated speed feature.

**Integrate:** shared feature builder and all predictor entry points. Depends on B01/B05/B07.

```python
import numpy as np

def validate_inference(X, feature_order, lineage, max_missing=0.20):
    if list(X.columns) != list(feature_order):
        raise ValueError("Model feature order mismatch")
    numeric = X.to_numpy(dtype=float)
    if np.isinf(numeric).any():
        raise ValueError("Infinite feature value")
    missing = X.isna().mean(axis=1)
    if (missing > max_missing).any():
        raise ValueError("Missing-feature policy exceeded")
    fabricated = [f for f in feature_order if lineage.get(f) == "placeholder"]
    if fabricated:
        raise ValueError(f"Placeholder features: {fabricated}")
    return X
```

**Accept:** compare train and inference features for the same historical cutoff on known runners. Add per-feature ranges and explicit missing defaults; the demo's threshold must be learned as a deployment policy, not applied universally.

## B07 — Versioned model bundles and registry pointer

**Priority:** P0. **Status:** unifies JSON/pickle/ensemble/metadata paths. **Effort:** 5–9 days.

Bundle model, preprocessing, ordered feature contract, probability semantics, calibrator, cutoff, dependencies, dataset hash, metrics and jurisdiction. One trusted registry entry controls inference and UI metrics. Compute digests before deserialization; prefer native XGBoost/LightGBM formats for base estimators.

**Integrate:** `shared/utils.py::load_model()`, UK/US generators, model-training publication. Inspired by MLflow ([R06](06_RESEARCH.md#r06--mlflow)); a simple JSON registry can come first.

```python
from hashlib import sha256
from pathlib import Path
import json

def checked_bundle(manifest_path, trusted_model_hash):
    path = Path(manifest_path).resolve()
    manifest = json.loads(path.read_text(encoding="utf-8"))
    artifact = (path.parent / manifest["model_file"]).resolve()
    if not artifact.is_relative_to(path.parent):
        raise ValueError("Artifact escapes bundle directory")
    digest = sha256(artifact.read_bytes()).hexdigest()
    if digest != trusted_model_hash or digest != manifest["model_sha256"]:
        raise ValueError("Model integrity mismatch")
    return artifact, manifest
```

**Accept:** bundle is immutable; promotion atomically changes the pointer; rollback restores a prior bundle. A hash stored beside an untrusted artifact is not authentication; trust comes from the controlled registry and permissions.

## B08 — Immutable typed odds snapshots

**Priority:** P0. **Status:** improves scraped-odds merging and backtest joins. **Effort:** 6–10 days.

Persist provider market/selection IDs, quote type, currency, observed/available time, decimal price, liquidity, and settlement terms. Current date+normalized-horse backtest joins are insufficient for executable-price replay and can collide. Best-price composites should not be treated as one bookmaker's coherent market for de-vigging.

**Integrate:** odds fetch/merge scripts and backtest input boundary. Depends on B01/B05.

```sql
CREATE TABLE quotes (
  capture_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  market_id TEXT NOT NULL,
  selection_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  price_type TEXT NOT NULL CHECK(price_type IN
    ('fixed','exchange_back','exchange_lay','morning_line','tote_probable')),
  observed_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  decimal_odds REAL NOT NULL CHECK(decimal_odds>1),
  currency TEXT NOT NULL,
  available_minor INTEGER,
  PRIMARY KEY(capture_id, provider, market_id, selection_id, price_type)
);
```

**Accept:** backtest retrieves only quotes available before its decision time; scratched/void selections and price suspensions are modeled. Persist source payload hash and full market membership separately.

## B09 — Feed coverage and pipeline health dashboard

**Priority:** P1. **Status:** enhances existing US guardrails. **Effort:** 4–7 days.

Track expected meetings, declared races, active runners, feature population, source disagreement, and newest capture per source. The expected denominator must come from an independent fixture/declaration source, not the same scraper's returned rows.

**Integrate:** `validate_us_ingestion.py`, US workflow, and shared operational reports. Depends on B01/B13.

```python
def coverage_report(expected_race_ids, received_race_ids):
    expected, received = set(expected_race_ids), set(received_race_ids)
    missing = sorted(expected - received)
    unexpected = sorted(received - expected)
    return {
        "expected": len(expected), "received_expected": len(expected & received),
        "coverage": len(expected & received) / len(expected) if expected else None,
        "missing": missing, "unexpected": unexpected,
        "state": "unknown" if not expected else ("degraded" if missing else "complete"),
    }
```

**Accept:** missing meetings trigger a withheld/degraded state; no-racing days differ from unknown denominators. Give users concise source status and operators the detailed report.

## B10 — Query only needed history and cache by snapshot

**Priority:** P1. **Status:** expands existing PyArrow subset option. **Effort:** 3–6 days.

Partition Parquet by jurisdiction/year/month; project selected columns and filter before materialization. Cache models as resources and data as snapshots. Cache identity must include bundle/data version, rather than silently retaining an old model after retraining.

**Integrate:** `shared/utils.py::load_data/load_model` and Data Explorer. Optional dependency: DuckDB. The example uses a fresh connection per query; do not globally share an unsafe mutable session.

```python
import duckdb

def course_history(parquet_glob, track_id, start_date):
    db = duckdb.connect()
    try:
        return db.execute("""
            SELECT race_id, horse_id, track_date, position, distance_f
            FROM read_parquet(?, hive_partitioning=true)
            WHERE track_id = ? AND track_date >= CAST(? AS DATE)
            ORDER BY track_date DESC
            LIMIT 5000
        """, [parquet_glob, track_id, start_date]).df()
    finally:
        db.close()
```

**Accept:** benchmark cold/warm loads, peak memory, and correct filters on a representative dataset. Use explicit cache hash arguments. Faster querying must not change the historical cutoff or truncate model history unintentionally.

## B11 — Ownership isolation and administrator controls

**Priority:** P1 if hosted for multiple users; P2 for an explicitly private single-user installation. **Status:** new persistence authorization layer. **Effort:** 5–9 days.

Separate public race data from private notes, watchlists, and financial history. Identity alone does not grant write authorization. Restrict retraining/provider jobs to an admin role, and scope every query to the authenticated owner.

**Integrate:** Streamlit page entry, repository adapters, workers. Streamlit OIDC is an option ([official guide](https://docs.streamlit.io/develop/concepts/connections/authentication)); configure its provider and expiry policy separately.

```python
import streamlit as st

def authenticated_owner():
    if not st.user.is_logged_in:
        st.button("Sign in", on_click=st.login)
        st.stop()
    # Stable subject + issuer, not a mutable display name or email.
    claims = dict(st.user)
    if not claims.get("sub") or not claims.get("iss"):
        raise PermissionError("Missing verified subject/issuer")
    return (claims["iss"], claims["sub"])

def own_notes(db, owner_id):
    return db.execute("SELECT * FROM trip_notes WHERE owner_id=?", (owner_id,)).fetchall()
```

**Accept:** two-user tests cannot read/write each other's resources; worker authorization rechecks ownership/role. Private-query cache keys include owner. Introduce deployment-specific admin allowlists and audit logs.

## B12 — Explicit pipeline graph and reproducible run manifests

**Priority:** P1. **Status:** consolidates script-order dependency chains. **Effort:** 5–8 days.

Declare inputs/outputs and prerequisite checks for each stage. Never select a dataset merely because a filename exists. Produce run metadata with data hashes, code revision, stage status, output row counts, and bundle identity.

**Integrate:** weekly training, daily pipelines, local regeneration. Existing workflow stages are retained; Prefect is optional inspiration ([R09](06_RESEARCH.md#r09--prefect)).

```python
from graphlib import TopologicalSorter

DEPENDENCIES = {
    "capture": set(), "normalize": {"capture"},
    "validate_entries": {"normalize"},
    "features": {"validate_entries"}, "validate_features": {"features"},
    "score": {"validate_features"}, "validate_probabilities": {"score"},
    "publish": {"validate_probabilities"},
}

def run_pipeline(stage_functions):
    manifest = {}
    for stage in TopologicalSorter(DEPENDENCIES).static_order():
        result = stage_functions[stage](manifest)
        if result["status"] != "passed":
            raise RuntimeError(f"Stage withheld: {stage}")
        manifest[stage] = result
    return manifest
```

**Accept:** a failed stage prevents publish, partial artifacts cannot be mistaken for valid outputs, and reruns with unchanged inputs can reuse validated stage outputs. Pin environment versions for reproduction.

## B13 — Structured logs, metrics, and public-safe errors

**Priority:** P1. **Status:** standardizes script prints/UI error tails. **Effort:** 3–5 days.

Attach run ID, race/snapshot IDs, source, stage, latency, coverage, and error class to structured logs. Keep user-visible messages short and reference the run ID. Whitelist log fields instead of attempting to redact every possible secret after the fact.

**Integrate:** scraping/common, subprocess replacements, UI diagnostics. Add resource/run metrics before adopting an external observability stack.

```python
import json
import logging

SAFE_FIELDS = {"run_id", "snapshot_id", "race_id", "source", "stage",
               "duration_ms", "row_count", "error_class", "state"}

def log_event(event_name, **fields):
    payload = {k: v for k, v in fields.items() if k in SAFE_FIELDS}
    payload["event"] = event_name
    logging.info(json.dumps(payload, sort_keys=True))

# Never pass auth headers, query URLs, environment dictionaries or raw payloads.
```

**Accept:** fixtures with fake credentials do not appear in logs/errors; join one failed run across stages; measure success rate and stale-feed duration. Event names are controlled constants, not unsanitized exception strings.

## B14 — Atomic snapshots, backups, and recovery drills

**Priority:** P1. **Status:** hardens CSV/JSON publication. **Effort:** 3–6 days.

Write to a temporary sibling, validate, flush, then atomically publish. Prefer immutable versioned files plus an atomic "latest" pointer so concurrent writers do not overwrite one another. Backup ledgers and model manifests outside the app's ephemeral filesystem.

**Integrate:** predictor CSV outputs and manifests. Depends on B03/B07; below is a local atomic file primitive, not a full multiwriter protocol.

```python
import os
import tempfile
from pathlib import Path

def atomic_bytes(path, payload):
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
```

**Accept:** readers see old or new complete snapshots; crash injection never publishes a partial CSV. Test restore from a backup in a disposable directory and document recovery-time/data-loss targets.

## B15 — Broader fixture-based CI and semantic regressions

**Priority:** P1. **Status:** extends current path-filtered parser tests. **Effort:** 4–7 days.

Run fast offline tests for all shared/inference/UI/probability changes, not only selected parser paths. Preserve source captures for missing odds, scratches, duplicate names, DST, split boundaries, failed jobs, and ownership. Add a lockfile and dependency smoke checks, including calibration API compatibility.

**Integrate:** `.github/workflows/parser_hardening_checks.yml` or a broader successor. Proposed test modules below do not yet exist; implement them before enabling this workflow.

```yaml
name: Offline prediction contracts
on: [pull_request, workflow_dispatch]
jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: false
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: >-
          python -m pytest tests/test_prediction_contract.py
          tests/test_temporal_replay.py tests/test_paper_ledger.py
          tests/test_model_bundle.py -q
```

**Accept:** tests use small fixtures and no live API calls. A regression that restores cumulative double-counting, scores a scratch, splits a race fold, or uses future history fails CI. Pin actions/dependencies according to repository policy before production use.

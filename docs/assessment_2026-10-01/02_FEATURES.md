# 15 feature enhancements

**Code status:** original proposals, not installed. UI examples take the named DataFrame/dict from a validated snapshot. Column names beyond existing CSV fields belong to the proposed schema in B01. Priorities are explained in the [index](README.md); delivery dependencies are consolidated in the [roadmap](07_ROADMAP.md).

## F01 — Scratch-aware race scenario studio

**Priority:** P0 for scratch exclusion, P2 for the interactive studio. **Status:** enhancement to existing runner views. **Effort:** 4–8 days.

Let users see how a withdrawal changes the field, pace, and model rankings. The saved UK sample includes a `NON-RUNNER` row; invalid runners should never receive an active selection badge. Renormalizing is a useful conditional baseline, but does not model a changed pace shape. Actual scratch processing must rebuild field-dependent features and rerun the validated model.

**Integrate:** `predictions.py::display_race_details`, `pages/us_racing.py::_display_race_detail`. Depends on B01, M03, and later M10.

```python
import numpy as np
import pandas as pd

def conditional_scratch_baseline(runners: pd.DataFrame,
                                 scratched_ids: set[str]) -> pd.DataFrame:
    active = runners.loc[
        ~runners.runner_id.isin(scratched_ids)
        & runners.status.eq("declared")
    ].copy()
    p = active.win_probability.to_numpy(dtype=float)
    if len(p) == 0 or not np.isfinite(p).all() or (p < 0).any():
        raise ValueError("Invalid active field")
    if p.sum() <= 0:
        raise ValueError("Field has no probability mass")
    active["scenario_probability"] = p / p.sum()
    active["scenario_kind"] = "conditional baseline; pace unchanged"
    return active
```

**Accept:** scratched runners disappear from actionable views; scenario is labeled hypothetical; real rerun recomputes draw percentile/field mean weight and updates artifact/version IDs. Handle a walkover explicitly.

## F02 — Race replay time machine

**Priority:** P1. **Status:** new capability beyond saved CSV browsing. **Effort:** 5–9 days.

Rewind to declarations, 60 minutes before the race, 10 minutes before, and close. Reveal only information available then. Compare prediction changes with scratches, odds, going, and source corrections. This is a compelling debugging tool and a user-facing learning feature.

**Integrate:** new replay panel on race details. Depends on B05 and B08. `events` has entity, event/availability timestamps, and immutable versions.

```python
import pandas as pd

def visible_snapshot(events: pd.DataFrame, as_of: str) -> pd.DataFrame:
    cutoff = pd.Timestamp(as_of)
    if cutoff.tzinfo is None:
        raise ValueError("Replay cutoff must include a timezone")
    work = events.copy()
    for col in ("event_at", "available_at"):
        work[col] = pd.to_datetime(work[col], utc=True)
    visible = work.loc[
        (work.event_at <= cutoff) & (work.available_at <= cutoff)
    ]
    return (visible.sort_values(["available_at", "version"])
            .drop_duplicates(["entity_type", "entity_id"], keep="last"))
```

**Accept:** replaying the same cutoff returns the same snapshot hash; later corrections and results remain invisible. Event/availability timestamps are not replaced with file modification time.

## F03 — Conditions fingerprint and comparable races

**Priority:** P1. **Status:** expands existing course/form statistics. **Effort:** 4–7 days.

Show a runner's evidence under today's course, distance, surface, going, and class, with counts and historical dates. Inspired by Geegeez's conditions profiler ([R01](06_RESEARCH.md#r01--geegeez-gold)). Avoid a green cell based on one run looking like a robust pattern.

**Integrate:** race detail and Data Explorer. Depends on B05/M08; history must already be cutoff-filtered.

```python
import pandas as pd

def condition_evidence(prior: pd.DataFrame, surface: str,
                       going: str, distance_f: float) -> pd.DataFrame:
    matched = prior.loc[
        prior.surface.eq(surface) & prior.going.eq(going)
        & prior.distance_f.sub(distance_f).abs().le(0.5)
    ].copy()
    matched["won"] = matched.position.eq(1).astype(int)
    stats = matched.groupby("horse_id").won.agg(wins="sum", runs="size")
    prior_rate, prior_strength = 0.10, 20
    stats["smoothed_win_rate"] = (
        stats.wins + prior_rate * prior_strength
    ) / (stats.runs + prior_strength)
    return stats.reset_index()
```

**Accept:** show sample size and comparison filters next to every rate; distinguish no evidence from a 0% observed win rate. Prior rate is estimated from training data, not hard-coded in production.

## F04 — Immutable paper portfolio and closing-line review

**Priority:** P0 for honest evaluation, P1 for the product UI. **Status:** strengthens existing P&L tracker. **Effort:** 6–10 days.

Save a paper decision with the price actually visible, model bundle, rationale, timestamp, and later settlement. Track closing-line value (CLV) separately from realized profit. A good close comparison is evidence about price selection, not proof of long-run profitability.

**Integrate:** `pages/betting_manager.py`, `pages/backtest_results.py`. Depends on B02/B08/M14. Persist snapshots in a transaction; never update the original decision payload.

```python
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from uuid import uuid4

@dataclass(frozen=True)
class PaperDecision:
    decision_id: str
    runner_id: str
    snapshot_id: str
    model_bundle: str
    taken_decimal: float
    recorded_at: str
    reason: str

def record_decision(runner_id, snapshot_id, model_bundle, odds, reason):
    if odds <= 1:
        raise ValueError("Need an observed valid decimal price")
    return asdict(PaperDecision(str(uuid4()), runner_id, snapshot_id,
                   model_bundle, odds,
                   datetime.now(timezone.utc).isoformat(), reason))

def price_clv(taken_decimal, close_decimal):
    return taken_decimal / close_decimal - 1
```

**Accept:** close prices use a consistent market/provider and timing convention; report missing-close coverage. Results, voids, dead heats, stake, currency, and commission come from the settlement ledger, not this minimal decision object.

## F05 — Race exposure and disciplined stake preview

**Priority:** P0. **Status:** corrects Kelly minimum and adds portfolio context. **Effort:** 2–4 days.

For small positive edges, preview zero or the calculated fractional stake; never automatically enlarge a tiny position to the minimum. Show existing exposure across mutually exclusive runners and alternatives in the same race. This example imposes a cap; it is not a joint optimal Kelly solver.

**Integrate:** replace the sizing policy behind `kelly_stake_fraction()` and present in Betting Manager. Depends on trustworthy p/odds and B02.

```python
import math

def stake_preview(p, odds, bankroll, already_exposed=0.0,
                  fraction=0.25, race_cap=0.02, minimum=1.0):
    values = (p, odds, bankroll, already_exposed, fraction, race_cap, minimum)
    if not all(math.isfinite(v) for v in values):
        raise ValueError("Finite inputs required")
    if not 0 <= p <= 1 or odds <= 1 or bankroll < 0:
        raise ValueError("Invalid probability, price or bankroll")
    if already_exposed < 0 or minimum < 0:
        raise ValueError("Invalid exposure or minimum")
    if not 0 <= fraction <= 1 or not 0 <= race_cap <= 1:
        raise ValueError("Invalid policy")
    kelly = max(0.0, (p * odds - 1) / (odds - 1)) * fraction
    capacity = max(0.0, bankroll * race_cap - already_exposed)
    amount = min(bankroll * kelly, capacity)
    return round(amount, 2) if amount >= minimum else 0.0
```

**Accept:** a £1,000 bankroll, p=.251, odds=4 yields zero when minimum=£1; no stake increases to reach the floor. Treat race/day limits and uncertainty as explicit policy, not a claim that quarter Kelly is universally suitable.

## F06 — Personal watchlist with meaningful change detection

**Priority:** P1. **Status:** new personal persistence/change detection beyond the existing strategy-based Betting Watchlist. **Effort:** 3–6 days.

Follow horses, trainers, courses, and research angles. Notify in-app only when a scratch, going change, or material probability/price change occurs; show the before/after values. External delivery is an optional later integration with explicit user settings.

**Integrate:** sidebar watchlist and new saved-watchlist repository. Depends on B02/B11, F02, B08.

```python
def meaningful_change(previous: dict, current: dict) -> list[str]:
    reasons = []
    if previous["status"] != current["status"]:
        reasons.append("Runner status changed")
    if previous["going"] != current["going"]:
        reasons.append("Going changed")
    if abs(current["p_win"] - previous["p_win"]) >= 0.03:
        reasons.append("Win estimate moved by at least 3 percentage points")
    old, new = previous.get("decimal_odds"), current.get("decimal_odds")
    if old and new and abs(new / old - 1) >= 0.10:
        reasons.append("Observed price moved at least 10%")
    return reasons
```

**Accept:** deduplicate using watchlist ID + event/version, give quiet hours, and show source timestamps. Thresholds are user preferences, not statistically significant signals.

## F07 — Evidence-linked trip notebook

**Priority:** P1. **Status:** extends form data with personal interpretation. **Effort:** 4–7 days.

Annotate a horse's run with a replay link/time and structured tags such as blocked, wide, slow start, or eased. Surface that note the next time the horse runs. Inspired by DRF's notes/replay workflow ([R02](06_RESEARCH.md#r02--drf-formulator)).

**Integrate:** Data Explorer horse view and race details. Depends on B02/B11. No replay scraping or redistribution is required; keep licensed links.

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class TripNote:
    owner_id: str
    runner_id: str
    race_id: str
    note: str
    tags: tuple[str, ...]
    replay_url: str | None = None
    replay_second: int | None = None

def validate_note(note: TripNote):
    allowed = {"blocked", "wide", "slow_start", "eased", "strong_finish"}
    if not note.note.strip() or len(note.note) > 2000:
        raise ValueError("Provide a concise observation")
    if not set(note.tags).issubset(allowed):
        raise ValueError("Unknown trip tag")
    if note.replay_second is not None and note.replay_second < 0:
        raise ValueError("Replay time cannot be negative")
```

**Accept:** notes retain owner and provenance, link to the original run, and are labeled subjective. Do not automatically train on personal notes without defining annotation consistency and historical availability.

## F08 — Side-by-side runner comparison

**Priority:** P1. **Status:** new focused view over existing table inputs. **Effort:** 2–4 days.

Compare two to four runners using common scales, evidence counts, missing-data markers, historical conditions, and prices. Keep the explanation anchored to the actual snapshot; a high global feature importance is not a reason for a particular selection.

**Integrate:** `display_all_horses_table()` and US equivalent. Depends on B01/D12.

```python
import streamlit as st

def render_comparison(runners):
    selected = st.multiselect("Compare runners", runners.runner_id,
                              max_selections=4)
    columns = ["horse", "win_probability", "market_odds", "days_since_last",
               "career_runs", "going_evidence_runs", "feature_missing_pct"]
    if selected:
        view = runners.loc[runners.runner_id.isin(selected)]
        st.dataframe(view[[c for c in columns if c in view]],
                     hide_index=True,
                     column_config={"win_probability":
                         st.column_config.NumberColumn("Win chance", format="%.3f")})
    else:
        st.caption("Choose up to four runners to inspect the same evidence.")
```

**Accept:** selection persists on a race rerun; probabilities remain numeric; each comparison has identical units and source cutoff.

## F09 — Market movement timeline with fair-price reference

**Priority:** P1. **Status:** enhances existing trend/odds overlay. **Effort:** 4–7 days.

Show observed prices by provider and timestamp with a separate model fair-price line. Distinguish morning line, live fixed odds, exchange back/lay, and tote probable returns. A morning line is not an executable quote.

**Integrate:** value-bets panel and US market view. Depends on B08 and D13.

```python
import plotly.express as px
import streamlit as st

def odds_timeline(quotes, p_win):
    observed = quotes.loc[quotes.price_type.isin(["fixed", "exchange_back"])]
    fig = px.line(observed.sort_values("observed_at"), x="observed_at",
                  y="decimal_odds", color="provider", markers=True,
                  hover_data=["available_at", "market_id"])
    if 0 < p_win < 1:
        fig.add_hline(y=1 / p_win, line_dash="dot",
                      annotation_text="Model fair price, same prediction snapshot")
    fig.update_layout(yaxis_title="Decimal price", xaxis_title="Quote time (UTC)")
    st.plotly_chart(fig, use_container_width=True)
```

**Accept:** gaps are gaps, not interpolated executable prices; available liquidity and commission are separately shown for exchange quotes.

## F10 — Pace story and scenario map

**Priority:** P2. **Status:** new user-facing interpretation of pace inputs. **Effort:** 6–12 days.

Present likely leaders, pressers, and closers; compare slow/normal/fast pace scenarios and their assumptions. Give probability movement as a scenario output, not a factual claim that the race will unfold that way. See Timeform/DRF inspiration and speed-control research, [R02/R03/R13](06_RESEARCH.md).

**Integrate:** race detail panel. Depends on populated pace data, M10, F01.

```python
import plotly.express as px
import streamlit as st

def pace_map(runners):
    required = {"horse", "draw", "early_pace", "running_style"}
    if not required.issubset(runners.columns):
        st.info("Pace projection needs early-pace history and running style.")
        return
    fig = px.scatter(runners, x="draw", y="early_pace", color="running_style",
                     text="horse", hover_data=["pace_history_runs"])
    fig.update_traces(textposition="top center")
    fig.update_layout(xaxis_title="Draw / post", yaxis_title="Prior early pace")
    st.plotly_chart(fig, use_container_width=True)
```

**Accept:** missing pace does not become zero speed; label figure provenance. Map scores and scenario model are calibrated within jurisdiction and distance.

## F11 — Saved angle lab with untouched holdout

**Priority:** P2. **Status:** extends trainer/jockey filters into reproducible research. **Effort:** 7–12 days.

Save an angle such as first run after a break plus trainer course history. Freeze its definition before testing a later period. Show attempts, sample counts, price coverage, and negative outcomes; do not optimize until a backtest looks profitable.

**Integrate:** Data Explorer plus trainer statistics. Depends on B05/B12/M14. Inspired by Geegeez Query Tool and DRF Trainer Patterns.

```python
import pandas as pd

def apply_angle(prior: pd.DataFrame, spec: dict) -> pd.DataFrame:
    # Use typed fields, not eval() of a user-entered expression.
    allowed = {"surface", "min_days_off", "max_days_off"}
    if set(spec) - allowed:
        raise ValueError("Unsupported angle field")
    mask = pd.Series(True, index=prior.index)
    if "surface" in spec:
        mask &= prior.surface.eq(spec["surface"])
    mask &= prior.days_since_last.ge(spec.get("min_days_off", 0))
    mask &= prior.days_since_last.le(spec.get("max_days_off", 10000))
    return prior.loc[mask].copy()
```

**Accept:** store the spec hash, registration date, and untouched test dates. Distinguish exploratory discoveries from confirmatory evaluations.

## F12 — Structured race briefing and question engine

**Priority:** P2. **Status:** new evidence summary. **Effort:** 4–8 days deterministic; 2–4 additional weeks for a grounded language interface.

Answer practical questions: what changed, which runners lack history, which disagree with the market, and why is this race withheld? Start with deterministic summaries. A later language model can verbalize retrieved facts, but should not invent performance evidence or prices.

**Integrate:** race header and evidence drawer. Depends on B01/B07/F02; optional LLM has a separate provider/configuration decision.

```python
def race_brief(race, runners):
    leader = max(runners, key=lambda r: r["p_win"])
    missing = [r["horse"] for r in runners if r["history_runs"] == 0]
    return {
        "snapshot_id": race["snapshot_id"],
        "facts": [
            f'{race["course"]}: {len(runners)} active runners',
            f'Model leader: {leader["horse"]} ({leader["p_win"]:.1%})',
            f'{len(missing)} runners have no linked prior history',
        ],
        "unknowns": missing,
        "sources": race["source_capture_ids"],
    }
```

**Accept:** every sentence is traceable to snapshot fields; absence of evidence remains explicit. Do not market the narrative as additional predictive signal.

## F13 — Model-versus-market disagreement radar

**Priority:** P2. **Status:** expands raw edge sorting into interpretable disagreements. **Effort:** 3–6 days.

Find races where the model's full-field ranking differs from a coherent market distribution. Break disagreement down by feature coverage, uncertainty, and model version. A discrepancy is a review prompt, not an automatic value badge.

**Integrate:** top predictions and Model Insights. Depends on complete single-market snapshots, M03/M04/M12.

```python
import numpy as np

def disagreement(p_model, p_market):
    p, q = np.asarray(p_model, float), np.asarray(p_market, float)
    if (p.ndim != 1 or p.shape != q.shape or not np.isfinite(p).all()
            or not np.isfinite(q).all() or np.any(p <= 0) or np.any(q <= 0)):
        raise ValueError("Need matching positive full-field distributions")
    if not np.isclose(p.sum(), 1) or not np.isclose(q.sum(), 1):
        raise ValueError("Distributions must sum to one")
    middle = (p + q) / 2
    js = 0.5 * ((p * np.log(p / middle)).sum()
                + (q * np.log(q / middle)).sum())
    return {"js_divergence": float(js), "max_probability_gap": float(abs(p-q).max())}
```

**Accept:** no comparison against a best-price composite presented as one bookmaker's opinion; show total market coverage and withheld cases.

## F14 — Meeting planner with track and user timezones

**Priority:** P1. **Status:** improves existing schedules/calendar forecasts. **Effort:** 3–5 days.

Plan a race day across UK/US tracks, identify overlaps, and mark which meetings have declarations or only forecast fixtures. Store times in UTC and show both track-local and user-local labels.

**Integrate:** upcoming schedule tabs and exports. Depends on B01 and authoritative track-zone mapping.

```python
from datetime import datetime
from zoneinfo import ZoneInfo

def time_labels(off_at: str, track_zone: str,
                user_zone="America/New_York"):
    off = datetime.fromisoformat(off_at.replace("Z", "+00:00"))
    if off.tzinfo is None:
        raise ValueError("Canonical off time must be timezone-aware")
    return {
        "track_time": off.astimezone(ZoneInfo(track_zone)).strftime("%Y-%m-%d %H:%M %Z"),
        "your_time": off.astimezone(ZoneInfo(user_zone)).strftime("%Y-%m-%d %H:%M %Z"),
    }
```

**Accept:** DST transition fixtures have explicit offsets; ambiguous raw local times are quarantined. Exports preserve status, snapshot, and date; user-local midnight does not change the track's race date.

## F15 — Race dossier export and post-race learning loop

**Priority:** P2. **Status:** new reusable analysis artifact. **Effort:** 4–7 days.

Export a compact pre-race dossier, then append a separate post-race review: price available, uncertainty, result, notes, and what changed. This connects research to feedback without silently rewriting the original forecast.

**Integrate:** `scripts/export_best_bets.py` successor and race-detail download. Depends on F04/F07/B07. Markdown first; PDF can be a later renderer.

```python
import json
import streamlit as st

def dossier(race, rows):
    lines = [f'# Race dossier: {race["race_id"]}',
             f'Snapshot: {race["snapshot_id"]}',
             f'Model: {race["model_bundle"]}', "",
             "| Runner | Win chance | Observed decimal price |",
             "|---|---:|---:|"]
    for row in rows:
        # JSON encoding preserves quotes; escape table delimiters separately.
        name = json.dumps(row["horse"], ensure_ascii=False).replace("|", "\\|")
        name = name.replace("\n", " ").replace("\r", " ")
        odds = row.get("decimal_odds")
        price = f"{odds:.2f}" if odds is not None else "Unavailable"
        lines.append(f'| {name} | {row["p_win"]:.1%} | {price} |')
    return "\n".join(lines)

# Page integration: st.download_button("Download dossier", dossier(race, rows),
#                                     file_name="race-dossier.md")
```

**Accept:** pre-race version is immutable; retrospective commentary is dated and separate. Use original interpretation and source references rather than redistributing licensed race comments.

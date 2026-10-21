# 15 design and experience enhancements

**Code status:** original sketches. Streamlit examples assume the named page inputs exist; they are not wired into the current application. Use supported theme/layout APIs where possible. Any HTML containing provider or user text must be escaped. See [research](06_RESEARCH.md) for verified external inspiration.

## D01 — Race-first home screen

**Priority:** P1. **Status:** redesign of the five-tab landing page. **Effort:** 3–5 days.

Put today's validated races first, with a meeting list, off time, active runner count, freshness, and analysis state. Move fixture forecasting and model operations into separate research/admin destinations. The current default is Upcoming Schedule, while users generally come to inspect a race.

**Integrate:** `predictions_page()` and US entry. Depends on B01/B07; F14 supplies timezone labels.

```python
import streamlit as st

def render_home(races):
    st.title("Equine Edge")
    st.caption("Find a race, inspect the evidence, and save your analysis.")
    eligible = races.loc[races.status.isin(["declared", "live"])]
    meeting = st.selectbox("Meeting", sorted(eligible.course.unique()))
    cards = eligible.loc[eligible.course.eq(meeting)].sort_values("off_at")
    for race in cards.to_dict("records"):
        with st.container(border=True):
            st.subheader(f'{race["local_time"]} · {race["race_name"]}')
            st.caption(f'{race["active_runners"]} runners · {race["data_state"]}')
            if st.button("Open race", key=f'open_{race["race_id"]}'):
                st.query_params["race"] = race["race_id"]
```

**Accept:** users reach a named race in two selection actions; cards never combine two courses sharing a race time; empty meetings show a recovery path. Validate this task flow with users rather than treating two clicks as the only success metric.

## D02 — Persistent race context and shareable links

**Priority:** P1. **Status:** enhancement to race selection. **Effort:** 2–4 days.

Show course, date, timezone, class, distance, surface, going, active runners, and source status above every tab. A copied link should restore race identity and read-only snapshot selection. Avoid encoding notebook text or private portfolio details in the URL.

**Integrate:** race selector and `display_race_details()`. Depends on B01; links resolve only through validated IDs.

```python
import streamlit as st

def selected_race(races):
    valid_ids = races.race_id.astype(str).tolist()
    requested = st.query_params.get("race", "")
    index = valid_ids.index(requested) if requested in valid_ids else 0
    if not valid_ids:
        st.info("No declared races in this snapshot.")
        return None
    race_id = st.selectbox("Race", valid_ids, index=index)
    st.query_params["race"] = race_id
    race = races.loc[races.race_id.astype(str).eq(race_id)].iloc[0]
    st.caption(f'{race.course} · {race.track_date} · {race.local_time} · '
               f'{race.surface} · {race.going} · {race.active_runners} runners')
    return race
```

**Accept:** invalid/expired race links display an explanation and offer the date's meetings. Check ownership before restoring a private snapshot or saved view.

## D03 — Native theme and coherent visual system

**Priority:** P1. **Status:** replaces duplicated CSS overrides. **Effort:** 2–4 days.

Keep the Equine Edge blue identity, add a neutral canvas, consistent hierarchy and spacing, and reserve semantic colors for status. Consolidate the duplicated UK/US theme. Supported Streamlit theme configuration is less brittle than selectors for internal elements ([R16](06_RESEARCH.md#r16--streamlit-official-documentation)).

**Integrate:** proposed `.streamlit/config.toml` and `shared/ui.py`. Remove superseded overrides only after comparing every page.

```toml
[theme]
base = "light"
primaryColor = "#254A82"
backgroundColor = "#F5F7FA"
secondaryBackgroundColor = "#FFFFFF"
textColor = "#172B4D"
font = "sans serif"

[browser]
gatherUsageStats = false
```

**Accept:** one design system covers UK/US/data/portfolio pages; upgrades no longer require repairing dozens of internal selectors. The browser setting is an optional product preference, not required for the theme.

## D04 — Contrast, focus, and color-independent status

**Priority:** P1. **Status:** corrective accessibility enhancement. **Effort:** 3–6 days including manual checks.

The current button foreground/background pair is too similar for ordinary text. Meet WCAG 2.2 AA contrast; use words/icons alongside colors, visible keyboard focus, descriptive labels, and sufficiently large targets. Minimum contrast and target-size guidance come from [W3C](https://www.w3.org/TR/WCAG22/).

**Integrate:** theme and shared status components. The code below calculates text contrast; it does not certify the whole app.

```python
def contrast_ratio(hex_a: str, hex_b: str) -> float:
    def luminance(color):
        rgb = [int(color.lstrip("#")[i:i+2], 16) / 255 for i in (0, 2, 4)]
        linear = [v / 12.92 if v <= 0.04045 else ((v + .055) / 1.055) ** 2.4
                  for v in rgb]
        return sum(v * w for v, w in zip(linear, (.2126, .7152, .0722)))
    bright, dark = sorted([luminance(hex_a), luminance(hex_b)], reverse=True)
    return (bright + .05) / (dark + .05)

assert contrast_ratio("#FFFFFF", "#254A82") >= 4.5
# The current pair should be measured explicitly:
print(contrast_ratio("#152A50", "#3C5A99"))
```

**Accept:** keyboard-only race selection, readable alerts, screen-reader names, and manual phone checks. Include dense tables and plot legends, not just buttons.

## D05 — Correct probability language and numeric tables

**Priority:** P0. **Status:** fix incompatible place/show semantics. **Effort:** 2–4 days.

Show Win, Finish top 2, and Finish top 3. If a user expands details, show exactly second and exactly third as differences. These are finish probabilities; they are not a bookmaker's place contract. Keep numeric values for sorting and export rather than converting everything into formatted strings.

**Integrate:** UK and US runner tables. Depends on B01/M06.

```python
import pandas as pd

def probability_columns(runners: pd.DataFrame) -> pd.DataFrame:
    view = runners.copy()
    # Current primary generator fields are cumulative; rename rather than add.
    view = view.rename(columns={"place_probability": "p_top2",
                                "show_probability": "p_top3",
                                "win_probability": "p_win"})
    valid = (view.p_win.between(0, 1) & view.p_top3.le(1)
             & view.p_top2.ge(view.p_win) & view.p_top3.ge(view.p_top2))
    if not valid.all():
        raise ValueError("Inconsistent cumulative probability snapshot")
    view["p_second"] = view.p_top2 - view.p_win
    view["p_third"] = view.p_top3 - view.p_top2
    return view
```

**Accept:** every view uses the same semantics; raw values remain sortable. Historical v2 outputs used different heuristics, so schema versions must determine migration rather than assuming all old files are cumulative.

## D06 — Prediction provenance drawer

**Priority:** P1. **Status:** extends US provenance to all outputs and metrics. **Effort:** 2–4 days.

Add a discreet "About this prediction" panel: artifact hash, train cutoff, data cutoff, calibrator, feature coverage, jurisdiction, validation status, and whether the model used prices. Users can inspect evidence without reading operational logs.

**Integrate:** Model Insights and race header. Depends on B07/M14.

```python
import streamlit as st

def provenance_drawer(manifest):
    with st.expander("About this prediction"):
        for label, field in [
            ("Model version", "bundle_id"), ("Training through", "train_cutoff"),
            ("Information available through", "decision_cutoff"),
            ("Calibration", "calibration_method"),
            ("Jurisdiction", "jurisdiction"),
            ("Validation status", "validation_status"),
        ]:
            st.write(f'{label}: {manifest.get(field, "Unavailable")}')
        st.caption("Historical evaluation describes this version only.")
```

**Accept:** each displayed metric resolves to the same bundle as its prediction, or is explicitly labeled a comparison model. No vague "120-feature model" text without matching metadata.

## D07 — Honest loading, failure, and recovery states

**Priority:** P1. **Status:** improves blocking fetch/generate UI and false-success path. **Effort:** 3–5 days.

Show queued, running, succeeded, failed, withheld, and stale states. Keep the last validated snapshot visible with its age while a new one runs. Offer an actionable retry/report rather than confetti based solely on exit code zero.

**Integrate:** fetch/generate controls. Depends on B03/B04/B09.

```python
import streamlit as st

def job_status(job):
    state = job["state"]
    if state == "succeeded" and job.get("validated_snapshot_id"):
        st.success("New predictions are ready.")
    elif state == "failed":
        st.error(job.get("public_error", "The update could not finish."))
        st.caption(f'Report reference: {job["run_id"]}')
    elif state == "withheld":
        st.warning("The update finished, but its data checks did not pass.")
    else:
        st.info(f'Update {state}. Last validated predictions remain available.')
```

**Accept:** model-not-found and zero-output runs fail visibly; errors do not expose credentials or raw sensitive logs. Retry uses an idempotency key.

## D08 — Beginner and analyst information density

**Priority:** P1. **Status:** redesign of crowded prediction tables. **Effort:** 2–4 days.

Offer Essential and Analyst views. Essential shows horse, status, win chance, observed price, freshness, and uncertainty. Analyst adds form, rating, draw, connections, and source diagnostics. Preserve model/data state when switching modes.

**Integrate:** existing table renderer. Depends on D05/B01.

```python
import streamlit as st

def runner_table(runners):
    mode = st.radio("Detail level", ["Essential", "Analyst"], horizontal=True)
    essential = ["horse", "status", "p_win", "decimal_odds", "quote_age", "data_state"]
    analyst = ["draw", "weight_lbs", "ofr", "form", "history_runs", "missing_pct"]
    cols = essential + (analyst if mode == "Analyst" else [])
    st.dataframe(runners[[c for c in cols if c in runners]], hide_index=True)
    st.caption("Unknown prices and unavailable history are shown as missing.")
```

**Accept:** phone users understand the essential view without scrolling through 20 columns; analysts retain one-click evidence access. Do not hide validity warnings in Analyst mode.

## D09 — Separate calendar forecasts from declared racecards

**Priority:** P1. **Status:** corrects forecast/actual confusion. **Effort:** 2–4 days.

Label fixture class, going, field size, and prize estimates as forecasts. Use ranges and a neutral style rather than value-bet badges. Replace heuristic "profitability" labels with "race profile score" until an economic model is validated.

**Integrate:** predicted fixtures and top predictive races tabs. Depends on B01/M15/F14.

```python
import streamlit as st

def fixture_header(fixture):
    declared = fixture["stage"] == "declared"
    st.subheader(f'{fixture["course"]} · {fixture["track_date"]}')
    if declared:
        st.caption("Declared racecard · published race conditions")
    else:
        st.info("Calendar forecast · runners and conditions are not confirmed")
        st.write(f'Expected runners: {fixture["field_low"]}–{fixture["field_high"]}')
        st.caption("Race profile score describes the fixture, not expected profit.")
```

**Accept:** no scenario forecast is promoted to a confirmed race fact; exports include stage and estimated-field markers.

## D10 — Global search with race-aware results

**Priority:** P2. **Status:** unifies existing horse/course filters. **Effort:** 3–6 days.

Search horse, trainer, jockey, course, or date from one control. Results should identify jurisdiction and IDs; identical names must not be merged. Name normalization is useful for discovery, not canonical entity resolution.

**Integrate:** sidebar and Data Explorer. Depends on B01/B10; large-scale search can follow later.

```python
import pandas as pd

def search_entities(index: pd.DataFrame, query: str) -> pd.DataFrame:
    needle = query.casefold().strip()
    if len(needle) < 2:
        return index.iloc[:0]
    hits = index.loc[index.display_name.str.casefold().str.contains(
        needle, regex=False, na=False)].copy()
    hits["exact"] = hits.display_name.str.casefold().eq(needle)
    return hits.sort_values(["exact", "display_name"], ascending=[False, True]).head(30)
```

**Accept:** at least 30 representative names, aliases, punctuation variants, and duplicate names resolve visibly and safely. Never join odds/results solely on this search match.

## D11 — Inline definitions and jurisdiction-specific odds

**Priority:** P1. **Status:** reduces ambiguous terminology. **Effort:** 2–3 days.

Give short explanations of fair odds, implied chance, percentage-point edge, expected return, place terms, and takeout. Let users choose decimal/fractional/American display, while canonical storage remains decimal. UK each-way and US show are separate products.

**Integrate:** value calculator and shared odds-format controls. Depends on existing odds converter; B01 separates price types.

```python
def american_odds(decimal: float) -> int:
    if decimal <= 1:
        raise ValueError("Decimal odds must exceed one")
    return round((decimal - 1) * 100) if decimal >= 2 else round(-100 / (decimal - 1))

def value_labels(p_win, decimal):
    if not 0 <= p_win <= 1 or decimal <= 1:
        raise ValueError("Invalid probability or price")
    return {
        "model_chance": f"{p_win:.1%}",
        "break_even_chance": f"{1 / decimal:.1%}",
        "difference_pp": f"{100 * (p_win - 1 / decimal):+.1f} pp",
        "gross_expected_return": f"{p_win * decimal - 1:+.1%}",
    }
```

**Accept:** edge and EV have distinct labels; gross expected return is not shown as net of commission. Place-payout terms sit beside place probabilities.

## D12 — Local explanation with evidence and caveats

**Priority:** P2. **Status:** enhances global feature importance into per-runner explanation. **Effort:** 4–8 days.

Show the largest model contributions for this prediction, supporting historical records, and missing signals. Do not describe contributions as causal effects. If a model used market odds, make that visible rather than implying an independent opinion.

**Integrate:** race briefing and comparison view. Depends on B07 and an explainer validated for the chosen model/output scale; optional SHAP dependency.

```python
import streamlit as st

def explanation_panel(contributions, evidence, scale="model raw score"):
    ranked = sorted(contributions.items(), key=lambda item: abs(item[1]), reverse=True)[:5]
    st.caption(f"Contributions on {scale}; these are associations, not causes.")
    for feature, amount in ranked:
        st.write(f"{feature}: {amount:+.3f}")
        records = evidence.get(feature, [])
        st.caption("Evidence records: " + ", ".join(map(str, records[:3]))
                   if records else "No linked evidence record")
```

**Accept:** explainer base plus contributions reconstructs the specified output within tolerance; calibrated/race-normalized probabilities are not claimed to equal raw tree contributions.

## D13 — Freshness and source-quality ribbon

**Priority:** P1. **Status:** improves file-existence badges. **Effort:** 2–4 days.

Display entries age, odds age, active field coverage, and source conflicts at the race header. A file existing does not establish that its price is current or that a complete field was captured.

**Integrate:** `show_racecard_status()`, `show_prediction_status()` and US status panels. Depends on B01/B08/B09.

```python
from datetime import datetime
import streamlit as st

def freshness(available_at: str, now: datetime, max_age_seconds=120):
    stamp = datetime.fromisoformat(available_at.replace("Z", "+00:00"))
    if now.tzinfo is None or stamp.tzinfo is None:
        raise ValueError("Timezone-aware timestamps required")
    age = (now - stamp).total_seconds()
    if age < 0:
        return "Clock/timestamp conflict"
    return "Current" if age <= max_age_seconds else "Stale"

def freshness_ribbon(quality):
    st.caption(f'Entries: {quality["entries"]} · Odds: {quality["odds"]} · '
               f'Field coverage: {quality["covered"]}/{quality["active"]}')
```

**Accept:** stale-price actions are disabled by policy where necessary; thresholds differ by source and stage rather than blindly using the demo's two minutes.

## D14 — Learning-oriented result review

**Priority:** P2. **Status:** redesign/extension of ROI and calibration pages. **Effort:** 4–7 days.

Review calibration, realized outcomes, prices, uncertainty, and decision reasons. Avoid victory animations or streak framing for individual outcomes. Show the number of evaluated races and price coverage with every chart.

**Integrate:** Backtest Results and paper portfolio. Depends on F04/M14.

```python
import streamlit as st

def review_summary(report):
    st.subheader("Decision review")
    st.write(f'{report["races"]:,} races · {report["settled_bets"]:,} settled paper bets')
    st.write(f'Observed-price coverage: {report["price_coverage"]:.1%}')
    st.write(f'Net return on stakes: {report["roi"]:+.1%}')
    low, high = report["roi_interval"]
    st.caption(f'Race-day bootstrap interval: {low:+.1%} to {high:+.1%}')
    st.caption("One result does not resolve whether a probability forecast was good.")
```

**Accept:** show losing periods and withheld races; synthetic P&L never appears alongside observed P&L without explicit labeling. Intervals identify resampling unit and assumptions.

## D15 — Saved views and consistent interaction state

**Priority:** P2. **Status:** persistent personalization beyond rerun-local filters. **Effort:** 3–6 days.

Save favorite meetings, columns, sort order, odds style, and detail level. Keep volatile race selection in session/query state, while preferences belong to an owner-controlled repository. A refresh should not unexpectedly erase comparison selection.

**Integrate:** shared filter controls. Depends on B02/B11 and D08/D11.

```python
import streamlit as st

def filter_state(default_course="All"):
    defaults = {"course": default_course, "odds_style": "decimal",
                "detail": "Essential", "min_probability": 0.0}
    for key, value in defaults.items():
        st.session_state.setdefault(f"view_{key}", value)
    return {key: st.session_state[f"view_{key}"] for key in defaults}

def safe_saved_view(payload):
    allowed = {"course", "odds_style", "detail", "min_probability"}
    if set(payload) - allowed:
        raise ValueError("Unsupported preference")
    if payload.get("odds_style", "decimal") not in {"decimal", "fractional", "american"}:
        raise ValueError("Unknown odds style")
    return dict(payload)
```

**Accept:** preferences are isolated by owner; anonymous sessions do not share stored views. Validate course/detail/numeric values fully when implementing the persistence adapter.

# 15 model and statistical enhancements

**Recommendation:** establish a race-coherent, point-in-time baseline and compare it with a contemporaneous market baseline before architectural experimentation. High runner classification accuracy is especially unhelpful when most runners lose. Report race-level likelihood, calibration, top-k, coverage, and observed-price decision outcomes.

All snippets below are original research/implementation sketches. They do not establish predictive uplift. New fields and modules are proposed; optional dependencies are named. Fit preprocessing, hyperparameters, calibrators, blend weights, and selection policies using earlier data only. Preserve a final untouched forward period. Standard single-winner formulas require a separate policy for dead heats, voids, and incomplete fields.

## M01 — Race-preserving temporal validation and stacking

**Priority:** P0. **Status:** fixes ordinary stacking CV and row-slice boundaries. **Effort:** 6–10 days.

Use expanding chronological folds by race date, with an availability gap appropriate to source delays. Generate out-of-fold base predictions manually; train the meta-model only on genuine OOF predictions. Exclude warm-up rows rather than filling them with zero. A TimeSeriesSplit passed directly to sklearn StackingClassifier is not a guaranteed drop-in because its internal cross-validation expects partition-style coverage.

**Integrate:** `scripts/ensemble_model.py::train_ensemble/make_oof_predictions`; `backtest_walk_forward.py`. Depends on B01/B05/B06.

```python
import pandas as pd

def temporal_folds(race_rows, test_starts, test_days=28, gap_days=7):
    work = race_rows.copy()
    work["race_day"] = pd.to_datetime(work.race_day, utc=True).dt.normalize()
    # All rows of a race must agree on date before splitting.
    if (work.groupby("race_id").race_day.nunique() != 1).any():
        raise ValueError("Race has conflicting dates")
    for start in test_starts:
        start = pd.Timestamp(start)
        if start.tzinfo is None:
            start = start.tz_localize("UTC")
        stop = start + pd.Timedelta(days=test_days)
        train = work.loc[work.race_day < start - pd.Timedelta(days=gap_days)]
        test = work.loc[work.race_day.ge(start) & work.race_day.lt(stop)]
        assert not set(train.race_id) & set(test.race_id)
        yield train, test
```

**Accept:** every train timestamp precedes test, no race crosses a fold, and forward additions leave earlier features unchanged. Gap is a conservative supplement to availability checks, not a cure for leakage inside engineered features.

## M02 — One feature builder for training, replay, and live inference

**Priority:** P0. **Status:** corrects placeholders and train/inference semantic drift. **Effort:** 7–12 days.

Compute statistics from available prior runs plus current declarations. Use decision time or race time deliberately for days-off; never wall-clock "now" for replay. Distinguish no career history from failed linkage. Use the same builder offline and online; verify exact feature parity on historical fixtures.

**Integrate:** UK `build_features_from_historical_record()` and US `_build_horse_features()`. Depends on B05/B06.

```python
import numpy as np
import pandas as pd

def basic_form_features(prior, race_at):
    off = pd.Timestamp(race_at)
    rows = prior.sort_values("event_at", ascending=False)
    if rows.empty:
        return {"career_runs": 0, "career_win_rate": np.nan,
                "avg_last_3_pos": np.nan, "days_since_last": np.nan,
                "history_missing": 1}
    if pd.to_datetime(rows.event_at, utc=True).max() >= off:
        raise ValueError("Non-prior result in feature input")
    pos = pd.to_numeric(rows.position, errors="coerce")
    last = pd.Timestamp(rows.iloc[0].event_at)
    return {"career_runs": len(rows), "career_win_rate": pos.eq(1).mean(),
            "avg_last_3_pos": pos.head(3).mean(),
            "days_since_last": (off - last).total_seconds() / 86400,
            "history_missing": 0}
```

**Accept:** resolved horse IDs and cutoff-filtered inputs are required. Nonfinishers are encoded explicitly rather than dropped from the loss denominator; course/distance and current connections features use current declared context.

## M03 — Full-field win distributions and race likelihood

**Priority:** P0. **Status:** corrects independent output shrinkage; US market-input normalization and coherent saved outputs are useful starting points. **Effort:** 4–7 days.

Represent every complete active field as a categorical distribution with one winner. A softmax over learned race scores is a natural baseline; normalizing binary classifier probabilities is a transitional option that needs recalibration and evaluation. Include field-relative features, since race-constant class/field-size inputs alone cannot rank horses within a field.

**Integrate:** prediction postprocessing, diagnostics, backtest metrics. Depends on B01/M02; no claimed uplift from normalization alone.

```python
import numpy as np

def race_probabilities(scores, temperature=1.0):
    scores = np.asarray(scores, dtype=float)
    if scores.ndim != 1 or len(scores) == 0 or not np.isfinite(scores).all():
        raise ValueError("Need a complete finite field")
    if not np.isfinite(temperature) or temperature <= 0:
        raise ValueError("Temperature must be positive")
    shifted = (scores - scores.max()) / temperature
    strengths = np.exp(shifted)
    return strengths / strengths.sum()

def race_log_loss(probabilities, winner_index):
    return float(-np.log(max(float(probabilities[winner_index]), 1e-15)))
```

**Accept:** active probabilities sum to one; scratch recomputation works; evaluate unweighted mean loss per race and Brier against uniform/market baselines. Define ties/voids and distinguish a walkover from an ordinary betting race.

## M04 — Learn a market-residual or Benter-style blend

**Priority:** P1. **Status:** replaces fixed 65/35 US blend with a trained challenger. **Effort:** 6–10 days after price history exists.

Combine a fundamental model with a coherent pre-race market distribution, fitting blend coefficients on independent temporal calibration data. Alternatively model residual advantage over market logits. Compare independent, market-only, and blended models; never claim market-derived predictions are independent price discovery. Benter's report motivates the concept, not transferability of returns ([R10](06_RESEARCH.md#r10--william-benter-1994)).

**Integrate:** US fixed blend and UK value analysis. Depends on complete B08 snapshots/M03/M05.

```python
import numpy as np

def market_distribution(decimal_odds):
    odds = np.asarray(decimal_odds, float)
    if not np.isfinite(odds).all() or np.any(odds <= 1):
        raise ValueError("Complete valid odds required")
    raw = 1 / odds
    return raw / raw.sum()  # Multiplicative de-vig baseline, not a universal truth.

def log_pool(p_fundamental, p_market, alpha=1.0, beta=1.0):
    p, q = np.asarray(p_fundamental, float), np.asarray(p_market, float)
    if (p.ndim != 1 or p.shape != q.shape or not np.isfinite(p).all()
            or not np.isfinite(q).all() or np.any(p <= 0) or np.any(q <= 0)):
        raise ValueError("Matching positive field distributions required")
    if not np.isclose(p.sum(), 1) or not np.isclose(q.sum(), 1):
        raise ValueError("Field distributions must sum to one")
    if not np.isfinite([alpha, beta]).all():
        raise ValueError("Blend coefficients must be finite")
    scores = alpha * np.log(p) + beta * np.log(q)
    weights = np.exp(scores - scores.max())
    return weights / weights.sum()
```

**Accept:** fit alpha/beta before test; monitor coverage and calibration by odds band. De-vig one provider/market snapshot; do not use a best-price composite or future closing price as morning input. Economic EV still uses the offered payout/commission, not de-vig probability alone.

## M05 — Independent calibration with compatible APIs

**Priority:** P0. **Status:** replaces hand-chosen shrinkage and audits `cv="prefit"` compatibility. **Effort:** 4–8 days.

Separate train, meta-model, calibrator, and final test periods. Compare sigmoid/isotonic and race-temperature calibration under the same time splits. Guo et al. motivate temperature scaling but studied other tasks; it must be tested for racing ([R11](06_RESEARCH.md#r11--guo-et-al-2017)). The repository pins sklearn 1.8; use its documented FrozenEstimator path instead of assuming legacy prefit behavior.

**Integrate:** `scripts/ensemble_model.py::calibrate`, UK/US postprocessors. Depends on M01/M03/B07.

```python
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

def heldout_sigmoid(fitted_model, X_calibration, y_calibration):
    # The fitted model's training period must end before this period.
    calibrator = CalibratedClassifierCV(
        estimator=FrozenEstimator(fitted_model), method="sigmoid"
    )
    calibrator.fit(X_calibration, y_calibration)
    return calibrator
```

**Accept:** artifact stores calibration date range and method. This snippet calibrates binary outputs; after converting them to a field distribution, evaluate and if necessary fit a race-level temperature on separate data. Report calibration curves/counts by field size, country, and odds band.

## M06 — Joint finish-order model for top-k and exotics

**Priority:** P0 for consistent semantics; P2 for exotic pricing. **Status:** improves existing Harville-like UI calculations and heuristic place/show. **Effort:** 6–10 days.

The current exacta expression is already sequential rather than an independent product, but it assumes normalized, coherent strengths and does not validate a finish-order model. Start with Plackett–Luce order sampling; test against actual order outcomes. Richer dependence models can follow. Never label inferred exotic probability as an executable payout.

**Integrate:** `display_exacta_trifecta()`, place/show generation and calculators. Depends on M03/B01; handle bookmaker terms separately.

```python
import numpy as np

def plackett_luce_topk(strengths, simulations=20000, seed=42):
    s = np.asarray(strengths, float)
    if s.ndim != 1 or not len(s) or not np.isfinite(s).all() or np.any(s <= 0):
        raise ValueError("Positive finite runner strengths required")
    if not isinstance(simulations, int) or simulations <= 0:
        raise ValueError("Positive simulation count required")
    rng = np.random.default_rng(seed)
    # Gumbel ranking samples the Plackett–Luce permutation distribution.
    utility = np.log(s)[None, :] + rng.gumbel(size=(simulations, len(s)))
    order = np.argsort(-utility, axis=1)
    position = np.argsort(order, axis=1)
    return {
        "p_win": (position < 1).mean(axis=0),
        "p_top2": (position < min(2, len(s))).mean(axis=0),
        "p_top3": (position < min(3, len(s))).mean(axis=0),
        "orders": order,
    }
```

**Accept:** sums of top2/top3 equal min(2,n)/min(3,n), probabilities are monotone, simulation error is reported, and conditional-order assumptions are disclosed. Remove scratches first; model dead heats/nonfinishers and pool takeout in a separate settlement layer.

## M07 — Integrated race-group ranking challenger

**Priority:** P1. **Status:** replaces/validates existing ranker prototype. **Effort:** 5–9 days.

The existing `us_train_ranker.py` uses finishing position as a relevance target while commenting that lower is better and references `np` without importing it. Ranking objectives generally interpret larger labels as higher relevance. Fix target direction, explicit features, race grouping, and evaluation before treating it as a deployed model. LightGBM provides a documented grouped ranker ([R05](06_RESEARCH.md#r05--lightgbm)).

**Integrate:** US ranker script and model registry. Depends on M01/M02. LightGBM is already listed in requirements.

```python
from lightgbm import LGBMRanker

def train_race_ranker(train, feature_cols):
    work = train.sort_values(["race_id", "runner_id"]).copy()
    # Binary relevance targets the winner. Larger relevance is better.
    relevance = work.position.eq(1).astype(int)
    group_sizes = work.groupby("race_id", sort=False).size().to_numpy()
    ranker = LGBMRanker(objective="lambdarank", n_estimators=300,
                        learning_rate=0.03, num_leaves=15, random_state=42)
    ranker.fit(work[feature_cols], relevance, group=group_sizes)
    return ranker
```

**Accept:** higher score ranks winner relevance correctly on a tiny fixture; all rows of each race are contiguous and features exclude finish/result columns. Ranking scores are not probabilities: add independently fitted race-temperature calibration and compare top1/log loss, not NDCG alone.

## M08 — Shrunk connections and condition statistics

**Priority:** P1. **Status:** upgrades raw career/30-day rates. **Effort:** 4–7 days.

Shrink sparse jockey, trainer, sire, and conditions rates toward a jurisdiction-specific prior. Show posterior uncertainty/sample count. Strong-looking one-win-from-one-run angles should not overwhelm a model. Use past opportunity counts that were actually available at the decision time.

**Integrate:** connection/going/pedigree feature scripts. Depends on B05/M02. Empirical Bayes hyperparameters are estimated on training data only.

```python
def posterior_rate(wins, runs, population_rate, prior_strength=30.0):
    if not 0 <= wins <= runs or runs < 0:
        raise ValueError("Invalid historical counts")
    if not 0 < population_rate < 1 or prior_strength <= 0:
        raise ValueError("Invalid prior")
    a = wins + population_rate * prior_strength
    b = runs - wins + (1 - population_rate) * prior_strength
    return {"mean": a / (a + b),
            "variance": a * b / ((a + b) ** 2 * (a + b + 1)),
            "runs": runs}
```

**Accept:** one-for-one stays suitably shrunk, abundant histories converge toward observed rates, and unseen entities use a documented prior. Opportunity-adjusted residuals versus expected market wins are a further experiment, not assumed inherent skill.

## M09 — Jurisdiction and discipline-aware routing

**Priority:** P1. **Status:** strengthens existing dedicated US model selection. **Effort:** 6–10 days.

Separate UK Flat, UK jumps, US Thoroughbred dirt/turf, harness, and Quarter Horse when sample size supports it. Share core signals through a hierarchical/pooled challenger, but withhold unsupported domains. Populate US speed/workout inputs before claiming the US model benefits from them; retain missingness instead of zero-filling unknown measurements.

**Integrate:** US/UK loaders and registry. Depends on B01/B06/B07, M02.

```python
def choose_domain_bundle(race, registry):
    domain = (race["jurisdiction"], race["discipline"], race["surface"])
    entry = registry.get(domain)
    if entry is None or entry["validation_status"] != "passed":
        return {"state": "withheld", "reason": "No validated model for this domain"}
    return {"state": "ready", "bundle_id": entry["bundle_id"],
            "feature_contract": entry["feature_contract"]}

def add_missing_indicators(X):
    result = X.copy()
    for feature in X.columns:
        result[f"{feature}__missing"] = X[feature].isna().astype("int8")
    return result
```

**Accept:** a harness race never silently falls back to a Thoroughbred model; per-domain calibration/coverage is reported. Missing indicators change the feature contract and require retraining.

## M10 — Pace, sectionals, and field interactions

**Priority:** P2. **Status:** extends existing pace/speed feature scripts. **Effort:** 8–15 days plus data acquisition.

Model how many credible leaders are in the field, draw × style interactions, closing speed, pace-adjusted prior performance, and race-specific speed variation. Aftalion and Mercier's research motivates interactions between pace, terrain, and physical effort; it does not justify a universal numerical correction ([R13](06_RESEARCH.md#r13--aftalion-and-mercier-2020)).

**Integrate:** `add_pace_features.py`, US speed/trip features, scenario studio. Depends on B05 and licensed/available sectionals.

```python
import pandas as pd

def field_pace_features(runners: pd.DataFrame) -> pd.DataFrame:
    out = runners.copy()
    # early_pace_z is scaled using training-only course/distance parameters.
    out["credible_leader"] = out.early_pace_z.ge(1.0).astype(int)
    groups = out.groupby("race_id")
    out["leader_count"] = groups.credible_leader.transform("sum")
    out["pace_vs_field"] = out.early_pace_z - groups.early_pace_z.transform("mean")
    out["pace_pressure"] = out.leader_count - out.credible_leader
    out["draw_style_interaction"] = out.draw_percentile * out.early_pace_z
    return out
```

**Accept:** missing figures remain missing and quality is measured by source. Learn/validate interactions rather than assuming "more leaders always favors closers". Test incremental forward loss and decision return after fees.

## M11 — Provenance-preserving trip-text features

**Priority:** P2. **Status:** expands existing US trip extraction. **Effort:** 5–10 days rule baseline; longer for learned NLP.

Turn prior-run comments into interpretable tags with source, offset, and annotation date. Start with high-precision patterns, then label a small corpus for a richer extractor. Avoid using the current race's result comment to predict that same race. Distinguish vocabulary differences across providers.

**Integrate:** `us_extract_trip_features.py`, enhanced form, F07. Depends on B05 and permitted source text.

```python
import re

PATTERNS = {
    "blocked": re.compile(r"\b(blocked|denied (?:a )?clear run)\b", re.I),
    "wide": re.compile(r"\b(?:three|four|3|4)[ -]wide\b", re.I),
    "slow_start": re.compile(r"\b(slow(?:ly)? away|missed (?:the )?break)\b", re.I),
}

def trip_tags(comment, source_record_id):
    findings = []
    for tag, pattern in PATTERNS.items():
        for match in pattern.finditer(comment or ""):
            findings.append({"tag": tag, "source": source_record_id,
                             "start": match.start(), "end": match.end(),
                             "extractor_version": "rules-v1"})
    return findings
```

**Accept:** label precision/recall on held-out provider comments; handle negation and ambiguity before adding learned correction magnitudes. Raw tags indicate textual evidence, not proof a horse would have won unobstructed.

## M12 — Uncertainty, winner sets, and abstention

**Priority:** P1 for abstention, P2 for conformal research. **Status:** new uncertainty policy. **Effort:** 5–9 days.

Withhold a recommendation when feature/price coverage is inadequate or model disagreement is large. Display a plausible winner set rather than a fabricated confidence interval around a single horse's probability. Conformal winner sets can be piloted using race-level held-out scores. Temporal racing data may violate exchangeability, so nominal coverage must be measured rather than promised ([R12](06_RESEARCH.md#r12--angelopoulos-and-bates-2021)).

**Integrate:** prediction status, race briefing, model report. Depends on M01/M03/B06.

```python
import math
import numpy as np

def winner_set(calibration_true_winner_probs, current_probs, alpha=0.10):
    cal = np.asarray(calibration_true_winner_probs, float)
    p = np.asarray(current_probs, float)
    if len(cal) == 0 or not 0 < alpha < 1:
        raise ValueError("Need calibration races and valid alpha")
    if not np.isfinite(cal).all() or np.any((cal < 0) | (cal > 1)):
        raise ValueError("Invalid calibration probabilities")
    if not np.isfinite(p).all() or np.any(p < 0) or not np.isclose(p.sum(), 1):
        raise ValueError("Need current complete-field distribution")
    scores = np.sort(1 - cal)
    k = math.ceil((len(scores) + 1) * (1 - alpha))
    threshold = scores[k-1] if k <= len(scores) else 1.0
    return np.flatnonzero(1 - p <= threshold).tolist()
```

**Accept:** report empirical future-race coverage and average set size by domain/field size; empty/large sets are shown honestly. A winner set is not a probability interval or a return guarantee. Adaptation under drift is a separate experiment.

## M13 — Permutation-equivariant field model challenger

**Priority:** P3. **Status:** research beyond tabular/ranking models. **Effort:** 3–6 weeks after foundational work.

Treat the race as a variable-size set of runners. Encode each runner and pool field context; predict one score per runner without depending on arbitrary row order. Deep Sets motivates this architecture ([R14](06_RESEARCH.md#r14--zaheer-et-al-2017)). Keep it as a challenger to strong tree/market baselines.

**Integrate:** proposed experimental module `experiments/field_sets.py`, never replace production directly. Optional dependency: PyTorch.

```python
import torch
from torch import nn

class FieldSetModel(nn.Module):
    def __init__(self, features, hidden=24):
        super().__init__()
        self.encode = nn.Sequential(nn.Linear(features, hidden), nn.ReLU())
        self.score = nn.Sequential(nn.Linear(hidden * 2 + 1, hidden),
                                    nn.ReLU(), nn.Linear(hidden, 1))

    def forward(self, x, active):  # x: batch x runners x features; active: bool mask
        count = active.sum(dim=1, keepdim=True)
        if torch.any(count == 0):
            raise ValueError("Empty field")
        h = self.encode(x)
        context = (h * active.unsqueeze(-1)).sum(1) / count
        field = context.unsqueeze(1).expand_as(h)
        size = count.float().log().unsqueeze(1).expand(-1, x.shape[1], -1)
        logits = self.score(torch.cat([h, field, size], dim=-1)).squeeze(-1)
        return logits.masked_fill(~active, float("-inf"))
```

**Accept:** softmax masks padding; permutation changes only runner order, not corresponding probabilities; train with race cross-entropy. Supply missingness encodings rather than NaNs to this network. Promote only on untouched forward loss and decision evidence after compute/data cost.

## M14 — Exact-predictor market evaluation and day-clustered uncertainty

**Priority:** P0. **Status:** strengthens existing backtest gate and simulated-price labeling. **Effort:** 8–15 days after B08 history.

Evaluate the exact inference bundle, transformations, cutoffs, and stake policy. Report observed quote coverage, offered odds, commission, withdrawals/dead heats, liquidity, net return on stake, CLV, maximum drawdown, and calibration. Estimate uncertainty by resampling race days rather than individual correlated runners. Preserve the complete ledger so any headline can be reproduced.

**Integrate:** `backtest_walk_forward.py`, `enforce_backtest_gate.py`, release workflow. Depends on B07/B08/M01–M06/F04.

```python
import numpy as np

def day_bootstrap_roi(settled, simulations=2000, seed=42):
    # net_profit already includes settlement terms/commission; exclude open bets.
    daily = settled.groupby("race_day")[["net_profit", "stake"]].sum()
    values = daily.to_numpy(dtype=float)
    if len(values) < 30 or not np.isfinite(values).all() or values[:, 1].sum() <= 0:
        raise ValueError("Need at least 30 funded settled race days")
    rng = np.random.default_rng(seed)
    totals = values[rng.integers(0, len(values), size=(simulations, len(values)))].sum(1)
    positive_stake = totals[:, 1] > 0
    returns = totals[positive_stake, 0] / totals[positive_stake, 1]
    return np.quantile(returns, [0.025, 0.975]).tolist()
```

**Accept:** separate discrimination, calibration, and economic gates; fail missing/nonfinite metrics; zero observed-price decisions means economic validation is unavailable. Require same bundle hash in run/ledger/UI. The 30-day floor is an illustrative minimum, not sufficient evidence; season length, regime stability and effective sample size matter. Day bootstrap assumes days are a reasonable cluster unit; test block resampling for serial dependence.

## M15 — Learn race selection instead of equating prestige with value

**Priority:** P2. **Status:** challenger to class/prize/course heuristic score. **Effort:** 6–10 days.

Estimate whether a race is suitable for analysis using predicted uncertainty, price coverage, domain validation, liquidity, feature completeness, and cross-model disagreement. Keep race prestige as descriptive context. Optimize the abstention threshold on earlier folds, then freeze it for future evaluation. A race-level selection model must not use the future winner or realized payout as a pre-race feature.

**Integrate:** `phase2_score_races.py`, top race views, fixture forecasts. Depends on M12/M14/B09; forecast fixtures cannot have a priced value score.

```python
def race_readiness(quality):
    blockers = []
    if not quality["declared"]:
        blockers.append("No declared field")
    if quality["feature_coverage"] < 0.9:
        blockers.append("Feature coverage below policy")
    if quality["quote_coverage"] < 1.0:
        blockers.append("Incomplete market snapshot")
    if not quality["domain_validated"]:
        blockers.append("Unsupported model domain")
    return {"eligible": not blockers, "reasons": blockers}
```

**Accept:** this transparent baseline beats arbitrary prestige gating on coverage/calibration usefulness; a learned selector must outperform it forward. Report selection coverage and results of abstained races to expose selection bias.

## Experiment discipline

Register each challenger with feature list, training cutoff, pricing cutoff, hypothesis, cost, metrics, and acceptance threshold before the final test. Include uniform, market-only, current production, and simple logistic/tree baselines. Review paired per-race losses and segment effects; do not repeatedly search the final season for the most profitable angle. Deep models and reinforcement-learning staking remain research until feature completeness and honest price evaluation are established.

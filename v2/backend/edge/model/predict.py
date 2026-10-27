"""Race-level predictor: form model + market → one coherent distribution.

Pipeline for a race:

1. Group active runners into betting interests (coupled entries "1"/"1A"
   are one bet and one tote price).
2. Form score per runner from :mod:`edge.features` and the breed model; a
   betting interest's form score is the log-sum-exp of its members.
3. Market probability per interest from live tote odds, else the morning
   line, de-vigged.
4. Blend in log space (Benter 1994):
       logit_i = a · log q_i + b · w_i · (s_i − mean(s))
   where ``w_i`` is the evidence weight, so a runner we know nothing about
   sits at the market's opinion instead of at a made-up form figure.
5. Finishing-order probabilities (place/show/exacta/trifecta) all come from
   the same blended win distribution.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from dataclasses import dataclass, field

import numpy as np

from ..domain import Race, Runner
from ..features import RaceContext, breed_group, horse_key, normalise_surface, runner_features
from ..history import History
from ..odds import decimal_to_us, fair_decimal, market_probabilities
from .logit import FormModel
from .orders import order_probabilities, top_combinations

# Blend weights. Fixed priors until `edge calibrate` has enough recorded
# races (see docs/DECISIONS.md D-004). Live tote prices are sharper than the
# morning line, so the form model gets less say against them.
BLEND = {
    "live": {"a": 1.0, "b": 0.40},
    "morning_line": {"a": 0.85, "b": 0.60},
}
BLEND_FILE = Path(__file__).parent / "artifacts" / "blend.json"
BLEND_CALIBRATED = False      # True once weights come from the app's own recorded races
if BLEND_FILE.exists():  # written by `edge calibrate` once enough races are recorded
    try:
        BLEND.update({k: v for k, v in json.loads(BLEND_FILE.read_text()).get("weights", {}).items() if k in BLEND})
        BLEND_CALIBRATED = True
    except (OSError, ValueError):
        pass
MIN_PRICE_PREMIUM = 0.15      # "bet above" = fair price × (1 + premium)
VALUE_EDGE_PTS = 2.0          # model % − market % needed to flag value...
VALUE_MIN_RETURN = 0.10       # ...and expected return per $1 at the current price
EVIDENCE_LEVELS = (           # (min prior starts, label, blend weight)
    (6, "strong", 1.0),
    (3, "some", 0.8),
    (1, "thin", 0.45),
    (0, "none", 0.0),
)


def evidence_for(starts: int) -> tuple[str, float]:
    for min_starts, label, weight in EVIDENCE_LEVELS:
        if starts >= min_starts:
            return label, weight
    return "none", 0.0


@dataclass
class InterestPrediction:
    key: str                         # betting-interest number ("1" for 1 & 1A)
    programs: list[str]
    names: list[str]
    runners: list[Runner]
    starts: int
    evidence: str
    form_score: float
    p_form: float = 0.0
    form_term: float = 0.0           # w · (s − mean s): the form input to the blend
    p_market: float | None = None
    p_model: float = 0.0
    p_top2: float = 0.0
    p_top3: float = 0.0
    price: float | None = None       # decimal used for edge (live, else ML)
    price_source: str | None = None
    fair: float | None = None
    edge_pts: float | None = None    # model % − market % (percentage points)
    exp_return: float | None = None  # expected return per $1 at `price`
    min_price: float | None = None
    value: bool = False
    rank: int = 0


@dataclass
class RacePrediction:
    race: Race
    interests: list[InterestPrediction]
    market: str                      # live | morning_line | none
    model_version: str
    weights: dict
    exacta: list[tuple[tuple[str, ...], float]] = field(default_factory=list)
    trifecta: list[tuple[tuple[str, ...], float]] = field(default_factory=list)
    scratched_by_user: list[str] = field(default_factory=list)
    evidence: str = "none"
    coverage: float = 0.0            # share of interests with ≥ 3 prior starts
    overround: float | None = None


def _interest_key(r: Runner) -> str:
    return r.coupled_with or r.program


def predict_race(race: Race, history: History, model: FormModel, scratches: frozenset[str] = frozenset()) -> RacePrediction:
    scratched_user = sorted(p for p in scratches if any(r.program == p and not r.scratched for r in race.runners))
    active = [r for r in race.runners if not r.scratched and r.program not in scratches]
    groups: dict[str, list[Runner]] = {}
    for r in active:
        groups.setdefault(_interest_key(r), []).append(r)
    if not groups:
        return RacePrediction(race, [], "none", model.version, {}, scratched_by_user=scratched_user)

    breed = race.breed.value
    bg = breed_group(breed, race.country)
    # The form model is trained on US races only; outside the US every runner
    # has no usable history, so the prediction is the de-vigged market.
    use_history = race.country == "USA"
    ctx = RaceContext(day=race.card_date, track=race.track_code, surface=normalise_surface(race.surface),
                      dist_f=race.distance_furlongs, purse=race.purse, field_size=len(active))

    feats, starts = [], []
    for r in active:
        past = history.past(horse_key(r.name, bg), before=race.card_date) if use_history else []
        feats.append(runner_features(past, ctx, r.post or _program_int(r.program)))
        starts.append(len(past))
    scores = model.score(breed, np.vstack(feats))
    by_program = {r.program: (s, n) for r, s, n in zip(active, scores, starts)}

    interests: list[InterestPrediction] = []
    for key, members in groups.items():
        ms = [by_program[m.program][0] for m in members]
        n = max(by_program[m.program][1] for m in members)
        level, _ = evidence_for(n)
        lead = next((m for m in members if m.program == key), members[0])
        price, src = _price(lead, members)
        interests.append(InterestPrediction(
            key=key, programs=[m.program for m in members], names=[m.name for m in members], runners=members,
            starts=n, evidence=level, form_score=float(np.logaddexp.reduce(ms)), price=price, price_source=src))

    # -- market ------------------------------------------------------------------
    live = all(i.price_source == "live" for i in interests)
    priced = [i for i in interests if i.price]
    market = "live" if live and priced else ("morning_line" if priced else "none")
    q = market_probabilities([i.price for i in interests])
    if market != "none":
        known = [x for x in q if x is not None]
        floor = min(known) * 0.5 if known else 1.0 / len(interests)
        q = [x if x is not None else floor for x in q]
        tot = sum(q)
        q = [x / tot for x in q]

    # -- form-only distribution ---------------------------------------------------
    s = np.array([i.form_score for i in interests])
    pf = np.exp(s - s.max())
    pf /= pf.sum()
    # Centre on the whole field (unknown runners sit at the model's prior for a
    # debut), so a lone known horse is still judged against the others.
    centre = s.mean()
    w = np.array([evidence_for(i.starts)[1] for i in interests])

    weights = dict(BLEND.get(market, {"a": 0.0, "b": 1.0}))
    if market == "none":
        logits = s
    else:
        logits = weights["a"] * np.log(np.array(q)) + weights["b"] * w * (s - centre)
    pm = np.exp(logits - logits.max())
    pm /= pm.sum()

    op = order_probabilities(pm)
    labels = [i.key for i in interests]
    for idx, i in enumerate(interests):
        i.p_form = float(pf[idx])
        i.form_term = float(w[idx] * (s[idx] - centre))
        i.p_market = None if market == "none" else float(q[idx])
        i.p_model = float(pm[idx])
        i.p_top2 = float(op.top2[idx])
        i.p_top3 = float(op.top3[idx])
        i.fair = fair_decimal(i.p_model)
        i.min_price = i.fair * (1 + MIN_PRICE_PREMIUM) if i.fair else None
        if i.price and i.p_market is not None:
            i.exp_return = i.p_model * i.price - 1.0
            i.edge_pts = 100.0 * (i.p_model - i.p_market)
            i.value = (market == "live" and i.edge_pts >= VALUE_EDGE_PTS and i.exp_return >= VALUE_MIN_RETURN
                       and i.evidence in ("some", "strong"))
    for rank, i in enumerate(sorted(interests, key=lambda x: -x.p_model), start=1):
        i.rank = rank

    covered = sum(1 for i in interests if i.starts >= 3) / len(interests)
    race_evidence = "strong" if covered >= 0.75 else "some" if covered >= 0.5 else "thin" if covered > 0 else "none"
    implied = [1.0 / i.price for i in interests if i.price]
    return RacePrediction(
        race=race, interests=sorted(interests, key=lambda x: _sort_key(x.key)), market=market,
        model_version=model.version, weights=weights if market != "none" else {"a": 0.0, "b": 1.0},
        exacta=top_combinations(op, labels, "exacta", 12), trifecta=top_combinations(op, labels, "trifecta", 12),
        scratched_by_user=scratched_user, evidence=race_evidence, coverage=covered,
        overround=sum(implied) if implied and market != "none" else None,
    )


def _price(lead: Runner, members: list[Runner]) -> tuple[float | None, str | None]:
    for m in [lead] + members:
        if m.live_odds:
            return m.live_odds.decimal, "live"
    for m in [lead] + members:
        if m.morning_line:
            return m.morning_line.decimal, "morning_line"
    return None, None


def _program_int(p: str) -> int | None:
    digits = "".join(ch for ch in p if ch.isdigit())
    return int(digits) if digits else None


def _sort_key(program: str) -> tuple[int, str]:
    n = _program_int(program)
    return (n if n is not None else 999, program)


def to_us(decimal: float | None) -> str | None:
    return decimal_to_us(decimal)


def safe_round(x: float | None, nd: int = 4) -> float | None:
    if x is None or not math.isfinite(x):
        return None
    return round(x, nd)

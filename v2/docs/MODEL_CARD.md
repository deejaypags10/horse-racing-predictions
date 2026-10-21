# Model card — form model `form-20261021-1810`

Regenerate the numbers with `edge train`; the authoritative copy is
`backend/edge/model/artifacts/form_model.json` (`meta.evaluation`), which the
app's Model page reads directly.

## What it is

A conditional logit per breed over 18 track-agnostic runner features
(recent finishing positions, shrunk win/top-3 rates, last-race favourite,
layoff and recency, class move by purse, surface and distance change,
track familiarity, post position). It produces a **form-only** win
distribution for every race. In the app it is blended with the de-vigged
market (D-004), so its role is to nudge the market, not replace it.

## Data

Legacy TVG results archive, 2025-01-01 → 2026-05-09: 92,659 races at 131
US tracks. Training uses the 54,106 races with a complete recorded field
and a single winner (D-008): 17,917 thoroughbred, 33,172 harness, 3,017
quarter horse. No jockey/trainer, speed figures or workouts are available
in this history.

## Held-out evaluation (walk-forward)

Fit on races before 2026-01-01; scored on 12,433 races from 2026-01-01 to
2026-05-09. Log loss is mean −log P(winner) per race.

| Breed | Races | Log loss | Uniform | Gain (nats) | Top pick wins | Favourite wins |
|---|---:|---:|---:|---:|---:|---:|
| Thoroughbred | 4,739 | 1.934 | 2.046 | 0.111 | 25.1% | 37.0% |
| Harness | 7,101 | 1.874 | 2.088 | 0.215 | 29.1% | 45.4% |
| Quarter horse | 593 | 2.012 | 2.159 | 0.148 | 26.5% | 40.1% |
| **All** | **12,433** | **1.903** | **2.075** | **0.172** | **27.5%** | **42.1%** |

Second place (discounted Harville, given the true winner): log loss 1.828
vs 1.939 uniform.

Calibration (all breeds, held out): predicted vs observed win rate per bin
— 2.2/2.4%, 4.7/4.3%, 8.0/7.6%, 12.3/12.5%, 17.2/17.9%, 23.9/25.2%,
34.0/33.4%, then over-confident at the top: 45.7/37.5% (n=992) and
65.3/47.2% (n=254). Temperature scaling on held-out data did not improve
overall log loss (optimum T = 1.0), so no post-hoc scaling is applied.

## The honest headline

**The betting public is far better than this form model.** The favourite
wins 42% of held-out races; the model's top pick wins 27.5%. That is the
expected result for a model without speed figures, connections or
workouts, and it is why the market is the backbone of every number in the
app. The open question — whether the blend beats the market alone — cannot
be answered from the repo's data, because no history has complete
pre-race odds (D-007). The app now records exactly that evidence; the Model
page reports the live record (model vs market log loss on races
snapshotted before post) as it accumulates, and `edge calibrate` refits the
blend from it.

## Known limits

- First-time starters and horses new to our history get the market's view.
- International simulcast tracks have no history in the archive: they run
  market-only until results accumulate.
- Morning-line blending uses priors, not fitted weights.
- Quarter-horse evaluation rests on 593 races.

# Model card — form model `form-20261021-1857`

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
US tracks. TVG mirror-code duplicates (the same start republished under
wagering codes such as SX5/SA5/GT3) are collapsed to one start per horse per
day (D-014). Training uses the 53,308 races with a complete recorded field
and a single winner (D-008): 17,057 thoroughbred, 33,239 harness, 3,012
quarter horse. No jockey/trainer, speed figures or workouts are available
in this history.

## Held-out evaluation (walk-forward)

Fit on races before 2026-01-01; scored on 11,985 races from 2026-01-01 to
2026-05-09. Log loss is mean −log P(winner) per race.

| Breed | Races | Log loss | Uniform | Gain (nats) | Top pick wins | Favourite wins |
|---|---:|---:|---:|---:|---:|---:|
| Thoroughbred | 4,279 | 1.916 | 2.043 | 0.127 | 26.3% | 37.1% |
| Harness | 7,113 | 1.873 | 2.088 | 0.215 | 29.2% | 45.4% |
| Quarter horse | 593 | 2.012 | 2.159 | 0.147 | 26.0% | 40.1% |
| **All** | **11,985** | **1.895** | **2.075** | **0.180** | **28.0%** | **42.2%** |

Second place (discounted Harville, given the true winner): log loss 1.825
vs 1.938 uniform.

Calibration (all breeds, held out): predicted vs observed win rate per bin
— 2.2/2.4%, 4.7/4.4%, 8.0/7.5%, 12.2/12.3%, 17.2/18.2%, 23.9/25.4%, 34.0/33.8%, then over-confident at the top: 45.5/39.5% (n=985) and
65.3/45.5% (n=264). Temperature scaling on held-out data did not improve
overall log loss (optimum T = 1.0), so no post-hoc scaling is applied; in
the app the blend weight (b = 0.4 against live odds) damps these extremes.

## The honest headline

**The betting public is far better than this form model.** The favourite
wins 42% of held-out races; the model's top pick wins 28.0%. That is the
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

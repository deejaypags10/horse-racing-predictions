# Decisions

Architecture decision log. Newest last. Each entry: decision, why, what
would change it.

**D-001 · Rebuild in `v2/`, leave legacy untouched.** The legacy app's
scheduled workflows keep appending real results to
`data/processed/us_races_cleaned.parquet`, v2's training history. Moving
files would break them on merge. *Revisit* once v2 owns results ingestion
(it already stores TwinSpires results in SQLite) — then retire legacy jobs.

**D-002 · FastAPI + React SPA instead of Streamlit.** The core loop is a
dense, live, keyboard-friendly race view with sub-second interactions
(what-if scratches, sorting, exotics). Streamlit reruns whole scripts per
interaction and fights custom design. One local process serves the API and
the built SPA.

**D-003 · One track-agnostic model family: per-breed conditional logit.**
`P(i wins) = softmax(x_i·β)` within each race (Bolton & Chapman 1986;
Benter 1994). Probabilities always sum to 1, scratches are exact, and the
features describe a horse relative to its own past and today's conditions,
so it scores tracks it has never seen. Separate coefficient blocks for
thoroughbred / harness / quarter horse because the drivers differ (harness
post position is decisive). XGBoost per country (legacy) was dropped: it
produced independent per-runner probabilities that needed ad-hoc
normalisation and could not be audited.

**D-004 · Blend with the market in log space; fixed priors until calibrated.**
`logit = a·log q + b·w·(s − mean s)`. Live tote: a=1.0, b=0.4; morning line:
a=0.85, b=0.6. There is no historical data in the repo with *complete*
pre-race odds and results to fit these (see D-007), so they are documented
priors, not fitted values. The app records pre-post snapshots (q and the
form term) and results; `edge calibrate` refits a, b by maximum likelihood
once ≥500 live races exist and writes `artifacts/blend.json`. *Change* as
soon as that data exists.

**D-005 · Evidence weighting.** Form only moves a runner in proportion to
how much history we have: none 0, thin (1–2 starts) 0.45, some (3–5) 0.8,
strong (6+) 1.0. New tracks/horses therefore degrade gracefully to the
market rather than to a fabricated form number. Value flags need ≥ "some".

**D-006 · Discounted Harville for every order probability.** λ₂ = 0.81,
λ₃ = 0.65 (Lo & Bacon-Shone; Benter). Plain Harville over-rates favourites
for 2nd/3rd. Held-out check: second-place log loss 1.83 vs 1.94 uniform.

**D-007 · Legacy `dec` odds column is unusable.** The legacy TVG ingester
dropped any price whose denominator was null (e.g. "12-1" encoded as
12/null), so odds exist mainly for short-priced finishers — a severe
selection bias. v2 uses only positions, conditions and the reliable
`is_favorite` flag from history; the `odds.parse_odds` dict path fixes the
bug for anything v2 ingests.

**D-008 · Train only on complete fields.** ~42% of archive races list
fewer runners than the declared field. A conditional logit over a partial
field is biased, so training uses the 54k races where recorded runners =
field size and exactly one winner. Unknown finishing positions (0) count as
"unplaced" in features.

**D-009 · TwinSpires adapter is defensive and probe-able.** The program
JSON is undocumented and the build sandbox could not reach it (network
policy). Endpoints are env-overridable templates, all fields go through
alias lists, raw responses are captured, and `edge ts-probe` / the manual
"v2 — TwinSpires probe" workflow verify from an open network. Fixtures are
synthetic until replaced with real captures.

**D-010 · Coupled entries are one betting interest.** "1" and "1A" share
one tote price and one model probability (log-sum-exp of member scores).

**D-011 · Edge is shown in probability points; value also needs return.**
Design shows `model% − market%`; the value flag additionally requires
expected return ≥ 10% at the current price so long shots with tiny point
edges and favourites with tiny return edges are both excluded.

**D-012 · Relative-to-field features not adopted (yet).** Adding seven
within-race z-scored features improved held-out log loss by 0.005 nats
(1.9034 → 1.8982) with no top-1 gain. Not worth the extra surface now;
revisit with richer inputs (speed figures, connections).

**D-013 · Paper tickets are immutable once settled; CLV uses the last
pre-post snapshot.** Win CLV = (1/closing − 1/taken) × 100 points.
Exotic payouts assume $2 exacta / $1 trifecta bases.

**D-014 · One start per horse per day.** The TVG archive repeats big-card
starts under wagering mirror codes (SX5, SA5, GT3, OD6, CH5, SAS…); ~33k
duplicate horse-day rows made one Derby run look like five starts of
"strong" evidence and double-counted races in training. History keeps one
row per (horse, day), preferring codes without digits, then the busiest
code. Found by the product-critic review; thoroughbred held-out log loss
improved 1.934 → 1.916 after the fix.

**D-015 · "Overlay" means the price beats fair.** UI overlay language and
colour require positive expected return at the shown price, not just a
positive point difference against the takeout-free market. Value flags stay
on by default but carry an "unvalidated blend" tag until `edge calibrate`
has fitted the blend from recorded races (`blend_calibrated`).

**D-016 · Paper tickets can't be withdrawn after the off.** Otherwise the
record could be curated by deleting losers.

**D-017 · Hong Kong is market-only and never borrows US form.** HKJC cards
come from meeting files (`sources/hkjc.py`) because HKJC is not on
TwinSpires and could not be reached from the build sandbox. History is keyed
by name, so an HK horse could match a US namesake; HK runners use their own
`hk:` history namespace and the predictor ignores history outside the US,
since the form model is trained on US races. Recorded HK results accumulate
under `hk:` for a future HK model.

**D-018 · HK runners use HKJC form with the US-fitted model (experimental).**
`v2/hkjc/history.csv` (from HKJC horse pages) feeds the `hk:` namespace and the
predictor now reads it, superseding D-017's "market-only". The same feature
function and US weights are used; field size, favourite and purse are proxies
(see `v2/hkjc/README.md`). This is unvalidated: an HK backtest needs full HKJC
results (every runner per race), which is the next step before trusting HK
value flags.

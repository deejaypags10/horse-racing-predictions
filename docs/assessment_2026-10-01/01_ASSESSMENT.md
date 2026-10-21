# Site assessment

**Dates:** October 1–2, 2026. **Method:** inspect the checked-out application, prediction/training/backtest paths, tests, workflows, model metadata, and selected saved predictions; inspect available deployed pages; consult primary external sources. Existing roadmaps were read as historical context, not accepted as current implementation evidence.

## Overall assessment

Equine Edge has unusually broad coverage for a personal racing application: a multi-page Streamlit UI; UK and US inference; numerous source adapters; feature engineering; odds overlays; bankroll tracking; saved calibration statistics; and automation. Its main weakness is consistency between the data, inference, evaluation, and user-facing claims. Fixing those seams should produce more value than adding another collection of indicators.

The UI currently organizes much of the experience around large tables and research tabs. A stronger product would organize around a decision: select a race, understand the field and uncertainty, inspect scenarios, save a reasoned paper selection, and later review the outcome.

## What already exists and should be retained

| Area | Observed implementation | Assessment |
|---|---|---|
| UK predictions | `predictions.py`, `scripts/predict_todays_races.py` | Precomputed daily files are appropriate for a modest deployment; inference correctness needs work. |
| US predictions | `pages/us_racing.py`, `scripts/predict_us_races.py` | Dedicated US model selection, feature-count checks, output provenance, and market-input normalization exist. The saved sample has coherent field sums; the current generator does not enforce that invariant on every output. |
| Betting tools | `pages/betting_manager.py`, `scripts/rl_bankroll_manager.py` | Kelly and ledger foundations exist; proposed paper/review tools improve reproducibility and isolation. |
| Backtesting | `scripts/backtest_walk_forward.py`, `pages/backtest_results.py` | Temporal evaluation and an optional observed-odds path exist. The gate is not yet evidence of deployable economic edge. |
| Validation | `scripts/validate_feature_contract.py`, `tests/test_validate_feature_contract.py`, `tests/test_leakage.py` | Checks exist; they need to validate the actual inference output and values, not just historical column presence. |
| Automation | `.github/workflows/weekly_model_training.yml`, `us_ingestion_guardrails.yml`, `parser_hardening_checks.yml` | Foundation is real. Assertions in older docs that no gate or guardrails exist are stale. |
| Ranking research | `scripts/us_train_ranker.py` | A ranker prototype exists. M07 proposes validated, integrated race grouping and calibration. |
| Strategy watchlist | `pages/data_explorer.py::display_betting_watchlist_tab()` | Existing tier-based CSV report; F06 adds personal subscriptions, persistence, and event change detection. |
| Feature richness | US metadata lists 64 features; multiple UK feature lists and pipelines exist | Abundant features are not the same as populated, point-in-time valid inputs. |

## Verified findings and priorities

| Finding | Evidence | Impact and action |
|---|---|---|
| **P0: cumulative probability inconsistency** | `scripts/predict_todays_races.py:357` derives cumulative place/show; `predictions.py:1196` adds win + place, then win + place + show. `display_exacta_trifecta()` separately treats place/show as cumulative. | The same field has incompatible meanings across views. Define `p_top2`, `p_top3`, `p_second`, `p_third` once; never sum cumulative fields. D05, B01, M06. |
| **P0: complete-field probability sums are not enforced by current generators** | `predictions.py:459` launches `scripts/predict_todays_races.py`; it applies independent fixed shrinkage. US `predict_us_race()` normalizes available market inputs but independently blends/shrinks outputs without a final field-sum check. | A complete-field distribution is needed for fair odds and order probabilities. M03/M04. The historical US sample passes the sum check; that does not prove every current inference branch does. |
| **P0: prediction-date leakage/replay risk** | UK `predict_single_race()` selects all matching horse history without a prediction cutoff; `build_features_from_historical_record()` uses `pd.Timestamp.now()` for days since last. US feature building also uses wall-clock time. | Historical regeneration can use later results and produce a different value months later. Both event and availability times must precede the decision cutoff. B05/M01. |
| **P0: placeholder inputs are scored as real measurements** | UK jockey counts fixed at 100/10/20; no-history career runs estimated as 10. US jockey counts fixed at 200/20/30; several draw/gear inputs are placeholders. US inference initializes the UK feature list, then reindexes into the selected model's expected list. | New US-specific fields can become zero even though the trained model expects them. Audit per-feature lineage and populate actual pre-race values; explicitly track missingness. B06/M02/M09. |
| **P0: ensemble meta-training is not temporal** | `scripts/ensemble_model.py:265` sets `StackingClassifier(cv=3)`; the separate `make_oof_predictions()` helper is not used in the training path. Training/calibration/test outer partitions are row slices at 70/80%. | Ordinary internal folds can mix earlier and later races; row boundaries can split a race/date. Rebuild meta-features from expanding date folds and independent calibration periods. M01/M05. |
| **P0: backtest does not replay the production model** | `backtest_walk_forward.py:509` builds a fresh classifier; production UK generation loads a base pickle and applies hand-coded shrinkage/place/show. | Passing the backtest does not validate the deployed ensemble or daily output transformations. Evaluate one versioned predictor service; publish its bundle hash. B07/M14. |
| **P0: financial gate can pass without market evidence** | `simulate_level_stakes()` creates `est_odds` from model probabilities; weekly workflow runs `--folds 6` without `--market-odds-file`; gate checks mean AUC/top1/level drawdown. | Estimated-price P&L is not observed executable return. Keep it labeled synthetic; require a populated paper/observed-price ledger for economic claims. F04/B08/M14. |
| **P0: minimum Kelly raises small positions** | `pages/betting_manager.py:36–53` clips a positive fraction to `min_frac=0.01`. | A tiny estimated edge is rounded up to 1% exposure. Skip below-minimum stakes; do not force them higher. F05. |
| **P1: model identity differs between routes** | `shared/utils.py:49,89` loads JSON base model for insights; UK active generator loads `horse_win_predictor.pkl`; saved ensemble metrics refer to `ensemble_model.pkl`. | Different serialization formats may represent the same weights, but no hash/manifest verifies equivalence. Do not call daily outputs ensemble-calibrated merely because ensemble metrics exist. B07/D06. |
| **P1: pipeline failures can appear successful** | UK `main()` prints an error and returns when model or racecards are missing; UI treats return code zero as success. | Show success only after validating the expected output snapshot and run manifest. B03/D07. |
| **P1: shared mutable local financial state** | `pages/betting_manager.py:23–25,84–126` uses one JSON state and CSV history, read then overwrite. | Simultaneous sessions can overwrite state; a multiuser deployment requires ownership isolation. B02/B11. Single-user use still needs transactions. |
| **P1: blocking operations in interactive requests** | `predictions.py:406,447,820,1401` invokes fetch/prediction/scraping/training subprocesses; timeout values are finite but work blocks the request. | Move these to idempotent jobs with polling and an output manifest. B03/B04. |
| **P1: fragile theme and weak contrast** | `predictions.py:76–131` styles framework internals using `data-testid`, BaseWeb selectors and `!important`; button foreground `#152a50` on `#3c5a99`. | Replace most overrides with supported theme settings; correct contrast; verify keyboard/mobile layouts. D03/D04. |
| **P1: misleading race scoring terminology** | README labels class/prize/course heuristic a profitability scorer; fixtures estimate race characteristics before declarations. | Prestige is not observed edge. Separate calendar forecasts, declared racecards, confidence, and price-derived value. D09/F14/M15. |
| **P2: documentation drift** | README describes both 18 and 75 features; predictor comments alternate 47/120; saved US CSV says 75 but current JSON metadata says 64. | Some differences can be historical versions. Generate model cards from manifests and label historical reports. B07/D06. |
| **P1: dataset row counts are labeled races** | `pages/data_explorer.py:304` uses `len(df)` for "Total Races in Dataset"; course aggregation counts horse rows. The live page displays 311,097 as races. | Distinguish runner starts from unique races; use canonical race IDs for counts. B01, D01/D09. Horse-specific starts can reasonably be labeled runs, but whole-dataset counts need explicit units. |
| **P1: useful modules are not routed in normal navigation** | `predictions.py:1746` registers International, US Racing and Data Explorer only; Betting Manager/Backtest Results/Trainer Stats/Jockey Stats files exist. Live sidebar matches the three-route configuration. | Existing modules cannot be assumed available through the deployed flow. Add validated portfolio/evidence destinations instead of duplicating their capabilities. D01/D02, F04. |

Line numbers refer to this checkout at assessment time; use function names if later edits shift them.

## Saved-data spot checks

These are historical files in the local checkout, not a claim about today's production feed. CSV parsing used Python's standard library; race grouping used the app's available `(date, course, race_time)` keys.

| Check | UK `predictions_2026-06-28.csv` | US `us_predictions_2026-06-06.csv` |
|---|---:|---:|
| Runner rows | 109 | 2,902 |
| Groups using available race key | 9 | 354 |
| Missing course rows | 109 | 0 |
| `NON-RUNNER` in jockey | 1 | 0 |
| Minimum field win-probability sum | 1.023556 | approximately 1.0 |
| Maximum field win-probability sum | 1.409778 | approximately 1.0 |
| Groups not summing to 1 within 1e-6 | 9 | 0 |
| Distinct win probabilities | 7 | 2,246 |
| Rows where UK table's win+place+show expression exceeds 1 | 0 | 11 |

UK grouping is ambiguous because courses are missing: simultaneous races could collide. That uncertainty is itself a schema defect; the sums do not prove that every true race has exactly the shown distribution. The non-runner row demonstrates the need for explicit status filtering. The US check demonstrates coherent sums in that saved historical output, not a universal current-code guarantee. The 11 US rows evaluate the **UK table's expression on US data**; they do not establish that the US UI uses that expression.

The current US `_calibrate_probability()` function was separately extracted from its source and evaluated without loading a model: four raw probabilities of 0.4 with field size four produce a total of **1.133333**, not 1. This isolates a missing output invariant; it does not imply that every real race has those inputs. Partial-market normalization is another reason to require complete-field checks.

The first saved backtest fold has 659 races, AUC 0.6629, top1 0.2443, and **zero value bets**. Its -70.21% level ROI uses synthetic model-derived odds and should not be described as realized market performance. All-fold conclusions require the full ledger and pricing assumptions.

Saved ensemble metrics report AUC 0.6892, runner log loss 0.3278, Brier 0.0946, top1 25.16%, top3 57.09% on 14,210 races. US metadata reports AUC 0.6105 and 795,876 training rows. These were read from artifacts, not independently reproduced; their evaluation populations differ and their AUCs are not a controlled UK-versus-US experiment.

## Operational and security assessment

Retain raw captures and fixture-based parser tests. Adopt transactional ledgers, immutable releases, pre-race availability timestamps, source health reports, and ownership checks before expanding to multiple users. Do not deserialize arbitrary uploaded pickle artifacts. Existing pickle loads use local files; that is a trust-boundary concern, not proof of a present remote exploit. Existing parameter-list subprocess invocation is better than shell-interpolated commands; the issue observed is blocking work and output validation, not a demonstrated shell injection.

A fixed UTC GitHub cron does not remain a fixed Eastern local hour across daylight-saving changes. Use track-local race times with UTC storage and a user display zone. UK and US race dates should not both be inferred from the host clock.

## Live assessment limits

The deployed URL was found in `.github/workflows/keep-alive.yml`: [Equine Edge](https://equine-edge.streamlit.app/). The web reader encountered a redirect loop. A background browser showed the actual Streamlit sleep page; its wake button was clicked. After a slow wake, the application loaded and the following states were inspected. No fetch, scrape, generation, calibration, or training buttons were pressed.

| Live surface | Observed state | Product implication |
|---|---|---|
| International / Upcoming Schedule | 335 fixtures, 50 courses, 237 turf entries, 90-day span; time cells include Afternoon/Floodlit rather than precise off times. | Label this as meeting/fixture planning, not a confirmed runner-level opportunity list. |
| International / Today & Tomorrow | 70 racecards for the app's October 2 date; no predictions for today or tomorrow; tomorrow's racecards unavailable; live odds not yet scraped. | Visitor-facing state exposes operational steps and filenames. Provide clear availability/status and operator-owned jobs. |
| International / Model Insights | "Model loaded successfully" but "Model not yet calibrated"; diagnostics dated 2026-02-14, with 13 races, 737 horses and average field size 10.4. | Label the diagnostics stale and reconcile denominators: 737/13 is not 10.4, so the displayed counts appear to describe different populations or inconsistent aggregation. No specific root cause was proven live. |
| US Racing / Schedule | No cached entries for the current date; fetch controls exposed; page describes TVG coverage across Thoroughbred, harness and Quarter Horse. | Distinguish provider coverage claims from received data and validated model-domain support. |
| Data Explorer | Loaded historical filters and horse statistics; sidebar reports 311,097 "races"; six tabs include a strategy-based Betting Watchlist. | Preserve useful research filters, clarify rows versus races, and extend existing watchlist rather than presenting all watchlist functionality as new. |
| Sidebar | International, US Racing, Data Explorer only. | Several repository page modules are outside the normal live navigation. |

The browser's application date was October 2; this assessment began under an October 1 client context and completed October 2. This alone is not evidence of a timezone defect. The code's inconsistent host-clock handling still justifies F14 and cutoff validation.

Desktop capture: [live prediction-page screenshot](live-predictions.png). The screenshot shows the blue visual identity, low-contrast button text, large operational-step headings, and the narrow status column. The source button color pair computes to **2.106:1**, below 4.5:1 for ordinary text; the proposed white-on-blue pair computes to **8.8216:1**. This is a source-color calculation, not a complete rendered accessibility audit.

Repository and live observations should not be mistaken for an audit of every interactive state, a measured load-performance benchmark, a phone/screen-reader test, or a penetration test. Current prediction tables were unavailable live, so their probability behavior was assessed through source and saved files.

The project `venv` interpreter could not launch. The bundled Python 3.12 runtime has pandas/numpy but no Streamlit or pytest. Therefore no project test suite, training job, or local UI was run. Installing or changing the environment was unnecessary for a documentation assessment.

## Verification record

Completed October 2, 2026. [Machine-readable check summary](verification_summary.json) records:

- **8 Markdown files**, with exactly **15 proposals in each of four categories**, **60 total**.
- Every proposal has a priority, implementation example, and acceptance criteria; all 60 IDs appear in the roadmap.
- **56 Python code blocks** passed syntax parsing; the TOML theme parsed; both SQL snippets executed against separate in-memory SQLite databases. The YAML workflow was inspected manually because a YAML parser was unavailable.
- **26 deterministic checks** passed for scratch exclusion, replay availability, stake floors/exposure, disagreement measures, contrast, cumulative probability semantics, feature order/placeholder rejection, coverage, pipeline ordering, temporal race grouping, stable softmax/race loss, market blend, joint-order cumulative sums, shrinkage, trip provenance, conformal winner sets, bootstrap ROI, and abstention.
- Local document/file links resolve. External references were researched, not all automatically rechecked at delivery.

These checks exercise proposed helper functions on small examples. They do not establish integration correctness, model performance, dependency compatibility for optional libraries, or profitability. The project test suite and live prediction/training jobs were not run. The application source was not modified; the deliverables are assessment reports, code proposals, one screenshot, and verification metadata.

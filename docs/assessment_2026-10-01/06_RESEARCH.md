# Research, competitor patterns, repositories, and experts

**Retrieved:** October 1, 2026. Sources below were opened or returned directly by web research. Review depth varies: product documentation/public pages, repository READMEs and one racing analysis file, paper abstracts plus selected paper text, and API references. No competitor account was purchased, no external repository was executed, and no claimed trading result was independently reproduced.

The proposed code is original. Borrow problem framing and interaction patterns; inspect licenses before adapting source code. Repository visibility does not establish commercial reuse rights or data redistribution rights. Marketing claims and authors' experimental returns are not performance forecasts for Equine Edge.

## R01 — Geegeez Gold

**Primary sources:** [product FAQ](https://www.geegeez.co.uk/geegeez-faq/) and [official tool/video guide](https://www.geegeez.co.uk/geegeez-gold-video-guides/).

The public guide documents conditions profiling, draw/pace analysis, query tools, reports, and bet tracking. The useful pattern is moving between a compact field comparison and deeper condition-specific research. Adapt the idea into evidence counts, configurable filters, and reproducible saved angles; preserve original visual design and terminology. **Applied to:** F03, F08, F10, F11, D08. Paid interfaces were not audited.

## R02 — DRF Formulator

**Primary source:** [official Formulator product page](https://promos.drf.com/formulator-pps).

DRF documents notes, replay/chart access, customized past-performance filters, trainer patterns, and TimeformUS pace figures. Borrow the workflow connecting a historical run, an observation, and the next declaration. Use links or licensed integrations rather than copying proprietary figures or replay content. **Applied to:** F07, F10, F11, F15, D12. Availability and subscription terms must be checked during implementation.

## R03 — Timeform

**Primary sources:** [Race Passes description](https://www.timeform.com/horse-racing/race-passes/subscribe), [official sectionals offering](https://www.timeformracing.com/horse-racing/shop/sectional-times), [horse racing API](https://api.timeform.com/horseracingapi/).

Timeform demonstrates contextual form analysis and specialist race/sectional data. The product opportunity is to connect pace interpretation with declared conditions and runner history. It also illustrates that some valuable data requires a commercial integration rather than an assumed free scraper. **Applied to:** F10, M10, D06. API pricing, entitlements, and reuse terms are not established by this assessment.

## R04 — Racing Post racecards

**Primary source:** [official racecards](https://www.racingpost.com/racecards/).

The public racecards organize meetings and races by time, venue, class, distance, and field. Borrow clear race identity and meeting navigation. Equine Edge can distinguish itself through replayable provenance, explicit uncertainty, and transparent model-versus-market comparison. **Applied to:** D01, D02, F14. The public listing was examined, not the full logged-in product.

## R05 — LightGBM

**Primary sources:** [official repository](https://github.com/lightgbm-org/LightGBM) and [LGBMRanker API](https://lightgbm.readthedocs.io/en/latest/pythonapi/lightgbm.LGBMRanker.html).

The maintained project supports grouped ranking. It is a practical challenger for races where runners compete within a field. Use explicit relevance labels and contiguous race groups; ranking scores need independent probability calibration. **Applied to:** M07. Existing local requirements already include LightGBM, so this experiment does not require a new architectural stack.

## R06 — MLflow

**Primary source:** [official repository](https://github.com/mlflow/mlflow).

The useful pattern is connecting model versions with parameters, datasets, evaluation, and artifacts. Start with a small bundle manifest and promotion pointer; adopt a registry service when experiment volume warrants it. **Applied to:** B07, M14, D06. The proposal does not assume the latest MLflow APIs are installed or necessary.

## R07 — Evidently

**Primary source:** [official repository](https://github.com/evidentlyai/evidently).

Its evaluation/monitoring focus suggests tracking changing feature populations and prediction quality. For racing, delayed labels, jurisdiction changes, and source missingness matter more than an undifferentiated drift score. Begin with transparent feed/feature reports before optional library integration. **Applied to:** B09, B13, M09, M12. Drift alone is not proof of reduced forecast accuracy.

## R08 — Feast

**Primary source:** [official repository](https://github.com/feast-dev/feast).

Point-in-time feature retrieval is the relevant design principle: training and live predictions should see comparable information with historical availability respected. Equine Edge can implement this principle using existing Parquet storage and immutable capture manifests first. **Applied to:** B05, M01, M02. A feature-store service would add cost and operations; it is not a prerequisite.

## R09 — Prefect

**Primary source:** [official repository](https://github.com/PrefectHQ/prefect).

Resilient workflow orchestration provides useful patterns for stage dependencies, retries, run state, and observability. Apply those concepts to the existing scripts; consider Prefect only if a small job repository and current scheduled workflows become insufficient. **Applied to:** B03, B04, B12. No Prefect API snippet is presented as installed code.

## R10 — William Benter (1994)

**Primary paper, archived copy:** [Computer Based Horse Race Handicapping and Wagering Systems: A Report](https://gwern.net/doc/statistics/decision/1994-benter.pdf).

Benter discusses fundamental handicapping probabilities, public odds, model combination, practical data requirements, and wagering strategy. The strongest applicable lesson is to compare and combine independent information with the market rather than treating classifier accuracy as betting edge. **Applied to:** M04, F13, M14. Historical Hong Kong practice does not establish current UK/US returns, and public-odds timing must match the actual decision.

## R11 — Guo et al. (2017)

**Primary paper:** [On Calibration of Modern Neural Networks](https://proceedings.mlr.press/v70/guo17a.html), Chuan Guo, Geoff Pleiss, Yu Sun, Kilian Q. Weinberger.

The paper studies probability calibration and temperature scaling in neural classification settings. It motivates testing calibrated probability outputs separately from discrimination. **Applied to:** M05, M03, D06. Racing tree ensembles and variable-size fields differ from the paper's tasks; temperature scaling is a candidate, not a guaranteed solution.

## R12 — Angelopoulos and Bates (2021; revised 2022)

**Primary paper:** [A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification](https://arxiv.org/abs/2107.07511).

The tutorial describes prediction sets and their assumptions. Race-level plausible-winner sets could make uncertainty visible, particularly when the field is hard to distinguish. **Applied to:** M12. Temporal drift, domain shifts, and dependent races require special care; do not promise nominal coverage or reinterpret a prediction set as an interval around a horse's win probability.

## R13 — Aftalion and Mercier (2020)

**Primary paper:** [Optimal speed in Thoroughbred horse racing](https://arxiv.org/abs/2006.10530), Amandine Aftalion and Quentin Mercier.

The work uses racing velocity data and a mechanistic optimal-control framework to study speed and effort. It suggests measuring pace, course geometry, and race phases together. **Applied to:** M10, F10. It is not evidence that a simple generic pace multiplier improves a betting model; usable sectionals and track parameters remain prerequisites.

## R14 — Zaheer et al. (2017)

**Primary paper:** [Deep Sets](https://arxiv.org/abs/1703.06114).

Permutation-invariant/equivariant set modeling motivates representing a field without arbitrary row order. The runner encoder and pooled context in M13 are an original racing adaptation of that idea. **Applied to:** M13. Tabular boosters may still outperform it for this data volume and quality; preserve a forward benchmark.

## R15 — Christopher Burges (2010)

**Primary technical report:** [From RankNet to LambdaRank to LambdaMART: An Overview](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/MSR-TR-2010-82.pdf).

The report explains learning-to-rank objectives and relevance framing. It informs the corrective direction of M07's winner-relevance target. **Applied to:** M07. Optimizing a ranking metric does not directly produce calibrated race probabilities or economic value.

## R16 — Streamlit official documentation

**Primary references:** [themes](https://docs.streamlit.io/develop/concepts/configuration/theming), [resource caching](https://docs.streamlit.io/develop/api-reference/caching-and-state/st.cache_resource), [fragments](https://docs.streamlit.io/develop/api-reference/execution-flow/st.fragment), [authentication](https://docs.streamlit.io/develop/concepts/connections/authentication).

Use supported theme configuration, snapshot-keyed data caches, resource caches for suitable thread-safe models, and narrow reruns for polling. Authentication establishes identity; authorization and ownership still belong to the application. **Applied to:** D03, D07, D15, B10, B11. Current online docs can describe versions newer than this deployment; verify the installed version and avoid copying unsupported options.

## R17 — W3C WCAG 2.2

**Primary standard:** [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/).

Contrast, keyboard access, descriptive labels, target size, and non-color-only communication inform the accessibility work. **Applied to:** D04, D08, D13. A passing color ratio is only one criterion, not a certification of the site.

## R18 — Hong Kong racing pipeline repository

**Primary repository:** [catowabisabi/horse-racing-model-training](https://github.com/catowabisabi/horse-racing-model-training).

The README describes separate loaders, feature engineering, boosted models, blending, betting simulation, out-of-sample validation, tests, and a reporting dashboard. Borrow the separation of experiment and reporting artifacts. Its claimed returns were not reproduced; geography, data years, pool mechanics, and validation choices differ from this project. **Applied to:** B12, F04, M04, M14. Review the repository's actual license before adapting code.

## R19 — German racing Benter-method analysis

**Primary repository file:** [chris-alex-p/german-horse-racing analysis](https://github.com/chris-alex-p/german-horse-racing/blob/main/notebooks/analysis_benter_methods.md).

This analysis provides another racing-specific example of conditional modeling and market comparison. It is useful as an experiment-reporting reference rather than a deployment dependency. **Applied to:** M03, M04, M14. Inspect its data timing and train/test methodology before reusing conclusions; findings from another country do not validate Equine Edge.

## R20 — Walsh and Joshi (2023; revised 2024)

**Primary preprint:** [Machine learning for sports betting: should model selection be based on accuracy or calibration?](https://arxiv.org/abs/2303.06021).

The paper compares model selection criteria in NBA betting experiments using published odds. It adds domain-adjacent motivation for calibration-aware evaluation. **Applied to:** M05, M14, D14. Its sport, single-season betting test, and reported returns do not transfer to horse racing; proper scoring rules and matched market baselines remain necessary here.

## R21 — Michael Pearce (August 2026)

**Primary recent preprint:** [Efficient Bayesian Inference for Benter Models on Ranked Data](https://arxiv.org/abs/2608.23825).

This recent work studies rank-stage damping in Benter models and Bayesian estimation. It suggests a possible later challenger when simple Plackett–Luce miscalibrates lower finish positions. **Applied to:** a research extension of M06. The examples described are preference/election datasets, not a validated racing betting system; this is research inspiration, not a production recommendation.

## R22 — scikit-learn probability calibration

**Primary version-specific reference:** [scikit-learn 1.8 calibration](https://scikit-learn.org/1.8/modules/calibration.html).

This matches the repository's pinned sklearn major/minor version and supports calibrating already-fitted estimators through FrozenEstimator. **Applied to:** M05 and B15 dependency smoke tests. Compatibility still needs testing in the actual locked environment; source inspection did not execute the existing ensemble training.

## R23 — SHAP

**Primary repository:** [shap/shap](https://github.com/shap/shap).

Local output attribution is a useful explanatory tool. Tie any explanation to the chosen estimator, output scale, background data, and snapshot; it does not prove causal effects. **Applied to:** D12. Explaining a raw tree output is not automatically explaining the final calibrated and field-normalized probability.

## How expert research changes the recommendations

| Perspective | Practical consequence |
|---|---|
| Benter: fundamental model plus market information | Benchmark market-only, fundamental-only, and calibrated combination at the same decision time. |
| Guo et al.; Walsh/Joshi: calibration matters | Use proper scoring rules and independent calibration, not accuracy headlines. |
| Angelopoulos/Bates: quantify uncertainty with assumptions | Show abstention/set coverage; monitor temporal validity. |
| Aftalion/Mercier: race dynamics matter | Acquire trustworthy pace/sectional data before richer scenario modeling. |
| Burges: rank competitors within groups | Correct relevance labels and preserve complete races. |
| Zaheer et al.: field is a set | Explore order-invariant context modeling only after tree baselines are strong. |
| Pearce: ranking stages can differ in noise | Research lower-order finish calibration after establishing the simple joint baseline. |

These are interpretations of published work applied to this repository, not advice obtained through interviews. No expert was contacted.

## Attractive ideas deliberately deferred

- **Autonomous reinforcement-learning staking:** current market/settlement evidence is too incomplete to support a realistic reward environment; fractional sizing and exposure constraints are more reviewable.
- **Paddock-video computer vision:** promising data cost and domain-shift challenges; obtain a licensed, timestamped labeled corpus before implementation.
- **Generic betting chatbot:** start with F12's grounded deterministic questions; language fluency is not racing evidence.
- **Unrestricted source scraping:** prioritize durable permitted feeds and fixture-based parsers; access failures and missing data must be visible, not bypassed.
- **Full frontend/API rewrite:** improve the existing Streamlit experience first; split services only when measured concurrency or product requirements justify the cost.

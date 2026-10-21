# Equine Edge: comprehensive assessment and enhancement portfolio

**Assessment started:** October 1, 2026. **Completed and verified:** October 2, 2026 (America/New_York). **Status:** proposals, not deployed changes. The folder retains the assessment's start date.

The best next version of Equine Edge is a racing research workbench that can explain what it knows, what changed, and whether a prediction was useful. Prioritize trustworthy probabilities and reproducible evidence, then make that evidence easy to explore. A larger model alone will not fix the current inference and evaluation gaps.

## Contents

| Report | Contents |
|---|---|
| [Assessment](01_ASSESSMENT.md) | Verified strengths, defects, saved-data checks, and assessment limits |
| [Features](02_FEATURES.md) | 15 product enhancements, F01–F15, each with code |
| [Design](03_DESIGN.md) | 15 experience/design enhancements, D01–D15, each with code |
| [Backend](04_BACKEND.md) | 15 architecture/operations enhancements, B01–B15, each with code |
| [Models](05_MODELS.md) | 15 modeling/evaluation enhancements, M01–M15, each with code |
| [Research and inspiration](06_RESEARCH.md) | Competitor patterns, GitHub repositories, papers, experts, and limitations |
| [Prioritized roadmap](07_ROADMAP.md) | All 60 priorities, dependencies, effort estimates, and delivery sequence |

Each proposal states its current status, rationale, integration target, dependencies, implementation example, and acceptance criteria. Categories are distinct: a feature is a user capability; design is how users understand and operate it; backend is its reliable execution/storage; modeling is its statistical validity. Related items reference one another rather than counting the same implementation twice.

## Priority definitions

- **P0 — correctness foundation:** resolve before treating affected outputs as reliable recommendations.
- **P1 — next delivery cycle:** high practical value once relevant foundations work.
- **P2 — differentiation:** validate on a small pilot before expanding.
- **P3 — research:** uncertain return or substantial data/engineering cost.

Effort estimates assume one developer familiar with this repository. They are planning ranges, not commitments, and exclude data licensing, lengthy training runs, and procurement. Dependencies can change the order within a priority.

## Code conventions

Examples are original implementation sketches. They are **not installed features** and are not blanket drop-in replacements. Python snippets declare their imports; function parameters define their input contract. UI snippets assume the stated DataFrame/metadata variables are supplied by the page. Proposed modules, tables, fields, and adapters are labeled explicitly. Do not infer that a proposed import already exists.

The repository allows Streamlit >=1.51; the installed application version could not be determined. Examples use established APIs rather than newly introduced options. The Streamlit skill's version discovery could not locate a usable project interpreter or bundled reference documentation. Official Streamlit documentation was used as a fallback; compatibility still needs verification against the deployment's actual dependency lock.

Syntax and deterministic numerical checks are recorded in the assessment. Syntax checking is not integration testing. New optional dependencies are named at the point of use. No API credentials were read, no live training or ingestion was initiated, and no bets were placed.

## Recommended first delivery

1. Resolve runner identity, scratches, cumulative probability labels, inference cutoffs, and per-race normalization.
2. Tie every prediction, metric, and displayed explanation to one versioned model bundle.
3. Evaluate the exact deployed path on future races using timestamped observed prices and a paper ledger.
4. Give users a race-first home screen with data freshness, provenance, and clearly separated forecast scenarios.
5. Build scenario comparison, pace maps, and notebook tools on that foundation.

Advanced architecture proposals are challengers until forward evidence supports promotion. Competitor product features and published research inspire the portfolio; they do not establish profitability for this app.

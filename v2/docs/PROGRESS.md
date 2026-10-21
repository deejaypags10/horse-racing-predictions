# Progress

_Last updated 2026-10-21 by the rebuild lead._

## State

v2 works end to end in **replay mode** (real recorded US cards from 57
tracks) and is built for **live TwinSpires mode**, whose endpoints are not yet
verified from an open network (see Next steps 1).

| Area | Status |
|---|---|
| Domain model, odds math, history index | done |
| Form model (per-breed conditional logit), walk-forward evaluation | done; see MODEL_CARD |
| Market blend, evidence weighting, discounted-Harville exotics | done; blend weights are priors (D-004) |
| TwinSpires adapter (defensive, captured, rate-limited) | done, **unverified live** |
| Archive replay source | done |
| SQLite store, snapshots, results, ticket settlement, CLV | done |
| Live poller, `edge calibrate` | done; nothing to calibrate until live races are recorded |
| FastAPI API with security hardening | done |
| Web app (board, track, race, exotics, tickets, model, settings) | done |
| CI workflow (`v2 — tests`), manual TwinSpires probe workflow | written; not yet run on GitHub |

## How it was built and checked

Product strategist, UX designer, frontend engineer, security engineer, QA
engineer and product critic each worked or reviewed independently; their
specs are in `docs/PRODUCT.md` and `docs/DESIGN.md`.

- **Security review:** 12 findings. All fixed except "use a real lock
  file", which is handled with `backend/constraints.txt` for now. Fixes
  covered DNS-rebinding/CSRF guards, path-safe captures, non-finite numbers,
  bounded responses, a resilient poller, stake validation, workflow input
  sanitising, vite/vitest CVEs and self-hosted fonts.
- **Product critique, top 5, all addressed:**
  1. Duplicated history inflated evidence (D-014, model retrained).
  2. "Overlay" was shown on prices below fair (D-015).
  3. No 2-second verdict; a verdict line now sits above the runner table.
  4. The outage state blamed the server instead of TwinSpires.
  5. Tipster language ("Top pick" became "Highest chance"); value-flag and
     cool-off settings added.
- **QA:** 5 major bugs fixed:
  - writes were refused on non-default ports;
  - tickets could be withdrawn after the off;
  - a coupled entry vanished in what-if;
  - polling stacked up;
  - ticket prices were misparsed.
  Also fixed the accessibility violations axe found (126 nodes before). A re-run of axe-core on 6 pages × 2 themes now reports **0 violations**. Gzip and immutable asset caching were added.
- **Tests:** backend `pytest` 95 passed. Web `vitest` 41 passed, plus
  `tsc --noEmit` and `vite build`. Playwright screenshots at 1280 and 375,
  light and dark, are in `docs/screenshots/`, with no horizontal overflow.
- **Performance (replay, local):**
  - API p50: board 34 ms, track 13 ms, race 5 ms.
  - Cold LCP: board about 0.1 s, race about 0.25 s.
  - Size: JS 95 KB gzip.

## Next steps (in priority order)

1. **Verify TwinSpires from an open network.** Run `edge ts-probe`, or the
   "v2 — TwinSpires probe" workflow. Fix any endpoint path or field alias it
   reports. Replace the synthetic fixtures in
   `backend/tests/fixtures/twinspires/` with the captures.
2. **Run live for a few weeks** so snapshots and results accumulate. Then run
   `edge calibrate` (needs ≥ 500 races). Value flags carry an
   "unvalidated blend" tag until then.
3. **Fill the history for international simulcasts and new tracks.** They
   run market-only until v2's own results build their history; the poller
   already stores every official result.
4. **Richer inputs** are the biggest model lever: speed figures, beaten
   lengths, jockey/trainer and workouts. Relative-to-field features gave only
   +0.005 nats (D-012).
5. **Retire the legacy pipelines** once v2 ingests its own results (D-001).

## Known issues / limits

- Replay days have no results, so settlement and the live track record are
  only exercised by tests, not by the demo.
- Times show in the device's time zone; the track's local time is not
  available from the data.
- Archive "current odds" mostly equal the morning line, so replay is
  morning-line-only except for a few recorded cards (e.g. Belmont Stakes day).
- Pushing to GitHub was blocked during the rebuild session: the Claude
  GitHub App lacked write access. The work is committed on
  `claude/project-thread-bn8tyj`, and a bundle was saved alongside the
  project files.

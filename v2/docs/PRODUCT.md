# Equine Edge v2: Product Definition

**Owner:** Product Strategy. **Date:** 2026-10-21. **Status:** Proposed. Engineering builds from this.
**Inputs:** `docs/assessment_2026-10-01/` (01, 02, 06, 07), `README.md`, `pages/us_racing.py`, engineering-lead constraints (FastAPI + React/TS, local single user, TwinSpires JSON, market-blended multinomial logit).

---

## 1. Problem and target user

### The user
One person (the owner) who plays horses **for fun and for money**. They bet through **TwinSpires** at many tracks
on the same day: US thoroughbred, harness and quarter horse cards, plus the international simulcasts TwinSpires carries
(UK/IRE, France, Australia, Japan, Hong Kong and others). Their typical situation:

- **Several minutes between races, often fewer than 10.** Tracks overlap, so the next race to go off is usually at a
  track they have not studied.
- **Knows the game:** reads odds, understands takeout, plays exactas and trifectas, and knows the favorite wins roughly a third of the time.
  They do not need a beginner's tutorial. They do need a fast second opinion.
- **Bets small to medium amounts.** They care whether a price is good, not about a "system" that promises income.
- **Uses a laptop, with TwinSpires open in another tab.** Every decision ends on TwinSpires, never in our app.

### The problem
At an unfamiliar track, with 6 minutes to post, the user has no fast and honest way to answer **"is any runner in
this race priced better than its chance of winning, and how sure can I be?"** Their current options:

- TwinSpires/Brisnet PPs are deep but slow. They take 10+ minutes per race to read, and nothing in them gives a probability.
- The tote board shows the crowd's opinion but no fair value.
- The old Equine Edge mixes UK and US, shows big tables, has probabilities that do not add up (assessment P0:
  UK field sums 1.02–1.41), leaks future data into features, scores placeholders as real inputs, blocks the UI on
  subprocess buttons, and labels a prestige score "profitability". The user cannot trust its numbers.

**v2 has one job:** turn any TwinSpires race, at any track, into a coherent set of probabilities and fair odds,
compare them with the live tote, say how much evidence sits behind them, and get out of the way.

---

## 2. Jobs-to-be-done and core loop

| # | When I… | I want to… | So I can… |
|---|---|---|---|
| J1 | open the app during a racing afternoon | see every race about to go off, across all tracks, ranked by minutes to post (MTP), with value flags | pick where to spend my next 5 minutes |
| J2 | open a race at a track I have never studied | see fair odds vs live tote for each runner, plus an evidence level | decide in under 90 seconds whether to bet, pass, or look deeper |
| J3 | see a horse I like | know the **minimum tote odds** at which it is still a bet | avoid getting squeezed by late money after I bet |
| J4 | think about an exacta or trifecta | see the probability and fair payout of my combination, and of the best combos | avoid exotics that pay below their true odds |
| J5 | see a late scratch or a change | trust that probabilities are recomputed for the new field, right away | avoid betting off a stale screen |
| J6 | finish a day | see how my paper tickets did: P&L, closing-line value (CLV), and whether the model beat the market | learn whether to trust this tool and myself |
| J7 | doubt the model | see its honest track record against the market, broken down by evidence level and race type | calibrate how much I lean on it |

### Core loop (the one we design every screen around)

```
Board (all tracks, sorted by MTP)
  → tap race with a value flag (or the next one off)
    → Race view: fair odds | tote | edge | min odds | evidence   [≤ 90 s]
      → (optional) exotics helper for this race
        → "Save paper ticket"  and/or  "Open on TwinSpires" (deep link)
          → back to Board (next race)
...after results: Tickets review → Track record
```

**Scenario to test every design against:** *"Race 4 at Mountaineer goes in 6 minutes. I have never seen this track.
Is there value?"* The answer must be visible within 2 seconds of opening the race. If the honest answer is "thin
evidence, nothing beats the market", the screen says exactly that.

---

## 3. Competitive research

Searches were limited to six. Claims about paid products come from public product pages, not hands-on audits.

| Product | What it does well | Where it falls short for this user | What we take |
|---|---|---|---|
| **TwinSpires program + Brisnet** (CDI-owned) | Integrated with the bet slip; Brisnet Ultimate PPs with speed/pace figures, Prime Power, race summaries and comments ([Brisnet: using Ultimate PPs](https://www.brisnet.com/content/2023/02/handicappers-library-using-ultimate-pps-to-your-advantage/), [five tips](https://www.brisnet.com/racing/news/handicapping/how-i-use-brisnet-ultimate-pps-five-tips-by-keeler-johnson/), [library](https://www.brisnet.com/racing/library/)). Covers every track you can bet. | Ratings and rankings, but **no probabilities or fair odds**. Tells you nothing about price vs chance. Slow to read under time pressure. | Deep-link straight to the TwinSpires program page. Respect its race and track identity, because the user moves between the two apps. |
| **DRF Formulator** | Customizable PPs, past-race replays and charts, personal notes, trainer pattern stats, TimeformUS figures ([product page](https://promos.drf.com/formulator-pps)). Best tool for deep study. | A tool for deep study, not a 6-minute decision. Paid, tied to subscriptions. No market comparison. | Trip notes linked to the horse's next start (P2). |
| **TimeformUS** | Pace Projector gives a visual of the likely early race shape. Race analysis is clean and readable ([NYRA TimeformUS](https://www.nyra.com/timeformus), [Pace Projector example](https://www.horseracingnation.com/blogs/TimeformUS/Free_TimeformUS_Pace_Projector_Shows_Meltdown_123), [PP comparison](https://ladyandthetrack.com/ladys-guide-horse-racing/explaining-drf-bris-timeformus-past-performances)). | Thoroughbred-centric, partial track coverage, no probabilities vs live tote. | Show **one visual answer per race** instead of a wall of numbers. |
| **Equibase** | Official data of record: charts, results, Basic/Premium PP programs, free digital pocket PPs ([Premium PP](https://www.equibase.com/premium/eqbProductPage.cfm?pid=50300), [free pocket PPs](https://www.theracingbiz.com/?p=115360)). | Raw data, no decision layer. Strict licensing. | Results are the ground truth. **We do not scrape Equibase** in v2. |
| **HKJC** | The best-in-class live tote UX: odds and pool investments update continuously, odds-movement charts, very large liquid pools ([record pool coverage](https://www.thoroughbreddailynews.com/records-broken-as-ka-ying-rising-race-attracts-over-e10-million-in-wagers/)). | One jurisdiction, no fair-value layer. | Treat **odds movement as first-class**: a sparkline per runner, and a timestamp on every price. |
| **Betfair Exchange** | Back/lay ladders and traded volume make the market's probability explicit ([developer docs](https://betfair-developer-docs.atlassian.net/wiki/x/TCop)). | Not available to most US TwinSpires users. Different pools from the tote, so its price is not executable for our user. | Show **implied probability next to odds** everywhere. Do not ingest Betfair in v2. |
| **Racing Post** | Clear meeting/race navigation, short verdicts, spotlight comments ([racecards](https://www.racingpost.com/racecards/)). | UK-centric. "Verdict" language reads as tipping. | Clean race identity and navigation by time. **Avoid tipster tone.** |

**Our wedge:** none of these products answer **"price vs probability, right now, at any track, with honest
uncertainty"**. Benter-style market blending ([Benter 1994, R10](../../docs/assessment_2026-10-01/06_RESEARCH.md)) is
the right core: start from the market's opinion and move it only as far as our evidence justifies.

---

## 4. Keep / Kill / Add (relative to the old app)

### Kill (do not port, do not rebuild)
| Old feature | Why it dies |
|---|---|
| UK "Race Profitability Scorer" (class/prize/course tier → 0–100) | It measures prestige, not observed edge. The name is misleading. |
| Fixture calendar "predictions" (1,474 future races scored) | Forecasts for races with no declared runners cannot be acted on. |
| RL bankroll manager | No realistic reward environment. Cannot be reviewed. |
| Separate UK pipeline (Racing Post/UK scrapers, UK XGBoost, UK pages) | UK races come through TwinSpires simulcasts like any other track. One pipeline. |
| Per-country XGBoost models, 64/75-feature lists, placeholder jockey counts | Replaced by one track-agnostic within-race model. Placeholders are banned. |
| Betfair odds fetch, Equibase 7-day fetch, ABR stakes calendar | These prices or sources cannot be executed or used under their terms for this user. |
| "Fetch / Generate / Retrain" buttons that block the UI | Ingestion and prediction run as background jobs. The UI only reads. |
| Accuracy / ROC AUC headlines ("88.5% accuracy") | Wrong metric. Replaced by log-loss vs market and calibration (§7). |
| "Top Predictive Races" score, tier labels "Focus/Value/Avoid" | A value flag comes only from edge plus evidence. |
| Jockey/Trainer stats pages | No jockey/trainer data in history. They come back only when forward-accumulated data supports them (P2). |
| Minimum-Kelly rounding up (assessment P0) | Raising a tiny edge to 1% of bankroll is wrong. |

### Keep (concept survives, rebuilt correctly)
- **Fair odds and value vs market.** This becomes the product's core.
- **Place/show/exacta/trifecta probabilities**, now derived from one coherent win distribution with defined fields
  (`p_win`, `p_top2`, `p_top3`). Cumulative columns are never summed.
- **Paper tracking**, upgraded to immutable tickets with CLV (assessment F04).
- **Scratch awareness** (F01), with automatic recompute instead of a manual scenario studio.
- **The ~93k accumulated US results.** This history is the moat. Keep accumulating every day, for every TwinSpires track.
- **Provenance:** every prediction stores its model version and input snapshot ID.
- **Fractional stake preview with caps** (F05 logic), as P1 and opt-in.

### Add (new in v2)
- **Today Board across every TwinSpires track**, all breeds, one list sorted by MTP.
- **Evidence level** per runner and per race. Thin evidence pulls the output toward the market and suppresses flags.
- **Minimum acceptable odds** per runner ("bet only at 7-2 or better"). The tote moves after you bet, so this is
  more useful than a single edge number.
- **Deep link to the TwinSpires program page** for the exact race.
- **Data freshness on every price**, plus a Source Status page.
- **Honest Track Record page** built from predictions frozen before results were known.
- **Local backup and export.** The history and ticket ledger are the user's own assets.

---

## 5. MVP scope (v2.0)

Priority meanings: **P0** means v2.0 does not ship without it. **P1** follows within weeks. **P2** comes later, if the P0 metrics hold up.

### P0 requirements

**P0-1 Today Board**
- Lists every race TwinSpires offers today, across all tracks and breeds, sorted by MTP. Shows track, race #, breed
  icon (T/H/Q), country, MTP or post time in the user's local zone, field size (after scratches), race evidence
  level, and a value flag if one exists.
- *Accept:* (a) the track count matches TwinSpires' today-track list for that snapshot, with no silent drops. A track we
  cannot model still appears, marked "market only" or "no data". (b) MTP ticks client-side and re-syncs on each
  poll. (c) Races that went off move to a collapsed "Off / Results" section. (d) Filters for breed, country and
  "flags only" persist locally. (e) First paint takes under 1.5 s from local cache.

**P0-2 Race View: fair odds vs tote**
- One row per **betting interest**: program #, name, ML, live tote odds with implied %, model win %, fair odds, edge
  (= model p × (tote decimal odds) − 1, after takeout as reflected in the odds), minimum acceptable odds, and evidence badge.
  Also: deep-link button, race conditions (distance, surface, class/purse where available), and a snapshot timestamp.
- *Accept:* (a) win probabilities of active interests sum to 1 ± 1e-9. A server-side invariant check rejects any
  output that fails. (b) Coupled entries (1/1A) and mutuel fields are priced as one betting interest. (c) Edge is shown
  only when a live tote price exists. Before pools open, the view uses ML and labels it "morning line, not a price".
  (d) The row with the highest edge is visually distinct, but it carries no wording such as "best bet" or "lock". (e) Default sort is
  by program number, because that matches TwinSpires. (f) The deep link opens the correct race for at least 3 sampled tracks
  per breed.

**P0-3 Evidence levels and abstention**
- Each runner gets an evidence level (**Strong / Some / Thin / None**) based on how many of its prior starts we hold and how recent they are,
  plus a race level based on the share of the field with usable history. With Thin or None evidence, the blend weight
  moves toward the market. A value flag needs edge ≥ threshold **and** race evidence ≥ Some.
- *Accept:* (a) a race where no runner has history produces fair odds equal to the de-vigged market, within tolerance,
  and shows "Not enough history: showing market view". (b) The badge tooltip shows the counts (e.g. "4 starts, last
  38 days ago"), never just a color. (c) "No value found" is an explicit, normal state.

**P0-4 Scratches and late changes**
- Polling detects scratches, also-eligibles drawing in, post-time changes, and surface changes ("off the turf"), and
  triggers a full recompute for the new field.
- *Accept:* (a) a scratched runner disappears from actionable columns within one poll cycle and is shown struck through.
  (b) Probabilities renormalize **by rerunning the model**, not by dividing by the remaining sum. (c) A "changed since
  you opened" banner lists what changed. (d) Paper tickets on a scratched runner settle as refunds.

**P0-5 Exotics helper (exacta, trifecta; win/place/show context)**
- Shows top-N exacta and trifecta combinations by probability with fair payout per $1/$2 base. The user can pick or
  box runners and see combined probability and fair payout. Shows `p_top2` and `p_top3` per runner.
- *Accept:* (a) combination probabilities come from the same win vector (Harville or the engineering-chosen discounted
  variant). The sum over all exacta permutations equals 1. (b) A visible note says these are model fair values and
  real payouts depend on pool share and takeout. (c) When TwinSpires provides exotic probables or will-pays, they appear side
  by side. Otherwise the helper says they are unavailable.

**P0-6 Paper tickets, settlement and CLV**
- One click on a race view saves an immutable ticket: bet type, selection, stake (paper), tote odds and implied % at
  save time, model p, fair odds, evidence level, model version, snapshot ID and timestamp. Tickets settle automatically
  from results, including dead heats, DQs, refunds and coupled entries.
- *Accept:* (a) a saved ticket's payload can never be edited. A void is a new ledger event. (b) CLV = taken odds vs
  final tote odds (win bets) is shown per ticket and in aggregate, with coverage % where final odds exist. (c) The review
  screen shows P&L, ROI with a bootstrap 90% interval, mean CLV, and counts by evidence level. (d) Under 30 settled
  tickets, the screen says "too few to judge".

**P0-7 Model Track Record**
- Uses predictions frozen automatically at a fixed pre-off snapshot (target: last poll before post, and also MTP≈5). The rolling chart
  compares the log-loss of **model blend vs de-vigged market at the same snapshot**, plus a calibration
  (reliability) chart and splits by breed, country, evidence level and field size.
- *Accept:* (a) frozen predictions are written before the race result exists and are never regenerated. (b) The page
  shows bad periods as clearly as good ones, with no cherry-picked windows. Defaults are last 7 days, 30 days and all time. (c) Every number shows its sample size
  (races). (d) Value-flag performance (flagged count, ROI at final tote, mean CLV) appears with confidence intervals.

**P0-8 Data freshness and Source Status**
- Every price block shows "as of hh:mm:ss (Ns ago)". Data is stale if older than 2 poll intervals or 90 s inside 10 MTP. A Source Status
  page shows the last successful fetch per endpoint (tracks, races, entries, odds, results), error counts, and the next
  scheduled job, plus model version and DB size.
- *Accept:* (a) stale odds grey out edge and min-odds values and show "stale". Edge is never computed silently from stale
  prices. (b) Ingestion failures appear on the Board header within one cycle.

**P0-9 Empty, offline and error states**
- Every screen has a designed state for: no races today (dark day), the backend not running, TwinSpires unreachable
  (cached data with a timestamp banner), a track with no history, a race with no tote yet, results pending, and a model not
  trained.
- *Accept:* no screen shows a stack trace, raw filename or a blank table. Each state says what is happening and
  whether the user needs to do anything (usually nothing).

**P0-10 Background jobs, no blocking UI**
- The scheduler polls TwinSpires (tracks/races at about 5 min; entries/odds at about 30–60 s inside 20 MTP, slower outside; results
  after off), recomputes predictions on change, freezes snapshots, and settles tickets.
- *Accept:* no user action waits on a fetch longer than a normal API read (p95 < 300 ms locally). Jobs are idempotent.
  Request rate stays polite (§8) and can be configured.

**P0-11 Backup and export**
- Takes an automatic daily copy of the local database, keeping N copies. Offers one-click export of tickets and the track record
  (CSV) and a full DB backup.
- *Accept:* a restore from backup recreates tickets and history exactly (verified by checksum).

### P1
- Odds-movement sparkline per runner (ML → now). Highlights a "steam" or "drift" when it crosses a threshold.
- Fractional stake preview (F05: ¼ Kelly, per-race cap, never rounds up). Off by default.
- Real-bet log: the user records what they actually bet on TwinSpires. Shows a weekly/monthly spend summary next to paper results.
- Runner drawer: last N starts from our history (date, track, distance, surface, finish, beaten lengths if
  available, odds), with a name-match confidence.
- Multi-race helper: daily double and Pick 3 probabilities from the per-leg win vectors (assumes independence).
- Keyboard flow: `j/k` move between races, `enter` opens, `t` opens TwinSpires, `p` saves a paper ticket.
- Board alert (in-app only) when a watched race turns flagged within 10 MTP.
- Horse identity review: merge/split suggestions for same-name horses (country suffix, foaling year where known).

### P2
- Trip notes linked to a horse's next start (DRF-style).
- Forward-accumulated jockey/trainer stats (from today's entries going forward) as model features.
- Pace/early-speed shape visual (TimeformUS-style) once usable data exists.
- Superfecta and Pick 4/5/6 helpers. Replay "time machine" of snapshots (F02).
- LAN access from a phone on the home network (read-only).

---

## 6. Non-goals (v2)

- **Placing bets, holding funds, or automating TwinSpires in any way.** We link out; the user clicks Bet.
- **Accounts, multiple users, or public hosting.** Single local user only.
- **Tipping language or "picks of the day".** The product shows prices and probabilities. It does not issue recommendations.
- **Re-creating PPs.** Brisnet/DRF/Equibase already do this. We show only the form that our model actually uses.
- **Paid data integrations** (Brisnet figures, TimeformUS, Equibase charts) in v2.0.
- **Pre-entry fixture forecasting**, race "quality" scoring, RL staking, chatbots.
- **Non-TwinSpires markets** (Betfair, UK bookmakers, other ADWs) as decision prices.
- **Native mobile apps.** Phone layout must not break, but laptop is the main device.
- **Training models from the UI.** Training is an offline engineering command with a reviewed model card.

---

## 7. Success metrics

### Model (shown on the Track Record page; gate for "value flags on" by default)
| Metric | Definition | v2.0 target |
|---|---|---|
| Win log-loss vs market | Mean per-race log-loss of the blend minus de-vigged tote at the **same frozen snapshot** | ≤ 0 on rolling 30 days (never worse than market), with 95% CI excluding positive values on ≥ 2,000 races before flags default on |
| Calibration | Reliability by probability decile; expected calibration error (ECE) | ECE ≤ 0.01 overall; no decile off by > 2 pp with n ≥ 500 |
| Calibration by evidence level | Same, split Strong/Some/Thin/None | Thin/None behave like the market (within noise) |
| Exotic calibration | Observed exacta hit rate vs predicted, binned | Within CI; shows any longshot-in-2nd bias |
| Flag CLV | Mean log(taken odds / final odds) on flagged win tickets | > 0 over ≥ 500 flags (late money is informed, so this is a hard test) |
| Flag ROI | ROI at final tote, bootstrap 90% CI | Reported, not targeted. We expect ROI near −takeout until proven otherwise |
| Coverage | % of TwinSpires races with a valid frozen prediction before post | ≥ 95% (≥ 99% for US thoroughbred) |

### Product
| Metric | Definition | Target |
|---|---|---|
| Time-to-decision | Local event log: race view open → ticket saved, TwinSpires link clicked, or navigated away | Median ≤ 90 s |
| Time-to-answer | Race view open → edge column rendered | p95 ≤ 2 s |
| Freshness | Age of odds shown inside 5 MTP | p95 ≤ 60 s |
| Stale exposure | % of race-view opens where prices were stale | < 2% |
| Silent failure | Ingestion failures not shown on Status within one cycle | 0 |
| Trust (owner self-report, monthly) | "I'd check the app before betting an unfamiliar race" (1–5) | ≥ 4 |

---

## 8. Risks and assumptions

| Risk / assumption | Impact | Mitigation |
|---|---|---|
| **TwinSpires JSON is undocumented** and may change shape, rate-limit or block | App goes blind | Fixture-based parser tests; schema validation with loud failure; Source Status; keep the last good snapshot; a market-only/manual mode. Treat as the #1 operational risk. |
| **Terms of Service** may restrict automated access (not verified in this research) | Account or legal exposure | Personal, local, low-rate polling (no faster than a browser tab would refresh), no redistribution, no publishing, cache aggressively, honor any explicit block. The owner should read the TwinSpires ToS before go-live. |
| **The tote moves after you bet**; US late money is often informed | Edge at save time evaporates | Minimum acceptable odds; CLV tracking; freeze at MTP≈5 and at the last poll so we know how much edge survives to post. |
| **Takeout of roughly 15–25%+, higher on exotics** | Even an accurate model loses money | Edge is computed against payout-reflecting tote odds. Exotic fair values carry a takeout note. Metrics expect negative ROI by default. |
| **Thin history at new tracks, harness, QH and international** (93k races are mostly US thoroughbred) | Overconfident fair odds | Evidence levels pull toward the market. Flags require evidence ≥ Some. Track record split by breed and country. |
| **Horse identity by name only** | Wrong form attached to a horse (shared names, country suffixes, harness name reuse) | Normalize names with country suffix; match confidence; P1 review tool; low confidence lowers the evidence level. |
| **No jockey/trainer in history** | Weaker form model | Accumulate from entries from day 1. Market blend captures much of this signal. |
| **Coupled entries, mutuel fields, dead heats, DQs, also-eligibles** | Probability or settlement errors | Explicit betting-interest model; settlement test suite covering each case. |
| **Harville bias** (overrates favorites finishing 2nd and 3rd) | Exotic fair values look wrong | Engineering picks a discounted variant; track exotic calibration; label as model estimates. |
| **Timezones and international cards across midnight** | Wrong "today" and MTP | Use track-local times from the feed, store UTC, display in the user's zone; the Board uses a rolling window, not a calendar date. |
| **Responsible gambling**: a fast "value" tool can encourage chasing | Harm to the user | See stance below. |

### Responsible gambling stance (product requirement, not decoration)
- **Language:** no "lock", "best bet", "banker", "sure thing", "can't lose". Use "model estimate", "fair odds", "edge at current price".
- **Show uncertainty by default:** evidence badges, sample sizes, confidence intervals. When it is true, say "nothing here beats the market" plainly.
- **No gamification:** no streaks, confetti or "hot" badges, and no notifications outside the app by default.
- **Spend visibility:** the P1 real-bet log shows weekly and monthly totals. An optional user-set monthly limit shows a quiet banner when crossed. The app never blocks the user.
- **Cool-off toggle:** hides edge and flags for a chosen period, leaving a plain race viewer.
- **Persistent footer link** to help: 1-800-GAMBLER (US) and international equivalents, in a small, respectful format.
- **Honesty:** the Track Record shows losses as prominently as wins. The app never claims profitability without settled evidence.

---

## 9. Product principles (use these to settle disputes)

1. **Coherent or absent.** Probabilities in a race always sum to 1, and every derived number comes from them. If we
   cannot produce a coherent distribution, we show nothing rather than something wrong.
2. **The market is the prior; edge must be earned.** Without evidence, our answer equals the market. Every
   deviation is justified by evidence we can count and show.
3. **"No value" is a correct answer.** Abstaining is a feature, and most races should show no flag.
4. **Fresh beats complete.** A correct price from 20 seconds ago matters more than a richer feature computed from stale data.
   Every number carries its timestamp.
5. **Answer first, detail on demand.** The race view answers "value or not?" at a glance. Tables, form and
   diagnostics sit one click deeper. If a feature does not help the 6-minute decision, it moves off the main path.
6. **Track-agnostic in code, track-specific only in data.** No `if track == ...` product logic. A new TwinSpires
   track works on day one in market-only mode and improves as history accumulates.
7. **Reproducible or it didn't happen.** Every prediction, ticket and metric links to a model version and input
   snapshot. Nothing shown as evidence is ever regenerated after the result is known.
8. **Honest over flattering.** If a metric makes us look bad, it stays on the page. No accuracy headlines, no synthetic-odds ROI.
9. **TwinSpires is where the user bets; we are the second screen.** Match its race identity and numbering. Hand off
   with one click. Never imply that we place bets.
10. **Boring and local.** Single user, one database, background jobs, no accounts. Add infrastructure only
    when a metric shows it is needed.

---

## 10. Critic's notes (the 5 weakest points of this plan)

1. **The model may never beat the tote.** With no speed/pace figures, no jockey/trainer history, and identity by name only, a
   within-race form model has thin signal. A realistic outcome is "matches the market, with small edges on Strong-evidence
   US thoroughbred races". The product must still be worth using for its speed, coherent exotics and discipline if the
   flag metrics never turn positive. That is a weaker value proposition than "find value".
2. **Everything rests on one undocumented feed whose ToS was not verified.** One schema change or block from TwinSpires stops the
   product. The fallback ("market-only/manual mode") is vague and unspecified.
3. **CLV against final US tote may be structurally negative.** Late money is often the best-informed money, and our
   snapshot misses it. A user who saves tickets at 5 MTP may see persistent negative CLV and lose trust, even if
   the model is fine. We have not decided which snapshot the "edge" headline uses.
4. **Evidence levels are heuristic.** The Strong/Some/Thin/None thresholds and the blend-weight curve are not specified here and could be
   tuned to make the track record look good. They need to be fixed in a model card *before* the evaluation period.
5. **Time-to-decision and "trust" metrics are weak instruments.** With a single user and local event logging, a median of 90 seconds says
   little about decision quality, and self-reported trust is biased. The international simulcast scope (France, Japan, Australia)
   is probably over-ambitious for v2.0 coverage targets. We may want to scope those as market-only on purpose.

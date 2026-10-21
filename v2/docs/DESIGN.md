# Equine Edge v2 — Design Specification

Owner: UX/UI. Status: ready for implementation. Audience: the frontend engineer building the React + TypeScript SPA (custom CSS, no component library, hand-rolled SVG).

Old UI reference: `docs/assessment_2026-10-01/live-predictions.png` and `03_DESIGN.md`. What we are leaving behind: a generic Streamlit blue theme, emoji headings, low-contrast navy-on-blue buttons (around 1.9:1), "Step 1: Fetch Racecards" operational steps shown to the user, file names leaked into alerts ("Expected: racecards_2026-10-03.json"), and 20-column dataframes that cannot be read on a phone. In v2 the user never fetches anything. Data simply arrives, and the UI says how fresh it is.

---

## 1. Concept: "The Form"

Equine Edge v2 is a **past-performance page you can live in**. Horseplayers have read the same artefacts for a century: the Daily Racing Form PP page, the track program, the infield tote board. Those are dense, ruled, numeric, black ink on cheap paper, and still easy to scan because every column has a fixed job and every rule means something. We borrow that grammar, not its nostalgia. **By day (light theme) the app is newsprint:** warm paper, ink-black type, hairline column rules, a serif dateline masthead, and condensed tabular figures set in tight columns like a PP line. **By night (dark theme) it is the tote board:** a deep infield-green black, numbers in warm off-white, and lamp-amber reserved for anything live (minutes to post, odds that just changed, "AT POST"). The single brand colour is **infield green** (the colour of old American tote boards and paddock rails). Model opinions are set in **blue ink, like a handicapper's pencil annotations on the program**. The market is grey printed type. Disagreement between the two (the edge) is the only thing the interface shouts about, and it does so with sign, shape and pattern, never colour alone. The only "illustrations" are the real saddle-cloth colours. There are no gradients, glass, emoji or stock horses.

Design principles, in priority order:
1. **The race is the unit.** Every screen is at most two taps from a race.
2. **Numbers sit in columns.** Odds, percentages and times use tabular figures and right alignment. Nothing that is a number is centred.
3. **Uncertainty is visible.** Every model number carries its evidence level. Every price carries its age.
4. **Quiet until it matters.** Colour is reserved for edge, live state and errors. Everything else is ink.
5. **No operations exposed.** Users never see fetch buttons, file names, job IDs or stack traces.

---

## 2. Design tokens

All tokens live in `src/styles/tokens.css`. The theme comes from `prefers-color-scheme` and can be overridden by `data-theme="light|dark"` on `<html>`, which a toggle in Settings sets and persists to `localStorage` inside try/catch.

### 2.1 Fonts (Google Fonts)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,500;0,6..72,700;1,6..72,500&display=swap">
```

| Role | Family | Use |
|---|---|---|
| Display / dateline | **Newsreader** (variable optical size), fallback `"Iowan Old Style", Georgia, "Times New Roman", serif` | Masthead wordmark, track names, page titles, race titles. Never used in tables. |
| UI / body | **IBM Plex Sans**, fallback `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Labels, prose, buttons, horse names. |
| Figures / tables | **IBM Plex Sans Condensed**, fallback `"Roboto Condensed", "Arial Narrow", sans-serif-condensed, system-ui, sans-serif` | Every number: odds, %, MTP, post time, purse, $ amounts, saddle-cloth numbers, column headers. Always `font-variant-numeric: tabular-nums lining-nums; font-feature-settings: "tnum" 1, "lnum" 1;`. |

Why these: the condensed face fits a 10-column PP line at 1280px and a 3-number line at 375px, and Plex's tabular figures keep digits aligned during the odds flip. Newsreader gives the newspaper dateline voice without looking like a wedding invitation.

### 2.2 Colour: light ("Newsprint") and dark ("Tote board")

```css
:root {
  /* ---------- Light: Newsprint ---------- */
  --c-paper:        #F3EFE4;  /* page background */
  --c-sheet:        #FBF9F4;  /* raised surfaces: tables, panels, sheets */
  --c-sheet-sunk:   #E7E0CF;  /* table header band, selected row, skeleton base */
  --c-ink:          #1C1B18;  /* primary text */
  --c-ink-2:        #45423B;  /* secondary text: jockey/trainer, captions */
  --c-ink-3:        #625E55;  /* tertiary text: metadata, timestamps (min. size 12px) */
  --c-rule:         #CBC3B1;  /* hairline column/row rules (decorative only) */
  --c-rule-strong:  #857E70;  /* control borders, chart axes (>=3:1 non-text) */
  --c-rule-heavy:   #1C1B18;  /* 2px program rule under table headers / masthead */

  --c-brand:        #1E4D3B;  /* infield green: primary buttons, active nav, wordmark */
  --c-on-brand:     #FFFFFF;

  --c-model:        #0A58A8;  /* model probability marks ("handicapper's blue pencil") */
  --c-market:       #8C8576;  /* market probability marks (graphic only, not text) */

  --c-over:         #0A58A8;  /* positive edge (overlay) text + fills: blue */
  --c-over-wash:    #DCE8F5;  /* positive edge row tint (behind ink text) */
  --c-under:        #A3470C;  /* negative edge (underlay) text: burnt orange */
  --c-under-fill:   #B85A1E;  /* negative edge graphic fill (always hatched) */
  --c-under-wash:   #F4E2D3;

  --c-live:         #7A5200;  /* "lamp" amber as text on paper: MTP < 5, AT POST, changed odds */
  --c-live-lamp:    #E9A21B;  /* amber as a graphic (dot, flip flash bg) */
  --c-danger:       #A51D17;  /* errors only, never for edge */
  --c-danger-wash:  #F6DCD9;

  --c-focus:        #0A58A8;
  --c-scrim:        rgb(28 27 24 / 0.45);
  --c-replay-a:     #F4E2B8;  /* replay ribbon stripes */
  --c-replay-b:     #EAD39A;

  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* identical block to [data-theme="dark"] below */ }
}

:root[data-theme="dark"] {
  /* ---------- Dark: Tote board ---------- */
  --c-paper:        #0E1311;
  --c-sheet:        #151C18;
  --c-sheet-sunk:   #1E2A24;
  --c-ink:          #EEE9DC;
  --c-ink-2:        #BDB7A7;
  --c-ink-3:        #959083;
  --c-rule:         #2E3832;
  --c-rule-strong:  #5E6A63;
  --c-rule-heavy:   #BDB7A7;

  --c-brand:        #86C9A4;
  --c-on-brand:     #0E1311;

  --c-model:        #74B6FF;
  --c-market:       #7C776B;

  --c-over:         #74B6FF;
  --c-over-wash:    #15283D;
  --c-under:        #F29A5E;
  --c-under-fill:   #F29A5E;
  --c-under-wash:   #33221A;

  --c-live:         #F4B740;
  --c-live-lamp:    #F4B740;
  --c-danger:       #FF8F87;
  --c-danger-wash:  #3A1B19;

  --c-focus:        #F4B740;
  --c-scrim:        rgb(0 0 0 / 0.6);
  --c-replay-a:     #2B2414;
  --c-replay-b:     #3A3019;

  color-scheme: dark;
}

body { background: var(--c-paper); color: var(--c-ink); }
```

(Implementation note: CSS cannot share one declaration block between a media query and an attribute selector. Duplicate the dark block inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`. A build-time PostCSS mixin is fine.)

**Measured contrast (WCAG 2.x relative luminance):**

| Pair | Light | Dark | Requirement |
|---|---|---|---|
| ink on paper | 14.99:1 | 15.47:1 | AA text 4.5 ✓ AAA ✓ |
| ink on sheet | 16.37:1 | 14.30:1 | ✓ |
| ink-2 on paper | 8.72:1 | 9.37:1 | ✓ |
| ink-3 on paper | 5.62:1 | 5.89:1 | AA ✓ |
| ink-3 on sheet | 6.14:1 | 5.45:1 | AA ✓ |
| ink on sheet-sunk (header band) | 13.09:1 | 12.27:1 | ✓ |
| over (blue) on paper / sheet | 6.15 / 6.71 | 8.82 / 8.16 | AA ✓ |
| under (orange) on paper / sheet | 5.28 / 5.76 | 8.54 / 7.89 | AA ✓ |
| live (amber) on paper / sheet | 6.02 / 6.58 | 10.44 / 9.66 | AA ✓ |
| danger on paper | 6.56:1 | 8.51:1 | AA ✓ |
| on-brand on brand (primary button) | 9.63:1 | 9.74:1 | AA ✓ |
| focus ring vs paper | 6.15:1 | 10.44:1 | non-text 3:1 ✓ |
| rule-strong vs paper (control borders, axes) | 3.50:1 | 3.32:1 | non-text 3:1 ✓ |
| market mark vs paper | 3.19:1 | 4.20:1 | non-text 3:1 ✓ |
| under-fill vs paper | 4.04:1 | 8.54:1 | non-text 3:1 ✓ |
| rule (hairline) vs paper | 1.53:1 | 1.54:1 | **decorative only**. Never the sole boundary of an interactive control. |

Colour-vision safety: edge is **blue vs orange**, which survives deuteranopia, protanopia and tritanopia far better than red/green. It is also always double-encoded with sign (+/−), glyph (▲ / ▽) and pattern (solid vs 45° hatch). Check every chart in grayscale before merge.

### 2.3 Saddle-cloth colours

Component: `<Cloth n breed>`. Values are tuned so the number on the cloth reaches at least 4.5:1, except where noted. The number is set at 14px/700, which counts as "large bold" for the 3:1 threshold. Every cloth has a 1px `--c-rule-strong` inset border so white and khaki cloths read on paper.

**Thoroughbred and Quarter Horse (US standard):**

| # | Cloth | Number | Ratio |
|---|---|---|---|
| 1 | Red `#D7262E` | White `#FFFFFF` | 4.99 |
| 2 | White `#FFFFFF` | Black `#111111` | 18.88 |
| 3 | Blue `#1F4FB4` | White | 7.41 |
| 4 | Yellow `#F7D417` | Black | 12.93 |
| 5 | Green `#13814A` | White | 4.92 |
| 6 | Black `#111111` | Yellow `#F7D417` | 12.93 |
| 7 | Orange `#F57C1F` | Black | 7.00 |
| 8 | Pink `#F6A6C4` | Black | 10.04 |
| 9 | Turquoise `#2EC4C6` | Black | 8.84 |
| 10 | Purple `#6B2FA3` | White | 8.20 |
| 11 | Grey `#C4C4C4` | Red `#A30F18` | 4.56 |
| 12 | Lime `#9EDB3A` | Black | 11.37 |
| 13 | Brown `#6E4426` | White | 8.34 |
| 14 | Maroon `#7A1630` | Yellow `#F7D417` | 7.25 |
| 15 | Khaki `#C8B88A` | Black | 9.60 |
| 16 | Light blue `#A8D8F5` | Red `#A30F18` | 5.23 |
| 17 | Navy `#1B2A5C` | White | 13.70 |
| 18 | Forest green `#1F5A32` | Yellow `#F7D417` | 5.60 |
| 19 | Mid blue `#3A7BD5` | Black | 4.47 (large bold ✓) |
| 20 | Fuchsia `#C2187F` | Yellow `#FFE14D` | 4.32 (large bold ✓) |

Coupled entries (1A, 1X) use the cloth of the base number with the suffix letter in the same colour. Above 20, and wherever the data lacks a number, the chip uses `--c-sheet-sunk` with ink.

**Harness (USTA standard):** 1 Red/White · 2 Blue `#1F4FB4`/White · 3 White/Red `#D7262E` (4.99) · 4 Green `#13814A`/White · 5 Black/Yellow · 6 Yellow/Black · 7 Pink/Black · 8 Grey `#C4C4C4`/Red `#A30F18` (4.56) · 9 Purple `#6B2FA3`/Yellow (5.62) · 10 Turquoise/Black · 11 Navy/White · 12 Light blue `#A8D8F5`/Black. Harness 8 in its field-standard values (grey with red) measured 1.77:1, so we deliberately darken the red.

**International simulcasts:** there is no standard, so the chip is neutral (`--c-sheet-sunk` with an ink number). The data layer must send `breed` and `jurisdiction`. The UI never guesses colours.

> Data note for the engineer and PM: verify cloths 17–20 and the full harness set against the TwinSpires program for one live card per breed before launch. The table is data in `src/domain/saddlecloths.ts`, not CSS.

### 2.4 Type scale

Base size: 15px body and 14px tables. Text is never smaller than 12px. Line heights are unitless.

```css
:root {
  --ff-display: "Newsreader", "Iowan Old Style", Georgia, serif;
  --ff-ui:      "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --ff-num:     "IBM Plex Sans Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif;

  --fs-12: 0.75rem;   /* 12px: table meta, timestamps, cloth sub-letters  lh 1.33 */
  --fs-13: 0.8125rem; /* 13px: column headers (num font, 600, caps, +0.04em)  lh 1.3 */
  --fs-14: 0.875rem;  /* 14px: table cells, chips, buttons  lh 1.43 */
  --fs-15: 0.9375rem; /* 15px: body prose  lh 1.55 */
  --fs-17: 1.0625rem; /* 17px: section headings (ui 600)  lh 1.35 */
  --fs-20: 1.25rem;   /* 20px: race title on phone, big odds in mobile card  lh 1.25 */
  --fs-24: 1.5rem;    /* 24px: race title desktop (display 700)  lh 1.2 */
  --fs-32: 2rem;      /* 32px: track name / page title (display 700, opsz 72)  lh 1.1 */
  --fs-44: 2.75rem;   /* 44px: hero MTP numeral on race header (num 700)  lh 1 */

  --fw-regular: 400; --fw-medium: 500; --fw-semibold: 600; --fw-bold: 700;
  --tracking-caps: 0.04em;
}
html { font-size: 100%; }   /* respect user zoom; never set px on html */
```

Rules:
- Column headers: `--ff-num`, 13px, 600, uppercase, `letter-spacing: var(--tracking-caps)`, `--c-ink-2`.
- Horse names: `--ff-ui` 14px 600 in tables, 16px 600 on mobile cards. Display them in the data's case. Never force uppercase, because foreign names lose meaning.
- Track names: `--ff-display` 700. Datelines: `--ff-display` italic 500, e.g. *Saratoga — Wednesday, Oct. 21*.

### 2.5 Spacing, layout, radii, borders, elevation

```css
:root {
  --sp-0: 2px; --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px;
  --sp-5: 24px; --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  --gutter: 16px;            /* phone side gutter; 24px >= 768px; 32px >= 1200px */
  --content-max: 1280px;
  --row-h: 40px;             /* desktop runner row */
  --row-h-compact: 32px;     /* track card race rows, tickets list */
  --tap-min: 44px;           /* every touch target on coarse pointers */

  --radius-0: 0;             /* tables, panels: program pages are square */
  --radius-1: 2px;           /* buttons, inputs, chips, cloths */
  --radius-2: 4px;           /* popovers, sheets, toasts */
  /* No pill radii except the freshness lamp dot (50%). */

  --bw-hair: 1px;            /* --c-rule */
  --bw-control: 1px;         /* --c-rule-strong */
  --bw-heavy: 2px;           /* --c-rule-heavy: under thead, under masthead */
  --rule-double: 3px double var(--c-rule-heavy); /* masthead bottom only */

  --shadow-0: none;          /* default: we separate with rules, not shadows */
  --shadow-pop: 0 1px 0 var(--c-rule), 0 8px 24px rgb(28 27 24 / 0.14); /* popover, sheet, toast */
  /* dark: 0 1px 0 var(--c-rule), 0 8px 24px rgb(0 0 0 / 0.5) */

  --z-sticky: 10; --z-ribbon: 20; --z-pop: 30; --z-sheet: 40; --z-toast: 50;
}
```

Breakpoints (min-width): `sm 480px`, `md 768px`, `lg 1024px`, `xl 1200px`. Design for 375px first. There is no horizontal page scroll at any width. Only a deliberately scrollable table region may scroll sideways, and it must have a visible fade-edge cue.

### 2.6 Motion

```css
:root {
  --dur-instant: 80ms;    /* hover/press colour */
  --dur-fast: 140ms;      /* chip toggles, row expand chevron */
  --dur-flip: 180ms;      /* one tote digit flip (per digit, staggered 40ms) */
  --dur-med: 240ms;       /* sheet slide, row expand height */
  --dur-slow: 400ms;      /* skeleton shimmer cycle step, chart bar settle */
  --ease-out: cubic-bezier(.2, 0, 0, 1);
  --ease-in-out: cubic-bezier(.4, 0, .2, 1);
  --ease-flip: cubic-bezier(.5, 0, .5, 1);
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur-fast: 0ms; --dur-flip: 0ms; --dur-med: 0ms; --dur-slow: 0ms; }
  /* Skeleton shimmer stops (static --c-sheet-sunk). Flips become instant swaps plus the 1.5s "changed" underline (sec. 9). */
}
```

Nothing loops forever except the skeleton shimmer, which is capped at 10s before it becomes static. Nothing auto-scrolls.

### 2.7 Focus ring

```css
:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
  border-radius: var(--radius-1);
}
/* Inside tables, rows are focusable: ring drawn inset so it is not clipped by overflow */
tr:focus-visible, .runner-card:focus-visible { outline-offset: -2px; }
```

Never `outline: none` without a replacement. In dark mode the ring is amber (10.4:1 on paper).

### 2.8 Components: base styles

- **Primary button** (one per view at most, e.g. "Add paper ticket"): `--c-brand` background, `--c-on-brand` text, 14px/600 UI font, height 36px (44px on coarse pointers), padding 0 16px, radius 2px. Hover: `filter: brightness(1.08)`, or 0.92 in dark. Disabled: `--c-sheet-sunk` background with `--c-ink-3` text plus a `title` explaining why.
- **Secondary button**: transparent, 1px `--c-rule-strong` border, ink text.
- **External link button** ("Bet on TwinSpires ↗"): secondary style plus a trailing ↗ glyph, `target="_blank" rel="noopener noreferrer"`. It is never the primary colour, because we do not push betting.
- **Chip / filter toggle**: 28px tall (44px hit area on touch via padding/`::after`), 1px rule-strong border, radius 2px. Selected: ink background, paper text (14.99:1), with `aria-pressed="true"`.
- **Inputs**: 36px, 1px rule-strong border, sheet background, num font for numeric inputs, `inputmode="decimal"`.

---

## 3. Information architecture and navigation

### 3.1 Routes

| Route | Screen | Notes |
|---|---|---|
| `/` | Today board | `?breed=tb\|hn\|qh\|intl` (multi: `breed=tb,hn`), `?d=2026-10-21` for another date (default: today in the user's timezone). |
| `/t/:trackId` | Track card | `trackId` = TwinSpires track code + date, e.g. `/t/SAR-20261021`. A bare `/t/SAR` redirects to today's card for SAR, or shows "No card today" with next race date if known. |
| `/r/:raceId` | Race view | `raceId` = `SAR-20261021-7`. Sub-state in query only: `?tab=exotics`, `?whatif=3,7` (hypothetical scratches, shareable), `?sort=edge`. |
| `/tickets` | Tickets | `?range=7d\|30d\|all`, `?status=open\|settled`. |
| `/tickets/:ticketId` | Ticket detail | Opens as a sheet over `/tickets` on desktop, or a full page on phone. |
| `/model` | How it works and track record | Anchors: `#calibration`, `#backtest`, `#evidence`, `#limits`. |
| `/settings` | Odds format (fractional/decimal/American, default fractional as on US tote), theme, favourite tracks, timezone, sound off/on. | |
| `*?replay=2026-09-14` | Any route in demo replay | Replay is a global mode carried in the URL, so a replay link never looks live. |

Unknown or expired IDs show a 404-in-context page: "We can't find race SAR-20261021-14. Saratoga ran 10 races that day." Below it, the track card list.

### 3.2 Global chrome

```
Desktop (>= 1024px)
+--------------------------------------------------------------------------------------+
| EQUINE EDGE   Wednesday, Oct. 21                Today  Tickets  Model   ● Live 12s ⚙ |
|==================================================(double rule)=======================|
| NEXT UP  SAR R7 4m ▲  ·  WO R3 9m  ·  MVR R5 11m ▲  ·  LRL R6 14m  ·  ...        →   |
+--------------------------------------------------------------------------------------+
```
- Masthead: 56px tall, sticky. The wordmark is Newsreader 700 small caps (`font-variant: small-caps`, 20px, `--c-brand`). The dateline is Newsreader italic 15px `--c-ink-2`.
- Nav items: UI 14px/500. Active = ink, with a 2px `--c-ink` underline offset 6px. Inactive = `--c-ink-2`.
- The **freshness lamp** sits on the right (sec. 7.1).
- The **Next-up strip** shows only on `/` and `/t/*`. It is 36px tall, scrolls horizontally with snap, and lists the 8 next races anywhere.
- Phone (< 768px): masthead is 48px with the wordmark "EE" monogram plus the dateline. Nav moves to a **bottom tab bar** (56px + safe-area-inset-bottom) with Today / Tickets / Model labelled text and 20px line icons drawn in-house (a program, a ticket stub, a calibration diagonal). No emoji.

### 3.3 Keyboard shortcuts

Shortcuts are active when focus is not in a text input. They are listed in the `?` overlay and in `/model#help`. Single-key shortcuts can be turned off in Settings (WCAG 2.1.4).

| Key | Action | Scope |
|---|---|---|
| `?` | Open shortcut help (dialog) | global |
| `/` | Focus track search / filter | Today, Track |
| `g` then `t` / `k` / `m` | Go to Today / Tickets (k for "kit") / Model | global |
| `n` | Open the next race to post anywhere | global |
| `j` / `k` | Next / previous **race** at this track (Race view). Next / previous row (lists). | Race, Track, Today |
| `[` / `]` | Previous / next **track** (by next post) | Race, Track |
| `↑` / `↓` | Move row focus in runner table | Race |
| `Enter` | Expand focused runner / open focused race | lists |
| `x` | Toggle what-if scratch on focused runner | Race |
| `Shift+X` | Clear all what-if scratches | Race |
| `e` | Toggle Exotics panel | Race |
| `s` | Cycle sort: Program → Model → Edge → Odds | Race |
| `t` | Add paper ticket for focused runner (opens sheet) | Race |
| `b` | Open race on TwinSpires (new tab) | Race |
| `o` | Cycle odds format | global |
| `Esc` | Close sheet / dialog / overlay | global |

### 3.4 Primary flows
1. Open app → Next-up strip → race (1 tap).
2. Open app → pinned track row → race row (2 taps).
3. Race → spot overlay → Add paper ticket (price prefilled) → Save (3 taps).
4. Ticket settles automatically when the race goes official. A toast reads "SAR R7 is official. 1 ticket settled."

---

## 4. Screens

Desktop wireframes are drawn at about 1280px wide. Phone wireframes are drawn at 375px.

### 4.1 Today board `/`

```
+----------------------------------------------------------------------------------------+
| EQUINE EDGE   Wednesday, Oct. 21                 Today  Tickets  Model   ● Live 12s ⚙  |
|=========================================================================================|
| NEXT UP  [3] SAR R7  4 MTP  ▲ +6.1   | [5] WO R3 9 MTP   | [1] MVR R5 11 MTP ▲ +3.0  →  |
+----------------------------------------------------------------------------------------+
|  Today's racing                                                    [/ Filter tracks  ] |
|  [All 41] [Thoroughbred 19] [Harness 12] [Quarter Horse 4] [International 6]           |
|                                                                                        |
|  PINNED ─────────────────────────────────────────────────────────────────────────────  |
|  ★ Saratoga        TB  R7 of 10   Next post 1:42 PM   4 MTP   Fast / Firm   2 overlays>|
|  ★ Woodbine        TB  R3 of 9    Next post 1:47 PM   9 MTP   Fast / Good   —        >|
|                                                                                        |
|  ALL TRACKS · BY NEXT POST ──────────────────────────────────────────────────────────  |
|  TRACK               BREED  RACE     NEXT POST   MTP   SURFACE         SIGNAL          |
|  ☆ Meadowlands       HN     R5/14    1:49 PM     11    Fast            ▲ 1 overlay    >|
|  ☆ Laurel Park       TB     R6/9     1:52 PM     14    Fast / Yielding —              >|
|  ☆ Sha Tin (HK)      INTL   R2/10    2:05 AM+1   —     Good            Opens 11:30 PM >|
|  ☆ Los Alamitos QH   QH     R1/10    6:30 PM     —     Fast            Not open yet   >|
|  ☆ Aqueduct          TB     —        Finished    —                     9 of 9 official>|
+----------------------------------------------------------------------------------------+
```

- **Breed filter**: a chip group (`role="group" aria-label="Breed"`) where each chip shows its count. Multi-select is allowed. "All" clears the others. The selection persists in the URL and in localStorage as `ee.breedFilter`.
- **Grouping**: Pinned first, then all tracks sorted by next post ascending. Finished tracks sink to a collapsed "Finished today (n)" disclosure at the bottom. Tracks with no race open in the next 3 hours appear after the active tracks under "Later today".
- **Pinned**: the ☆/★ toggle is a `button` with `aria-pressed` and label "Pin Saratoga". Pins are stored per device in localStorage plus a user preference, if the backend exposes one.
- **Breed tag**: a 2–4 letter code in the num font, 12px/600 caps, 1px rule-strong border, no fill. TB, HN, QH and INTL are distinguished by text, not colour.
- **MTP cell**: see sec. 6.1. Over 60 min it shows the post time only and the MTP column reads "—".
- **Signal cell**: "▲ n overlays" in `--c-over` when any race in the next 60 min has an overlay at evidence level 2 or higher. Otherwise "—". Never orange here, because we do not advertise underlays.
- **Row**: the whole row is a link (`<a>` wrapping a grid row, 44px tall). The hover background is `--c-sheet-sunk`.
- **Next-up strip item**: `[Cloth of top pick] TRACK R#  MTP  ▲ edge`. Each item is a link to the race. It shows the 8 next races from all filtered breeds. The value marker appears only if the best overlay has edge ≥ +2.0 pts and evidence ≥ 2.

**Phone (375):**
```
+-----------------------------------+
| EE  Wed, Oct. 21        ● 12s  ⚙ |
|===================================|
| NEXT UP                         → |
| [3] SAR R7 · 4m ▲ | [5] WO R3 · 9m|
+-----------------------------------+
| [All] [TB] [HN] [QH] [INTL]  →    |
| PINNED                            |
| ★ Saratoga                  4 MTP |
|   TB · R7 of 10 · 1:42 PM  ▲ 2   >|
|-----------------------------------|
| ★ Woodbine                  9 MTP |
|   TB · R3 of 9 · 1:47 PM         >|
| BY NEXT POST                      |
| ☆ Meadowlands              11 MTP |
|   HN · R5 of 14 · 1:49 PM  ▲ 1   >|
| ...                               |
+-----------------------------------+
| Today      Tickets      Model     |
+-----------------------------------+
```
Each track is a two-line row (64px). Surface is hidden on phone and shown on the track card.

**States:**
- *Loading*: masthead renders immediately. The table shows 8 skeleton rows: bars at 60%/20%/30% widths, `--c-sheet-sunk` background, a 1.2s shimmer that stops after 10s. The Next-up strip shows 4 skeleton chips.
- *Empty (no racing)*: "No TwinSpires tracks are racing today." Below it: "Next card: Thursday, Oct. 22 — 37 tracks." Then a link, "Replay a recorded day →".
- *Empty (filter)*: "No harness tracks race today. [Show all breeds]".
- *Error*: an inline panel (sec. 7.3) replaces the list. Pinned tracks from cache still render with a stale tag.
- *Stale*: the lamp turns amber (sec. 7.1). MTP keeps counting from the cached post times, and rows get "as of 1:31 PM" in the table caption.

### 4.2 Track card `/t/:trackId`

```
+----------------------------------------------------------------------------------------+
| ‹ Today                                                                                 |
| Saratoga                                               ★ Pinned   Bet on TwinSpires ↗  |
| Saratoga Springs, NY — Wednesday, Oct. 21 · Thoroughbred · Dirt Fast · Turf Firm       |
|==========(2px rule)=====================================================================|
| R   POST      MTP  CONDITIONS                              PURSE     TOP PICK     BEST OVERLAY   STATUS |
|-------------------------------------------------------------------------------------------------------|
| 1   12:05 PM   —   6f Dirt · Mdn Sp Wt · 2YO               $90,000   [4] 41%      —              Official 4-7-1 |
| ...                                                                                                     |
| 6   1:12 PM    —   1 1/16m Turf · Alw 80k N1X              $80,000   [2] 28%      [6] +3.4 ▲     Official 6-2-9 |
| 7   1:42 PM    4   7f Dirt · G2 Stakes · 3YO+              $200,000  [3] 24%      [3] +6.1 ▲     Open           |
| 8   2:14 PM   36   1 1/8m Turf · Clm 25k                   $40,000   [1] 19%      [8] +2.2 ▲     Open           |
| 9   2:46 PM    —   6f Dirt · Mdn Clm 50k                   $45,000   [5] 22%      —              Open · ML only |
+-------------------------------------------------------------------------------------------------------+
```

- The rows are a `<table>` with a caption ("Saratoga races, Wednesday Oct. 21"). Row height is 40px. The whole row links to `/r/...` via a stretched link on the R cell, so the table semantics are preserved.
- The **current race** (next to post) gets a 3px left border in `--c-live-lamp`, plus "Next" in the status cell.
- **CONDITIONS**: distance in US notation (6f, 1 1/16m), then surface, class abbreviation (tooltip for the full name), and age/sex restrictions. Harness shows gait + class ("Pace · Cond. Trot"), and International shows the local distance, e.g. "1200m Turf · Class 4".
- **TOP PICK**: cloth chip plus model win %. **BEST OVERLAY**: cloth plus edge pts plus ▲. It is blank if no runner clears +2.0 pts at evidence ≥ 2. It shows "ML only" in ink-3 if the tote is not open yet.
- **STATUS**: `Open`, `Open · ML only`, `Closed` (betting closed, running), `Photo`/`Inquiry` (amber), `Official 4-7-1` (with the finish order as cloth mini-chips at 16px), `Cancelled` (struck through), `Abandoned`.
- **Phone**: each race is a 3-line block. Line 1: `R7 · 1:42 PM · 4 MTP`. Line 2: conditions (12px ink-2). Line 3: `Pick [3] 24%   Overlay [3] ▲ +6.1`. Status sits right-aligned on line 1.
- *States*: loading (10 skeleton rows), track cancelled ("Saratoga cancelled today's card at 10:12 AM — weather."), and "Card not published yet. TwinSpires usually posts entries by 9 AM ET."

### 4.3 Race view `/r/:raceId` (core screen)

**Desktop (≥ 1024px)**: the runner table is on the left (about 64%) and a side column on the right (about 36%) holds the model vs market chart and the exotics helper. At 1024–1199px the chart moves under the table.

```
+-----------------------------------------------------------------------------------------------+
| ‹ Saratoga   R6 ‹  R7  › R8                                         j / k  ·  ? shortcuts    |
| Race 7 · The Forego (G2)                                                         4  MTP      |
| 7 furlongs · Dirt (Fast) · 3YO+ · Stakes · $200,000 · Post 1:42 PM ET            1:42 PM     |
| Odds as of 1:37:48 PM ● · Model run 1:36 PM                  [Bet on TwinSpires ↗] [+ Ticket] |
|============(2px rule)==========================================================================|
| Sort: [Program] [Model] [Edge] [Odds]      What-if: none         Odds format: 5-2 ▾           |
|-----------------------------------------------------------------------------------------------|
| #    HORSE / JOCKEY / TRAINER           ML    LIVE   MODEL  FAIR   EDGE       EVID.   ⋯      |
|-----------------------------------------------------------------------------------------------|
| [1]  Tapit Trice                        3-1   7-2    19%    4-1    ▽ −2.9     ▮▮▮▯    ⋯      |
|      J. Ortiz · T. Pletcher                          ▬▬▬▬▬▭▭▭                                  |
| [2]  Speed Bias                         8-1   12-1   6%     15-1   ≈ −1.7    ▮▮▯▯    ⋯      |
|      I. Ortiz · C. Brown                                                                       |
|▌[3]  Arabian Lion                       5-1   5-1    24%    3-1    ▲ +7.3     ▮▮▮▮    ⋯      |
|▌     F. Prat · B. Baffert              (row tint: over-wash)                                    |
| [4]  Shirl's Speight      SCR  ─────────────────── Scratched (vet) 11:02 AM ──────────────────  |
| [5]  Prince of Monaco                   2-1   9-5    31%    9-4    ▽ −4.7     ▮▮▮▮    ⋯      |
|      J. Rosario · B. Baffert                                                                   |
| ...                                                                                            |
|-----------------------------------------------------------------------------------------------|
| Model chances sum to 100% across 8 active runners. Market chances shown with takeout removed. |
+-----------------------------------------------------------------------------------------------+
  RIGHT COLUMN
+-------------------------------------------+
| MODEL vs MARKET                     ⓘ    |
| [1] ●──○ ....  (dumbbell rows, sec. 5.1)  |
| [3]      ○────●                           |
| ● Model   ○ Market (tote, takeout removed)|
+-------------------------------------------+
| EXOTICS        [Exacta] [Trifecta]  $1 $2 |
| COMBO        CHANCE   FAIR $2   WILL-PAY  |
| [5]-[3]      8.1%     $24.70    $19.40    |
| [3]-[5]      6.9%     $29.00    $31.80 ▲  |
| [5]-[1]      5.2%     $38.50    $27.10    |
| ... top 10                                 |
| Fair = $2 ÷ chance. Real payouts are after |
| ~19% takeout and change until post.        |
+-------------------------------------------+
```

**Header**
- Race nav: `‹ R6 · R7 · R8 ›` uses links (j/k). The current race has `aria-current="page"`.
- Title: "Race 7" in the display font at 24px, then "· The Forego (G2)" if the race has a name.
- MTP block: a 44px num-font numeral plus a 12px "MTP" label, with the post time below in ink-3. Colour rules are in sec. 6.1.
- Data line: "Odds as of 1:37:48 PM" with a freshness lamp dot (sec. 7.1), then "Model run 1:36 PM". If the model has not been rerun after a scratch: "Model rerun after scratch of #4 at 11:04 AM".
- Actions: `Bet on TwinSpires ↗` (secondary/external) and `+ Ticket` (primary, opens the ticket sheet with no runner preselected). In replay mode the Bet button is disabled with the title "Replay — betting links are off".

**Runner table** (`<table>`; sec. 8.4 covers semantics)

| Column | Width | Content and format |
|---|---|---|
| # | 44px | Cloth chip 28×28, num font 14/700, radius 2px. |
| Horse / Jockey / Trainer | flex, min 220px | Line 1: horse 14/600 ink, with optional tags (`1st Lasix`, `Blinkers on`, `Shipper`) as 12px ink-3 text. Line 2: "J. Ortiz · T. Pletcher" 12px ink-2, truncated with ellipsis and full text in `title`. Harness line 2 shows the driver. |
| ML | 52px | Morning line, ink-2, right-aligned. |
| Live | 60px | Live tote odds, ink, 600, right-aligned, with the flip animation (sec. 9). "—" before the tote opens. |
| Model | 56px | Model win %, `--c-model`, 600, right-aligned. Under 1% shows "<1%". Integer % above 10, one decimal below 10 (e.g. 6.4%). |
| Fair | 56px | Fair odds = (1−p)/p in the user's format, rounded to the nearest standard tote increment (see note). ink-2. |
| Edge | 84px | Edge in **percentage points** = model % − market % (takeout-removed tote). Format "▲ +7.3" / "▽ −2.9" / "≈ +0.4". See sec. 5.5. |
| Evid. | 52px | Evidence meter (sec. 5.4). |
| ⋯ | 44px | Row menu: What-if scratch · Add ticket · Details. |

Fair odds rounding: the nearest of 1-9, 1-5, 2-5, 1-2, 3-5, 4-5, 1-1, 6-5, 7-5, 3-2, 8-5, 9-5, 2-1, 5-2, 3-1, 7-2, 4-1, 9-2, 5-1, and integers beyond. Decimal format uses 2 dp. American format uses integers.

- **Row interactions**: click or Enter expands an inline detail drawer (height animates with `--dur-med`). The drawer shows last 3 starts (date, track, distance, finish, beaten lengths), days since last race, model's top 3 factors as plain sentences ("Fastest last-out speed figure in the field"), missing data ("No workouts in our data"), and buttons `What-if scratch` and `+ Paper ticket at 5-1`.
- **Overlay row emphasis**: rows with edge ≥ +2.0 pts and evidence ≥ 2 get the `--c-over-wash` background plus a 3px left border in `--c-over`. The text stays ink. Underlays get no row tint. Only their Edge cell is coloured, which keeps the page calm.
- **Sort**: a chip group. The default is Program (#). Sorting moves scratched runners to the bottom. The `<th>` carries `aria-sort`.

**Scratch toggle (what-if)**
- From the row menu or `x`. A hypothetical scratch draws a **dashed** strikethrough on the horse name and an outlined "WHAT-IF" tag. An official scratch draws a solid strikethrough and a filled "SCR" tag.
- A banner shows under the sort bar in `--c-sheet-sunk`: "What-if: without #2, #6. Model chances recomputed. Live odds unchanged. [Reset]". The banner is `role="status"`.
- Model, Fair and Edge recompute client-side or via API. Changed cells get the "changed" underline (sec. 9.1). The URL updates to `?whatif=2,6`.
- Edge in what-if mode compares against **current** tote chances renormalised without the scratched runners, and the column header changes to "EDGE*" with a footnote: "*Approximate: the real market will re-form after a scratch."

**Exotics helper**
- Tabs: Exacta / Trifecta (`role="tablist"`). Base toggle $1 / $2 (default $2 for exacta and $1 for trifecta, as on the TwinSpires defaults).
- Each row: cloth chips joined by thin dashes, chance %, fair payout for the base, will-pay when TwinSpires exposes it (otherwise "—"), and ▲ when will-pay ≥ fair × 1.15. The top 10 combos are shown, with a "Show 20" toggle.
- Footer (always visible): "Fair payout = base ÷ chance, before takeout. Exotic chances compound model error. Treat them as rough."
- On phone it is a collapsible section below the runners, collapsed by default and labelled "Exotics: top combos".

**Race official / result shown**
- Header MTP is replaced by an **OFFICIAL** stamp (sec. 9.4). Status reads "Official 1:44 PM · Final time 1:21.87".
- The table gains a leading **Fin** column (1st, 2nd... in num font 600). The default sort switches to finish order. Payout columns appear for the top 3 rows: `$2 Win / Place / Show`.
- Live column → "Final" odds. Edge stays, labelled "Edge at post".
- A result note above the table: "Our top pick #5 finished 2nd. Pre-race chance for the winner #3: 24% (2nd highest)." It is neutral in tone, with no celebration or apology.
- Exotics panel shows the official exacta/trifecta payout next to our fair price for that combo.
- Photo / Inquiry / Objection: an amber flag in the header ("INQUIRY") and "Results pending". The Fin column shows the unofficial order in ink-3 italic.

**No odds yet** (tote not open, typical > 30 min before post or for international races overnight)
- Live column header reads "Live" with all cells "—". A banner: "Tote opens closer to post. Edge is shown against the morning line for now."
- Edge is computed vs ML but rendered in **ink-3 with no glyphs, washes or row tints** and a superscript "ML" (e.g. "+3.1ᴹᴸ"). No overlay highlights anywhere (Today, Track, Next up) until real tote odds exist.

**Stale odds** (odds age > 60s when MTP ≤ 10, or > 5 min otherwise)
- The data line becomes amber text: "Odds 3 min old — reconnecting". Live odds cells turn ink-3 italic. Edge glyphs turn hollow (▲ → △) and row tints are removed. The `+ Ticket` sheet requires the user to type the price taken (no prefill).

**Phone (375px): the runner table collapses to "program lines"**

The `<table>` stays in the DOM, so semantics are kept. At < 768px CSS turns each `<tr>` into a 3-line grid block (`display: grid`). Hidden header cells are exposed per cell via `data-label` pseudo-content only where needed (Fair, Edge). On phones the readable labels are part of the visible layout.

```
+-----------------------------------+
| ‹ SAR   R6 ‹ R7 › R8        4 MTP |
| Race 7 · The Forego (G2)          |
| 7f Dirt Fast · Stk · $200K · 1:42 |
| Odds 1:37:48 PM ●                 |
|-----------------------------------|
| [Program][Model][Edge][Odds]  ↕   |
|-----------------------------------|
|▌[3] Arabian Lion          5-1     |
|▌    F. Prat · B. Baffert   ML 5-1 |
|▌    ○──────●  24% · fair 3-1      |
|▌    ▲ +7.3 pts overlay    ▮▮▮▮  ⋯ |
|-----------------------------------|
| [5] Prince of Monaco      9-5     |
|     J. Rosario · Baffert   ML 2-1 |
|     ●────○    31% · fair 9-4      |
|     ▽ −4.7 pts            ▮▮▮▮  ⋯ |
|-----------------------------------|
| [4] S̶h̶i̶r̶l̶'̶s̶ ̶S̶p̶e̶i̶g̶h̶t̶     SCR      |
|-----------------------------------|
| ▸ Exotics: top combos             |
| ▸ About this prediction           |
+-----------------------------------+
| [Bet on TwinSpires ↗] [+ Ticket]  |  <- sticky action bar, 64px + safe area
+-----------------------------------+
```

- Line 1: cloth (32px) · horse 16/600 · **live odds right-aligned 20/700 num**, which is the most-glanced number.
- Line 2: jockey · trainer 12px ink-2 (trainer surname only if it would truncate). ML right-aligned 12px ink-3.
- Line 3: a mini dumbbell (full available width minus 120px, 16px tall) plus "24% · fair 3-1" in model blue.
- Line 4: the edge text **with the word** ("overlay" / "underlay" / "close to market") plus the evidence meter plus the ⋯ menu (44×44 hit area).
- Block height is about 104px, so 6–7 runners fit per screen on a 375×812 viewport. The race header **collapses on scroll** to a 44px sticky bar: `SAR R7 · 4 MTP · Odds ●`.
- Tapping a block expands the detail drawer inline. Sort chips are sticky under the collapsed header.
- The model vs market chart becomes the per-row mini dumbbells. The full chart is not repeated on phone.
- At 480–767px the same layout is used with wider gutters. At 768–1023px it becomes a table with jockey/trainer on line 2, Fair hidden (shown in the expand drawer), and the chart below.

**Race view states summary**

| State | Treatment |
|---|---|
| Loading | Header skeleton (title bar 40% width, meta 70%) plus 8 runner skeleton rows at the real row height to prevent layout shift. Cloth chips render as `--c-sheet-sunk` squares. |
| Empty (no entries yet) | "Entries for Race 9 aren't published yet." plus the race conditions if known. |
| Error (race failed to load) | Inline error panel (sec. 7.3) with [Try again] and "Back to Saratoga". |
| Model withheld | Model/Fair/Edge cells show "—". Banner: "We're not showing a model opinion for this race: too few runners have enough history (3 of 9). Odds are still live." |
| Scratched runner (official) | Row kept in program position, or moved last when sorted. Cloth gets a diagonal 2px ink slash overlay and 40% opacity on the fill only (the number stays readable). Name has a solid strikethrough. One spanning cell reads "Scratched (vet) 11:02 AM". Excluded from all charts. |
| Late scratch, model not yet rerun | Amber banner: "#4 scratched at 1:31 PM. Model update in progress. Chances shown are from before the scratch." Edge cells hollow. |
| No odds yet | See above. |
| Stale | See above. |
| Official | See above. |
| Cancelled race | Title struck through. "Race 7 was cancelled at 12:40 PM. Wagers are refunded by TwinSpires." Table hidden. |

### 4.4 Paper ticket sheet (modal)

Desktop: a right-side sheet, 420px wide. Phone: a bottom sheet at 90vh. Built on `<dialog>`, with focus trapped and returned to the trigger on close.

```
+------------------------------------------+
| Paper ticket                          ✕  |
| Saratoga R7 · 4 MTP                      |
|------------------------------------------|
| Bet   [Win][Place][Show][Exacta][Tri]    |
| Pick  [3] Arabian Lion            change |
| Stake $ [ 10.00 ]                        |
| Price taken [ 5-1 ]  (live 5-1 · 1:37 PM)|
| Note  [ optional                       ] |
|------------------------------------------|
| Model chance 24% · fair 3-1 · ▲ +7.3 pts |
| This records a paper ticket only. No     |
| money is wagered.                        |
|               [Cancel]  [Save ticket]    |
+------------------------------------------+
```
- The price is prefilled with live odds unless they are stale or missing (then required and empty). For Place/Show the price field is "Expected payout (optional)", because pools settle after the race.
- After Save: toast "Ticket saved — SAR R7 Win #3 $10 at 5-1. View tickets". The toast is `role="status"`, auto-dismisses after 6s, and pauses on hover/focus.

### 4.5 Tickets `/tickets`

```
+----------------------------------------------------------------------------------------+
| Tickets                                                     [7 days][30 days][All]     |
| Paper record — no real money.                                                          |
|==========================================================================================|
| TICKETS  STAKED    RETURNED   NET       ROI              AVG CLV            SETTLED     |
| 48       $480.00   $431.20    −$48.80   −10.2%           +4.1%              44 of 48     |
|                                         (95%: −38% to +21%)  (beat close on 29 of 44) |
|------------------------------------------------------------------------------------------|
|  CUMULATIVE NET ($)        ____/\___                                                   |
|                    ___/\__/         \__   --- 0                                        |
|  CLOSING-LINE VALUE (per ticket, pts)  ▪ ▪▫▪ ▪▪ ▫ ▪ ▪▪▫ ...                          |
|------------------------------------------------------------------------------------------|
| OPEN (4)                                                                                 |
| ┊ SAR R7  Win [3] Arabian Lion   $10 at 5-1   Close —     Pending · 4 MTP              ┊ |
| SETTLED                                                                                  |
| ┊ WO R3   Win [5] Lucky Ace      $10 at 7-2   Close 3-1   CLV +2.6   PAID $45.00       ┊ |
| ┊ MVR R5  Ex  [1]-[4]            $2           —           —          NOT IN THE MONEY  ┊ |
+----------------------------------------------------------------------------------------+
```

- **Summary strip**: num font 20/600 values with 12px caps labels. NET and ROI are signed with +/−. Negative values are ink with a "−" sign, **not red**, because losing is normal and not an error. ROI always shows its interval when n ≥ 10. Below 10: "Too few settled tickets to judge (n = 6)."
- **CLV** (closing-line value) = market chance at close − market chance at price taken, in pts. Positive means the user beat the closing price. Tooltip: "Beating the closing price is a better long-run skill signal than short-run profit."
- **Charts**: the cumulative net line is 100% wide × 160px, with a 1.5px ink line, a zero rule in `--c-rule-strong`, and no area fill. The CLV strip is a dot per ticket: filled blue square = positive, hollow orange square = negative, sized 6px.
- **Ticket rows** are drawn as **ticket stubs** (sec. 9.3), 52px tall, with a perforated left edge. On phone each is a 2-line row.
- *Empty*: "No paper tickets yet. Open a race and use + Ticket to record what you'd bet and at what price. We'll settle it when the result is official." [Go to Next up race].
- *Pending settlement > 2h after post*: "Waiting for official result" in ink-3, plus "Settle manually" in the row menu.

### 4.6 Model `/model`: How it works and track record

The page is a long-form article in the newsprint voice. It is a single column at max 720px for prose, and charts may break out to 960px.

```
How Equine Edge makes a number
------------------------------
[Plain-language 3 paragraphs: what goes in (past performances, connections,
 conditions), what comes out (a win chance per runner that sums to 100%),
 and what it is not (not a tip, not a guarantee, no inside information).]

Is a "24%" really 24%?                                        #calibration
[ Calibration chart 480x480 ] [ Reading this chart: 3 bullets ]

Did it beat the market?                                       #backtest
METRIC                 MODEL     MARKET (tote)   DIFFERENCE   RACES
Log loss (lower=better) 0.9812   0.9744          +0.0068 ▽    18,204
Brier score            0.0791    0.0786          +0.0005 ▽
Top-pick win rate      31.4%     33.0%           −1.6 pts ▽
Flat $2 on overlays    −6.8% ROI  —              (95%: −11% to −2%)
Period: Jan 2025 – Aug 2026 · TB+QH US only · Harness & Intl not yet validated

Evidence levels                                               #evidence
[ 4 meters with definitions ]

Where it is weak                                              #limits
• First-time starters, foreign shippers, ...
```

- The backtest numbers above are **placeholders**. The real table comes from the model manifest. The design requirement is that it shows the market baseline in the same table, the sample size, the date range, and breed coverage. **If the model loses to the market, the page says so in the first sentence of the section**, e.g. "Over 18,204 races the tote was slightly better calibrated than our model."
- Difference glyph: ▲ when the model is better than the market, ▽ when worse, with the same colour rules as edge.
- Per-breed tabs: All / TB / HN / QH / INTL. Unvalidated breeds show "Not enough results yet to report. The model runs, but treat it as experimental." and every race of that breed gets an "Experimental" tag in its header.

### 4.7 Settings `/settings`
A single column: Odds format (radio), Theme (System/Light/Dark), Pinned tracks (list with remove), Time zone (default from the browser, with an "Show post times in track local time" toggle), Sounds (off by default), Single-key shortcuts (on), Show underlays (on).

---

## 5. Data visualisation specs

All charts are inline SVG with `role="img"` and an `aria-label` summary. Each also has a visually hidden `<table>` alternative, or is backed by the visible runner table. Charts use `--c-*` tokens via `currentColor`/CSS variables, so the themes switch automatically. Text in charts uses the num font at 12px minimum.

### 5.1 Model vs market chart ("dumbbell")

Purpose: show for each runner where the model and the market disagree.

- **Size (desktop side column)**: width 100% of the column (min 320, typically 400px). Row pitch 28px. Height = 28 × activeRunners + 32 (axis) + 24 (legend).
- **Layout per row**: cloth chip 20×20 at x=0. Plot area from x=32 to width−8.
- **Scale**: linear 0 → `max(ceil(maxProb/0.1)*0.1, 0.3)`. Gridlines at every 10% in `--c-rule` (1px). Axis labels "0% 10% 20% 30%" at the bottom in ink-3 12px.
- **Market mark**: a hollow circle r=5, 2px stroke `--c-market`. Market chance = tote implied probability normalised to sum to 1 (takeout removed).
- **Model mark**: a filled circle r=5 in `--c-model`.
- **Connector**: a 4px-tall bar between the two marks.
  - Overlay (model > market): solid fill `--c-over`.
  - Underlay (model < market): **45° hatch** pattern (`<pattern>` 4×4, 1.5px stroke `--c-under-fill`, transparent gaps) with a 1px solid outline in `--c-under-fill`.
  - |edge| < 1.0 pt: no connector. The marks overlap (model drawn on top).
- **End label**: right of the rightmost mark, num 12px: "+7.3" in `--c-over` / "−4.7" in `--c-under`.
- **Order**: same order as the table's current sort, so the two scan together. Hovering or focusing a table row highlights its chart row (`--c-sheet-sunk` band) and the reverse.
- **No odds yet**: market marks use the ML, drawn **dashed** (stroke-dasharray 2 2), and the connector is omitted entirely. Legend text: "○ Morning line (not a market price)".
- **Legend** (always shown, never colour-only): "● Model  ○ Market   ▬ overlay  ▨ underlay".
- **Mini variant (phone)**: the same encoding in a 16px-tall row, r=4, connector 3px, no axis labels, with a 0/50% scale shared by the race and a single faint 25% tick so rows are comparable.
- `aria-label` example: "Model versus market chances. Largest overlay: number 3 Arabian Lion, model 24 percent, market 17 percent."

### 5.2 Probability bars (Track card, Next up, ticket sheet)

- Track: 64×6px, `--c-sheet-sunk` with a 1px `--c-rule-strong` outline (meets 3:1). Fill `--c-model` for the model chance.
- An optional market tick: a 2px-wide × 10px-tall `--c-market` line at the market position, overhanging the bar by 2px top and bottom.
- Always paired with the number as text. The bar is decoration, `aria-hidden="true"`.

### 5.3 Calibration chart (Model page)

- **Size**: 480×480 desktop (plot 400×400 with a 56px left / 24px bottom margin), and 100% width square on phone (min 300).
- **Axes**: x = predicted win chance (bins: 0–2, 2–5, 5–10, 10–15, 15–20, 20–30, 30–40, 40–60, 60–100%), plotted at the mean predicted value of each bin. y = observed win rate. Both run 0 → 0.6 by default, auto-extended to 1.0 if any bin exceeds 0.55. Ticks every 10% in ink-3 12px. 1px `--c-rule-strong` axes. Gridlines in `--c-rule`.
- **Perfect calibration diagonal**: 1px dashed (4 3) `--c-ink-3`, labelled "Perfectly calibrated" at the top end, rotated 45°.
- **Model points**: filled circles in `--c-model`, with area ∝ bin count (r from 3px to 9px, sqrt scale). A vertical 95% Wilson interval whisker, 1.5px, same colour, 6px caps.
- **Market baseline points**: **hollow squares** 8px, 1.5px `--c-market` stroke, offset +4px on x to avoid overlap, with their own whiskers in `--c-market`. Different shape plus fill = colour-blind safe.
- **Count strip** under the x-axis: 24px tall histogram, one bar per bin, `--c-rule-strong` fill, with the count labelled above the bar if ≥ 2% of the total.
- **Interaction**: hovering or focusing a point (each point is a `<g tabindex="0">`) shows a tooltip: "Predicted 20–30% · we said 24.6% on average · 26.1% actually won · 1,834 runners."
- **Caption** (required): "Points on the dashed line mean our chances match reality. Above the line: we were too pessimistic. Below: too optimistic. Bars show uncertainty from sample size."

### 5.4 Evidence meter

This measures how much data stands behind a runner's model number. It is not how good the bet is. The level is computed by the data team from history depth and feature coverage. The design defines 4 levels:

| Level | Name | Typical meaning (copy for tooltip) |
|---|---|---|
| 1 | Thin | "Little data: first-time starter or few comparable races. Treat the number as a rough guess." |
| 2 | Fair | "Some recent form, but gaps (e.g. new surface or distance)." |
| 3 | Solid | "Several comparable recent races and complete data." |
| 4 | Deep | "Rich, recent, comparable history and full data coverage." |

- **Graphic**: 4 vertical bars ("fence posts"), each 4px wide with a 2px gap, heights 6/8/10/12px, bottom-aligned, total 22×12px. Filled bars use `--c-ink`. Empty bars use a 1px `--c-rule-strong` outline with no fill, so the count reads even in grayscale or with no colour perception.
- Level 1 additionally renders the filled bar in `--c-ink-3` and shows a "?" superscript, so "thin" is noticeable without colour.
- `role="img"` with `aria-label="Evidence: Fair, 2 of 4"`. Tooltip on hover/focus with the copy above.
- Interaction with signals: **no overlay highlight (row tint, ▲, Next-up marker) for evidence level 1**. The edge number still shows, in ink-3 with △.

### 5.5 Edge encoding (canonical)

Edge = model win % − market win % (takeout-removed), in **percentage points ("pts")**. It is not ROI and not EV. EV appears only in the drawer, labelled "Expected return per $1 (before takeout)".

| Condition | Glyph | Sign | Text colour | Graphic | Row tint | Label (phone/SR) |
|---|---|---|---|---|---|---|
| edge ≥ +2.0 and evidence ≥ 2, fresh odds | ▲ (filled) | + | `--c-over` | solid bar | over-wash + 3px left rule | "overlay" |
| +1.0 ≤ edge < +2.0 | △ (hollow) | + | `--c-over` | solid bar | none | "slight overlay" |
| |edge| < 1.0 | ≈ | ± | `--c-ink-3` | none | none | "close to market" |
| −2.0 < edge ≤ −1.0 | ▽ (hollow) | − (true minus U+2212) | `--c-under` | hatched bar | none | "slight underlay" |
| edge ≤ −2.0 | ▼ (filled) | − | `--c-under` | hatched bar | none | "underlay" |
| any, but evidence 1, stale or ML-only | hollow form of the glyph | sign | `--c-ink-3` | none | none | "…, low confidence" |

Thresholds are constants in `src/domain/edge.ts`, so the model team can tune them. All numbers use one decimal place.

---

## 6. Live components

### 6.1 MTP countdown

- Display: the integer minutes "4" with the label "MTP". At < 1 min show "<1". When the race is at post: "AT POST". When running: "OFF". The track's own MTP from TwinSpires is preferred over client-computed time, because tracks drag post times. When they diverge by > 2 min: "Post 1:42 · running late".
- Colour: > 10 min ink-2. 5–10 min ink. ≤ 5 min `--c-live` text plus a 6px lamp dot. AT POST: `--c-live` with the lamp blinking twice (sec. 9.2).
- Seconds are **never** shown, except in the race header when < 2 min ("1:24"). This keeps updates calm.
- Ticking: one shared `setInterval` aligned to the minute boundary (or per second only when a visible race is < 2 min), paused when `document.hidden`.

### 6.2 Odds updates
- Polling or SSE every 15–30s (backend decision). On change: the digit flip (sec. 9.1). A cell's direction is shown with a 12px arrow ↑/↓ for 30s in ink-3, where ↓ = shortening, labelled "odds shortened from 7-2" in the tooltip.

---

## 7. Global states

### 7.1 Data freshness lamp (masthead, right)

| State | Visual | Text | Tooltip / popover |
|---|---|---|---|
| Live | 8px filled circle in `--c-brand` | "Live 12s" (age of newest odds tick, updated every 5s, capped display "Live") | "Odds from TwinSpires, updated 12 s ago. Entries updated 9:04 AM. Results feed OK." |
| Delayed | 8px ring (2px) in `--c-live-lamp` | "Odds 3m old" in `--c-live` | names which feed is lagging |
| Offline | 8px circle with a diagonal slash, `--c-ink-3` | "Offline" | "You're offline. Showing data from 1:31 PM. We'll refresh when you're back." |
| Source down | ring in `--c-danger` | "Source issue" | "TwinSpires odds unavailable since 1:31 PM. Entries and model still shown." |
| Replay | amber square | "Replay" | see 7.2 |

The lamp is a `button` that opens a small popover listing each feed (Entries, Odds, Scratches, Results, Model) with its last update time. It never shows file names, job IDs or commands.

### 7.2 Demo replay mode

- A **striped ribbon** 28px tall across the top of every page, above the masthead (diagonal 45° stripes `--c-replay-a`/`--c-replay-b`, 12px period, ink text):
  `REPLAY · Sunday, Sep. 14, 2026 · 13:42 replay clock · [⏸] [1×|4×|16×] [Exit replay]`
- Replay is unmistakable: the dateline reads "Replay of Sunday, Sep. 14". The Bet on TwinSpires button is disabled. Paper tickets made in replay are tagged "Replay" and kept out of real ROI by default (toggle on the Tickets page).
- MTP and odds animate from the replay clock. The aria announcements use the same throttling.

### 7.3 Errors

The inline error panel is a `--c-danger-wash` background with a 3px left border in `--c-danger`, an ink title, and ink-2 body text:
```
| Couldn't load Saratoga's card.                                   |
| TwinSpires didn't respond. Your pinned tracks are shown from     |
| 1:31 PM.                                [Try again]  [Go to Today]|
```
- Always say what failed, what is still shown, and one action. A reference ID appears only in a "Details" disclosure for bug reports ("Ref 7f3a"). There is never a stack trace or file path.
- Whole-app crash (error boundary): a full-page newsprint panel, "Something broke on this page. [Reload] [Go to Today]".

### 7.4 Empty states
Each empty state is one sentence that explains, one that suggests, and one link. There are no illustrations. Optionally a 48px line-drawn glyph from the in-house set (program, ticket, diagonal) in ink-3.

### 7.5 Toasts
They are bottom-left on desktop and above the tab bar on phone, max 2 stacked, 6s, `role="status"`. Errors that need action are never toasts. They are inline panels.

---

## 8. Accessibility requirements

Target: WCAG 2.2 AA.

### 8.1 Focus order
Skip link ("Skip to races", first focusable, visible on focus) → masthead nav → freshness lamp → page header actions → filters/sort → main table (one tab stop for the table; then ↑/↓ moves between rows via roving `tabindex`; Tab from a row goes into that row's controls: expand, ⋯ menu) → side panels (chart, exotics) → footer. Sheets and dialogs trap focus and restore it on close. The Next-up strip is one tab stop with ←/→ roving.

### 8.2 Live regions and countdowns
- The visible MTP element is `<span role="timer" aria-live="off">`, so it is never announced on tick.
- One app-level `<div aria-live="polite" class="visually-hidden" id="announcer">` is fed only on **threshold events** for the race currently open (or pinned tracks on Today), de-duplicated and rate-limited to 1 per 10s:
  - "Saratoga race 7: 5 minutes to post." (at 10, 5, 2 MTP)
  - "Saratoga race 7 is at post." / "…is off."
  - "Number 4 Shirl's Speight scratched. Model chances updated."
  - "Saratoga race 7 is official. Winner number 3 Arabian Lion."
- Odds changes are **not** announced. The current value is in the cell for screen-reader users to read on demand. A Settings toggle, "Announce big odds moves" (off by default), announces moves of ≥ 25% for the focused runner only.
- Use `aria-live="assertive"` only for an error that blocks the current action (the ticket save failed).

### 8.3 Reduced motion
Under `prefers-reduced-motion: reduce`: no digit flips (instant swap), no lamp blink, no stamp rotation-in (the stamp appears static), no sheet slide (fade 0ms), no skeleton shimmer, and no smooth scroll. The "changed" underline (a static 2px underline for 1.5s) stays, because it is not motion.

### 8.4 Table semantics
- The runner table is a real `<table>` with `<caption>` ("Race 7 runners, 8 active, sorted by program number"), `<thead>` with `<th scope="col">` and `abbr` (e.g. `<th scope="col" abbr="Morning line">ML</th>`), and the horse cell as `<th scope="row">` so screen readers announce the horse with each value.
- Sortable headers are `<button>`s inside `<th>` with `aria-sort` on the `<th>`.
- Cells carry SR-friendly text via `aria-label`, or visually hidden spans where glyphs are used: "▲ +7.3" → "overlay, plus 7.3 points". Odds "5-1" → "5 to 1". Cloth chip → "Number 3".
- A scratched row has `aria-disabled="true"` on the row's controls and "Scratched" in the row header.
- The phone grid layout is pure CSS. The DOM stays a table. Test with VoiceOver iOS, because `display: grid` on `tr` can strip table roles in Safari. Add explicit `role="row"`/`role="cell"`/`role="rowheader"` to be safe.

### 8.5 Other
- Every target is at least 24×24 CSS px (2.5.8), and 44×44 on coarse pointers.
- Never encode meaning by colour alone: edge (glyph + sign + pattern), status (text), saddle cloths (number always present), freshness (shape + text).
- Text resizes to 200% without loss: the table reflows to the phone layout at large zoom via container queries (`@container (max-width: 760px)`).
- `lang="en-US"` is set. Horse names are not translated. International track names keep diacritics.
- Times show the zone abbreviation on the race header ("1:42 PM ET") and use `<time datetime>`.

---

## 9. Five delight details (cheap)

1. **Tote-board digit flip.** When a live odds value changes, each changed character flips like a split-flap or tote panel. Each glyph is in its own `inline-block` span with `overflow: hidden`. The old glyph translates up −100% while the new one comes from +100%, over `--dur-flip`, staggered 40ms per character, `--ease-flip`. A cell flips at most once per 5s, with batched updates. Under reduced motion: an instant swap. In both cases the cell gets a 2px `--c-live-lamp` underline that fades after 1.5s, for "this just changed". About 40 lines of CSS and JS, no library.
2. **Real silks colours, done right.** Saddle-cloth chips use the true breed-specific standards (sec. 2.3). The chip has a 4px folded-corner triangle (top-right, `--c-ink` at 15% alpha) like a real cloth's number patch. When scratched, a diagonal slash. People who know racing will notice immediately. It is one component.
3. **Ticket stubs.** Paper tickets render like pari-mutuel tickets: a dotted 1px `--c-rule-strong` perforation on the left edge (CSS `radial-gradient` semicircle notches every 8px), num-font text in tight caps, and a faint serial "EE-0048" in ink-3. Pure CSS.
4. **The OFFICIAL stamp.** When a race goes official, an outlined rubber-stamp label appears in the race header and on settled tickets: "OFFICIAL", "PAID $45.00" or "NOT IN THE MONEY". It is set in the num font 13/700 with +0.12em tracking, a 2px border in `--c-ink`, rotated −4°, at 85% opacity, and scales from 1.15 to 1 in 160ms. Under reduced motion it is static. Wins and losses get the *same* stamp style: no confetti, no red. That is honest and memorable.
5. **Call to post.** At "AT POST" the MTP lamp blinks twice (two 200ms on/off pulses, then steady) and the label changes to "AT POST". If the user enabled sounds in Settings, a two-note bugle motif plays, synthesised with WebAudio, about 0.6s, and only for the race currently open. Off by default. Never under reduced motion.

Bonus (free): **a print stylesheet** (`@media print`) renders the race view as a one-page program: black on white, cloths as outlined squares with numbers, chart included, masthead dateline at the top. Horseplayers print things.

---

## 10. Microcopy and tone

**Voice**: a knowledgeable, plain-spoken clocker who respects your intelligence and your wallet. Short sentences. Numbers before adjectives. We say what we think and how sure we are.

**Never use**: lock, sure thing, banker, can't lose, free money, guaranteed, best bet, hot tip, smash, max bet, "we're due", winners streak, "you lost". No exclamation marks in data UI. No emoji.

**Preferred terms**

| Say | Not |
|---|---|
| "Model chance 24%" | "24% to win!" / "Confidence 24" |
| "Fair odds 3-1 (what a 24% chance is worth)" | "True odds" |
| "Overlay: the tote offers more than our fair price" | "Value bet!" |
| "+7.3 pts vs market" | "+7.3% edge" (ambiguous with ROI) |
| "Close to market" | "No edge" |
| "Evidence: Thin" | "Low confidence pick" |
| "Paper ticket" | "Bet" (for anything we record) |
| "Not in the money" | "Lost" |
| "Our top pick finished 4th." | "Bad beat" |

**Example strings**

- Next-up empty: "Nothing posts in the next hour on the tracks you follow. [See all tracks]"
- Overlay tooltip: "The tote implies about 17%. Our model says 24%. Overlays lose often too: a 24% horse still loses 3 races in 4."
- Fair odds tooltip: "Fair odds are the price at which a bet would break even if our chance is right, before takeout."
- Evidence thin, inline: "Little data on this runner. Treat 9% as a rough guess."
- Model withheld: "We're not showing a model opinion for this race: too few runners have enough history."
- Exotics footer: "Fair payout = base ÷ chance, before takeout. Exotic chances compound model error. Treat them as rough."
- Ticket sheet footer: "This records a paper ticket only. No money is wagered."
- Result note: "Official. #3 Arabian Lion won. We had it at 24%, second-highest in the field."
- Tickets ROI with small n: "Too few settled tickets to judge (n = 6). Results over a few dozen bets are mostly luck."
- Bet button tooltip: "Opens this race on TwinSpires in a new tab. Equine Edge doesn't place bets."
- Model page opener: "Equine Edge estimates each runner's chance to win. It is often wrong, the market is usually very good, and we show you exactly how we compare."
- Persistent footer (every page, 12px ink-3): "Model estimates, not advice. Bet only what you can afford to lose. Problem gambling help: 1-800-GAMBLER." (Confirm the helpline per jurisdiction with the PM.)
- Settings (optional, Tickets page): "Daily paper-stake reminder: show a note when tickets today exceed $___."

**Numbers formatting**: percentages are integers ≥ 10%, one decimal below 10%, "<1%" below 1%. Money is "$1,234.50" with a true minus "−$48.80". Edge always carries a sign and one decimal, plus "pts" on first mention per view. Times are "1:42 PM" in the local zone with "ET" in the race header. Odds use the user's format, with fractional as the default ("5-2", hyphen, as printed on US tote boards).

---

## 11. Implementation notes for the engineer

- CSS architecture: `tokens.css` → `base.css` (reset, typography, focus) → one CSS module per component. Use no colour literals outside `tokens.css` and `saddlecloths.ts`.
- Component list: `Masthead`, `FreshnessLamp`, `ReplayRibbon`, `NextUpStrip`, `BreedFilter`, `TrackRow`, `RaceRow`, `RaceHeader`, `MtpCountdown`, `RunnerTable` (+ `RunnerRow`, `RunnerDrawer`), `Cloth`, `EdgeValue`, `EvidenceMeter`, `ProbBar`, `DumbbellChart`, `ExoticsPanel`, `TicketSheet`, `TicketStub`, `Stamp`, `CalibrationChart`, `NetLineChart`, `ClvStrip`, `InlineError`, `EmptyState`, `Skeleton`, `Toast`, `ShortcutHelp`, `Announcer`.
- Every component must have the states listed in sec. 4 in a dev-only `/__states` gallery route for visual QA in both themes.
- Number formatting lives in one module (`format.ts`: `fmtOdds`, `fmtPct`, `fmtEdge`, `fmtMoney`, `fmtMtp`), and every test checks the true minus sign and tabular output.

---

## 12. Critic's notes: the 5 weakest points of this design

1. **The newsprint palette may read as "old" or lower-contrast than it is.** Warm off-white paper and serif datelines can feel nostalgic or low-tech to people who don't share the DRF reference, and some users perceive cream backgrounds as dim, even at 15:1. *Test:* a 5-second test and a desirability study (Microsoft reaction cards) with 6–8 horseplayers and 4 casual bettors, comparing paper `#F3EFE4` against a neutral `#FAFAF8` variant. Also measure reading speed on a 12-runner table on a laptop at 50% brightness.

2. **Blue/orange edge colours collide with saddle cloths.** Cloth #3 is blue and #7 is orange, and these sit in the same row as the edge value. Users may read a blue cloth as "overlay". *Test:* a first-click / identification task ("Which horses does the model like more than the market?") on races where #3 and #7 are underlay and overlay respectively, under normal vision and simulated deuteranopia and protanopia (e.g. with Sim Daltonism). Fallback if the error rate is > 10%: put edge glyphs in a bordered "pencil box" so they never sit next to the chip.

3. **Phone program lines are tall, so 14-horse fields mean a lot of scrolling and harder cross-runner comparison.** About 104px per runner means a full field is about 2.2 screens. *Test:* timed task on a real 375px device: "find the largest overlay" and "compare #2 and #11", against a denser 2-line variant (64px, dumbbell moved to the drawer). Track scroll distance and errors. Also test one-handed thumb reach for the ⋯ menu.

4. **"Pts edge", "fair odds" and "evidence" are new vocabulary, and users may conflate edge with expected profit.** Even with tooltips, people may read "+7.3" as "7.3% profit". *Test:* a comprehension questionnaire after a 2-minute session ("If you bet $10 on this horse 100 times, what do you expect?"). Pass bar: ≥ 70% answer within the right band. Iterate the label ("+7.3 pts chance vs market") if it fails. A/B the Edge column header "Edge" against "Model − Market".

5. **Live behaviour may be either too noisy or too quiet.** Digit flips across 12 cells every 15s near post could feel twitchy. Threshold-only announcements may leave screen-reader users unaware of late scratches on other races. The evidence meter may also be ignored entirely. *Test:* a moderated session during a real live card (or replay at 1×) with one screen-reader user (NVDA + VoiceOver iOS) and two sighted users. Log announcements per minute (target ≤ 3), ask users to recall the last odds change, and use eye-tracking or heatmaps to see whether the evidence meter is ever fixated. Lower the cost of failure by shipping the flip and announcements behind settings flags.

Also unverified: saddle-cloth colours 17–20 and the full harness set must be checked against live TwinSpires programs before launch (sec. 2.3).

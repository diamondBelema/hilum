# UI audit — Hilum

Date: 2026-10-28 · App: `http://127.0.0.1:4317` · Commit `ad7fd0b` (+ uncommitted `answer_style`) · Viewports: **1280×900** and **360×800** · Themes: **light** and **dark** · Browser: Playwright 1.62.1, Chrome for Testing 151 (`~/.cache/ms-playwright/chromium-1234`).

Method: Playwright walked every tab, opened the first note for Reader, opened Settings, loaded `/_design`, and — because the default course (`ana-201a`) has no data — re-ran Exams (`ana-202a`), Progress and Graph (`bch-203`) with content. Each shot is full-page; fixed elements (mobile header/bottom nav) therefore appear once at their viewport position. Raw measurements are in `metrics.json`.

## Screenshot index

| Screen | Base (1280/360 × light/dark) | Content / state variants |
|---|---|---|
| Design gallery | `design-1280-{light,dark}.png`, `design-360-{light,dark}.png` | — |
| Study (dashboard) | `study-…` | — |
| Live session | `live-…` | active bch-203 session, 7 activities |
| Exams (bank) | `exams-…` | `exams-ana-202a-…` (44 questions) |
| Grading | `grading-…` | empty queue |
| Notes | `notes-…` | — |
| Reader | `reader-…` | first note |
| Progress | `progress-…` | `progress-bch-203-…` (9 concepts) |
| Graph | `graph-…` | `graph-neighborhood-…`, `graph-overview-…`, `graph-drawer-…` |
| Settings | `settings-…` | theme + vault/db/version |

All 62 PNGs plus `metrics.json` live in this directory.

## Screen verdicts

### Study — good
Ranked list, not a tile grid (DESIGN §7.4): “Next up” ×3 with one primary “Study this”, due count, exams, then 28 course rows with progress text + thin bar. Clear hierarchy, no overflow at 360. The 28-row course list is long but scannable. “0 of N mastered” is text plus bar, not color-only.

### Live — good, two issues
Three-state strip, activity body, confidence/think-aloud, Ask-the-agent, Keep this, End session. Content is legible at 360 and does not overflow. Issues: activity citation chips are **28 px** high (DESIGN minimum 44), and the fixed footer/nav can sit over the last content without extra scroll padding. Cite chips are `<button>` with `px-2.5 py-1 text-xs` (`src/ui/components/ActivityRenderer.tsx:41-46`).

### Exams — good when a course is selected
Default open is `ana-201a` → “No questions yet”, even though 44 exist in `ana-202a`. After selecting the course, 44 theory questions render in one long column with verify controls; no overflow at 360. The empty state is friendly but hides the data. A default of “first course with content” (or “All courses”) would avoid a false empty impression.

### Grading — layout bug at 360
Empty state and course filter read well at 1280. At **360 px the page is 467 px wide (107 px overflow)** because the `<select>` is as wide as its longest option (451 px). The select needs `w-full max-w-full` inside a block that is already constrained (`src/ui/screens/Grading.tsx:96-102`). This is a DESIGN §12.4 failure.

### Notes / Reader — good
Course list, search, note list; reader renders headings, tables, images and citations; no overflow at 360 (measured `scrollWidth = 360`). Reader type size/leading controls and theme toggle are present. No regression found.

### Progress — good, one state bug
With bch-203 selected: “0 of 9 mastered”, count chips with mastery rings + text labels, then 9 topics with ring + state + evidence count (`progress-bch-203-*`). Looks calm and is non-color-only. Bug: **switching course flashes the previous empty state** (“No topics yet”) until the new fetch lands; after ~2.6 s the 9 concepts appear. `loading && !snapshot` is false because the old snapshot is retained (`src/ui/screens/Progress.tsx:205`); the screen needs a course-switch skeleton or a keyed loading flag.

### Graph — broken (see next section)
The M6b graph does not meet DESIGN §7.5. Edges are filled black wedges, labels overlap and clip, the fixed 720 px SVG overflows 360 px by 377 px, the footer prints source code, and the concept drawer closes on any click.

### Settings — works, incomplete
Opens from the sidebar (1280) and the mobile header icon (360), no overflow. Shows theme, server port, vault, DB, version. Missing from SPEC §4.10: **LAN toggle and MCP token**. Paths wrap mid-word but stay inside the sheet.

### Design gallery — good
Typography (13 px metadata minimum), 13 color roles, primary/secondary/ghost/destructive/disabled buttons, chips/banners, all five mastery states, progress/empty state, inputs/sheet. `/_design` is reachable in both themes at both widths. This is the strongest evidence that the token layer is coherent.

## Graph at 360 px (detailed)

Measured after selecting `bch-203` (9 nodes, neighborhood mode):

| Measurement | Value | Meaning |
|---|---|---|
| `document.documentElement.scrollWidth` | **737 px** at `innerWidth=360` | **377 px horizontal overflow**; full-page screenshot is 737 px wide. |
| `<svg>` box | **720 × 720 px** | Fixed `width={CANVAS}`/`height={CANVAS}` (`Graph.tsx:286-291`); container is `w-full` but the SVG is not. |
| Edge `<path>` computed fill | `rgb(0, 0, 0)` | Paths have no `fill="none"`; the `Q` curves paint as black wedges. `stroke-width` is 1 px, so the geometry, not the stroke, is the problem. |
| Edge class tokens | `stroke-text-muted stroke-1 stroke-dasharray="5 3"` | `stroke-dasharray="5 3"` is emitted as a class, not an SVG attribute; dashed/dotted distinctions do not render. |
| Label boxes | x = **−40 … 734**, several share y = 721 | Labels are absolutely positioned in SVG coordinates, clipped left, overflow right, and collide with nodes/each other. |
| Footer | literal `2-hop neighborhood of {rootId ? nodes.find((n) => n.id === rootId)?.title ?? "" : ""} ({neighborhoodNodes.length} topics)` | Template placeholders are inside a JS template literal, not `${…}` (`Graph.tsx:384`). |
| Root | duplicate | The real node is drawn, plus a second centered `MasteryRing` + title overlay (`Graph.tsx:368-380`). |
| Drawer | non-interactive | `div.fixed.inset-0.bg-bg.bg-opacity-40` paints over the unpositioned panel; clicking “Study this” closes the drawer and leaves the hash unchanged (`Graph.tsx:579-613`). Escape is not handled because this local `Sheet` is not the shared `<dialog>` component. |
| Overview (360) | also 737 px wide; search box overlays the canvas; labels shown | No zoom, no label hiding, no collapsed subtrees, no 300-node cap evidence; search filters rather than focuses a node. |

What DESIGN §7.5 asks for vs what is there: selected topic centered with 2 hops (present), labels always (present but unreadable), node fill = mastery (color-only), size = three exam-weight steps (present), parent solid / prerequisite dashed+arrow / related dotted / contrasts crossbar (not rendered correctly), tap to recenter (absent), legend always visible (present at page bottom), overview labels hidden until zoom (absent), cap ~300 (untested).

Recommended shape: wrap the SVG in a `viewBox` that scales to `w-full h-auto`, keep the 720-unit coordinate space, render labels in HTML or with a simple collision/ellipsis rule, cap neighborhood at 25 visible nodes with a “+N more” affordance, and use the shared dialog for the drawer. Long term, labels need a layout pass rather than `style={{ maxWidth }}` on `<text>` (SVG `<text>` ignores max-width).

## DESIGN §12 acceptance checks

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | `/_design` renders every component, both themes, 360/1280 | **PASS (manual)** | `design-*` ×4 |
| 2 | Automated contrast test, 4.5:1 text / 3:1 UI | **PASS** | `tests/contrast.test.ts`, part of 75 green tests |
| 3 | axe scan: dashboard, reader, runner, results, live, tree, no serious/critical | **FAIL** | No axe/Playwright a11y test or dependency; no scan results |
| 4 | No horizontal scroll at 360 on any screen | **FAIL** | Grading 467 px; Graph 737 px |
| 5 | All tappable elements ≥44×44 | **FAIL** | Activity cite chips 203×28 (4 on Live); automated tap check absent |
| 6 | Keyboard-only 10-question exam; reload restores; “Not saved” when API stops | **UNVERIFIED** | No automated test; `REVIEW.md` says the “not saved” path was not exercised; real DB has 0 papers/attempts |
| 7 | Fonts local, zero external requests | **PARTIAL** | Fonts served from `dist/ui/assets/*.woff2`; manual Playwright crawl saw 0 external requests; smoke does not assert it |
| 8 | Reduced-motion removes non-essential animation | **PASS (code)** | `@media (prefers-reduced-motion: reduce)` in `src/ui/styles.css:276`; no test |
| 9 | Human: phone in dark room and daylight | **UNVERIFIED** | No evidence |

Other DESIGN rules: §9 keyboard/focus — the Graph drawer has no Escape/focus trap; §10 — initial JS is 168 KB gz + 8.7 KB gz CSS (under 250 KB), Mermaid is lazy, but the Graph sheet uses `backdrop-blur-sm` (forbidden); §11 — `text-[11px]` nav labels and `text-[10px]` badges are under 13 px, and graph nodes signal mastery by fill only (color-only).

## Prioritized fixes

**Top 3:** (1) make the graph render and behave (edges, responsive SVG, drawer) — it is the M6b deliverable and is currently unusable; (2) remove the two 360 px overflows (Grading select, Graph canvas); (3) fit the 7-tab mobile nav and raise its 11 px labels to ≥13 px.

### S — same day
1. `fill="none"` on graph edges; replace class-embedded `stroke-dasharray` with real attributes; delete the literal footer; remove the duplicate root ring. (`Graph.tsx:193-197,320,368-384`)
2. Constrain the Grading select (`w-full max-w-full`) and make the graph SVG responsive. (`Grading.tsx:96-102`, `Graph.tsx:284-291`)
3. `grid-cols-6 → grid-cols-7` (or 6 + overflow) and `text-[11px] → text-xs`; match `pb` to nav height. (`App.tsx:381,390`)
4. Cite chips `min-h-11` (44 px). (`ActivityRenderer.tsx:41-46`)
5. Default Exams/Graph/Progress to the first course with content, and show a skeleton on course switch. (`Progress.tsx:205`, screen initial state)
6. Replace Graph’s local `Sheet` with `components/Sheet.tsx` so the drawer is clickable, Escape-closable and focus-trapped. (`Graph.tsx:579-613`)

### M — one session
1. Graph label layout: HTML labels or collision/ellipsis; cap the 2-hop view at ~25 nodes; overview zoom + hide labels until zoom; “focus node” search.
2. Verify the 44 questions through the UI and record who verified them; link them to concept ids.
3. Finish Settings (LAN toggle, MCP token); add a “session not ended” affordance.
4. Commit/tag M6, M6b, Z and the `answer_style` diff; add `TASKS.md`/`BLOCKERS.md`.

### L — before freeze ends
1. DESIGN 12 automation: axe on six screens, tap-target scan, no-scroll at 360 for every tab, keyboard exam + reload + “Not saved”, external-request assertion.
2. Lane A pytest suite (2-run diff, token limit, queue parity, skipped pages, timing) and re-split the 17 over-limit notes.
3. Compute `exam_weight` from past-paper marks; expose it in graph node sizing and frontier reasons.
4. Put the vault under git and schedule `scripts/copy-db.ts`; run the M4 phone mock exam and the M6b graph human checkpoint.

## Caveats

- The app defaults to `ana-201a`; the first capture pass therefore shows empty Exams/Progress/Graph. Content variants (`*-ana-202a`, `*-bch-203`, `graph-neighborhood/overview/drawer`) are the meaningful ones.
- The exam runner, results, debrief, paper builder and spotter were **not** screenshotted because the real DB has **0 papers and 0 attempts**; creating ones would have violated the read-only rule. Their coverage is code/tests only (M4/M5).
- Settings at 360 is opened via the top-right header icon, not the bottom nav; an early automation attempt picked the hidden rail button and timed out. That was a test-selector issue, not an app bug.
- Full-page mobile shots show the fixed bottom nav once at y≈690–800, which can look like it overlaps mid-page content; that is a screenshot artifact, not the live viewport.
- The live session in the vault is still open (`ended_at` NULL, no session note), so `live-*` is an in-progress session.

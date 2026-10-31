# STATUS — reconciled audit

Date: 2026-10-28 · Repo: `/home/flatplanet/learning-harness` · HEAD: `ad7fd0b` (uncommitted: `src/server/mcp.ts`, `tests/mcp.test.ts`) · Vault: `/home/flatplanet/Documents/hilum-vault` · DB: `/home/flatplanet/.local/share/hilum/app.db` (schema v7)

Scope: no code, config, vault or DB edits were made. This file and `docs/ui-audit/` are the only additions.

## Reconciliation after the graph/UI work

This audit is a historical baseline from 2026-10-28. The graph rendering,
responsive behavior, shared drawer behavior, cross-screen deep links and
interactive tap targets have since been improved in the current repository.
The old graph/mobile measurements below should not be treated as current
blockers. Remaining work is primarily regression coverage, data/process debt
and broader UX automation.

## Bottom line

The TypeScript app is real and green (`bun run verify`: 75 tests, 0 fail, smoke ok), and the core M2–M5b flows have credible test coverage. It is **not freeze-ready**:

- **Graph (M6b) is stabilized in code**: the historical rendering, overflow,
  drawer, search and deep-link findings have been addressed; stress and browser
  regression coverage remain to be added.
- **Lane A is uncommitted and untested**: `tools/` is untracked, there is no pytest suite, and the current vault has 17 notes over the 1,800-token limit while `REPORT.md` says 0 (report is stale after 2026-10-28 edits).
- **Gate discipline slipped**: M6, M6b and Z are untagged; `TASKS.md` and `BLOCKERS.md` do not exist; the 44 past questions were verified with a direct SQLite UPDATE rather than the verification UI.
- **DESIGN 12 is only partly automated**: contrast is tested, but axe, tap-target, no-horizontal-scroll, keyboard-exam/reload/offline-banner and zero-external-request checks are missing or manual.

## Evidence baseline

| Check | Result |
|---|---|
| `bun run verify` | typecheck clean; **75 pass / 0 fail / 472 expects / 11 files**; `smoke ok: ui, api, mcp` |
| Lane A `bun test` | **3 pass, 1 fail, 1 error** — `Cannot find package 'hono' from src/server/app.ts` (scaffold tests only) |
| Lane A pytest | `.venv/bin/python -m pytest` → `No module named pytest` |
| `git tag` | `m0-pass m0.5-pass m2-pass u0-pass m3-pass m4-pass m5-pass m5b-pass` — **no m1, m6, m6b or z** |
| Git state | main: 2 modified files (+64/−2); Lane A: `tools/` and `vault` untracked, `DECISIONS.md`/`PROGRESS.md` modified |
| Vault | 28 courses, 787 `.md`, 679 slide notes, 6,439 asset files, 5,852 `needs-*` flags, 1,061,090 indexed tokens |
| DB | 44 questions (44 verified, 0 concept-linked), 9 concepts (all accepted), 0 papers, 0 attempts, 1 active session, 7 activities, 35 evidence, 0 agent requests |
| UI screenshots | 62 PNGs in `docs/ui-audit/` (10 screens × 2 widths × 2 themes, plus content/drawer/overview states); `docs/ui-audit/metrics.json` |

## Milestones vs SPEC §7

`TASKS.md` and `BLOCKERS.md` are **absent** (see task cards / gate rules 3–5). Verdicts use code + tests + real-data evidence, not `PROGRESS.md` claims.

| ID | Verdict | Evidence and gaps |
|---|---|---|
| M0 | **PASS** | Hono + React + SQLite + MCP; `bun run verify` green; tagged `m0-pass`. |
| M0.5 | **PASS** | `docs/ken-mapping.md` (115 lines); tagged `m0.5-pass`. |
| U0 | **PASS** | `src/ui/tokens.css`, shared kit, `/_design`, contrast test; screenshots `design-*`; tagged with M2 (documented in `REVIEW.md:25`). |
| M1 | **FAIL (acceptance)** | All 28 courses converted; queue rows all `done`/`done-image`. But **17 slide notes exceed 1,800 est. tokens** (char len/4; max 4,147 in `courses/ana-207/slides/Gross practical report 1.md`), `REPORT.md` says `token-limit=PASS` for all 28 (stale, dated 2026-10-27; files changed 2026-10-28). No converter tests; idempotency/2-run-diff and <2 min/deck unverified. Lane A work untracked/untagged. |
| M2 | **PASS** | Vault service, FTS5, watcher, content tools, reader; suite green; tagged `m2-pass`. |
| M3 | **PASS (process gap)** | Validators + `import_past_paper` + verification UI; 44 theory questions across 3 kinds. All 44 were flipped to `verified=1` by `sqlite3` UPDATE, bypassing the UI/API and leaving no verifier audit trail. Tagged `m3-pass`. |
| M4 | **PASS (code) / UNVERIFIED (human)** | Runner, modes, autosave, grading, spotters covered by tests; tagged `m4-pass`. Real DB has **0 papers / 0 attempts**; the SPEC “take one mock exam on the phone” checkpoint is not evidenced. |
| M5 | **PASS** | Grading queue, SSE, photo answers, debrief; tagged `m5-pass`. |
| M5b | **PASS** | Sessions/ActivitySpec/live UI; real DB has 1 active bch-203 session, 7 activities, 35 evidence rows; tagged `m5b-pass`. `session_end` has not been exercised on real data (session has no `ended_at`/note). |
| M6 | **PASS (code) / PARTIAL (data)** | 9 accepted concepts, mastery/frontier/weak/due endpoints and tests. But 44 past questions have **no `concept_ids`**, so `exam_weight` is not derived from past-paper marks (weights 0.4–0.6 are hand-set). Decay produces a `decayed` state instead of SPEC §4.8 “state drops one level”. **No m6 tag.** |
| M6b | **PASS (code) / PARTIAL (coverage)** | Graph rendering, responsive behavior, shared drawer behavior and cross-screen deep links are implemented. A 300-node stress test, browser regression suite and m6b tag remain. |
| Z | **PARTIAL** | README, `copy-db.ts`, `export-pack.ts`, local fonts, 168 KB gz initial JS + 8.7 KB CSS. `copy-db` is manual, there is no schedule/cron; **no z tag**; freeze declared while M6b is broken. |

## 1. `bun run verify`

`bun run verify` = `tsc --noEmit && bun test && bun run smoke`. Output on 2026-10-28: typecheck clean, **75 pass / 0 fail / 472 expects / 11 files**, `smoke ok: ui, api, mcp`. The smoke checks health, the React shell and MCP `initialize` only; it does **not** assert zero external requests, despite README/SPEC claims.

## 2. Milestones vs `TASKS.md`

No `TASKS.md` or `BLOCKERS.md` exists in either repo (`find /home/flatplanet -maxdepth 4 -iname TASKS.md -o -iname BLOCKERS.md` → none). `PROGRESS.md` is append-only and documents M0–Z, but claims in it are not all reproducible today (M1 token-limit, M4 human phone exam, M6b graph quality). See the milestone table.

## 3. Lane A (Python intake/conversion)

| Claim | Evidence |
|---|---|
| Real corpus converted | 28 courses, 679 slide notes, 6,439 assets, root/course `INDEX.md`; `REPORT.md` 28-row table, `INTAKE_REPORT.md` 84 KB. |
| Vision pass | 1,906 queue rows: **1,781 `done` + 125 `done-image`**; 0 pending. `VISION_QUEUE.md` example (`courses/ana-202a/VISION_QUEUE.md:5`) shows rows. |
| Queue parity | `REPORT.md` totals **1,921 flagged** vs **1,906 queue rows** (15-row gap). |
| Token limit | `estimate_tokens = len(text) // 4`, `HARD_LIMIT = 1800` (`tools/harness/notes.py:11`, `tools/convert.py:23`). Current notes over limit: **17**, worst 4,147, 3,948, 2,830, 2,714. Files were modified 2026-10-28 after `REPORT.md` (2026-10-27), so the report is stale rather than proof the converter passed. |
| Tests | `tests/` contains only `app.test.ts`, `config.test.ts`, `db.test.ts`; no intake/convert tests. No pytest installed. |
| Git | `tools/` and `vault` symlink are untracked in Lane A; no `m1-pass` tag. |

Also: `_unsorted` was skipped by design (low confidence), and legacy `.ppt` files were skipped (documented in Lane A `PROGRESS.md`).

## 4. Lane B (TypeScript core)

- Schema v7 covers notes/FTS, questions, papers/items, attempts/answers, grades, evidence, sessions, activities, agent requests, concepts/edges/mastery. Deviations from SPEC §4.2: **no `courses` table** (metadata lives in `course.md`), **no `real_results` table** (`recordRealResult` writes an `evidence` row, `src/server/concepts/service.ts:706`), and `notes` stores `source`, not `source_type` + `trust` (`src/server/db.ts:18`).
- MCP exposes **38 tools**: all 37 in SPEC §4.9 plus `get_server_info`; the three reserved 3D tools are intentionally absent.
- Citation validation is real: note exists, anchor resolves, normalized quote appears; banked items require a quote (`src/server/questions/citations.ts:70`).
- DB content is thin relative to the vault: 44 questions in one course, 9 concepts in one course, 0 papers/attempts. Mastery has evidence for 9 concepts; 3 remain `unseen`.
- `exam_weight` is only read from concept frontmatter; there is no mark-share computation from past papers, and no question carries concept ids (query: `sum(length(concept_ids)>2)` = 0 for all kinds).
- `session_start` now returns `answer_style` (+ test); this is part of the uncommitted diff.

## 5. Lane C (UI)

Screens exist: Study, Live, Exams (bank + papers), Grading, Notes, Reader, Progress, Graph, Settings, `/_design`. Tabs: `study, live, exams, grading, notes, progress, graph`.

**Works well (screenshots):** Study ranked frontier/due/exams/courses list (`study-*`), Live three-state strip and ActivitySpec rendering (`live-*`), Notes list/reader, Grading empty state, Progress mastery rings + text states (`progress-bch-203-*`), Settings sheet, Design gallery.

**Bugs / gaps** are listed below and in `docs/ui-audit/REPORT.md` with file references and measurements.

## 6. Historical known bugs

The graph, mobile overflow and tap-target entries in this section describe the
2026-10-28 baseline. They are retained for audit traceability; current status
is summarized in the reconciliation section above.

| Sev | Bug | Evidence |
|---|---|---|
| P0 | Graph concept drawer is non-interactive: backdrop (`fixed inset-0`) paints over the unpositioned panel, so clicking “Study this” only closes the drawer; Escape is not handled in the local `Sheet`. | `src/ui/screens/Graph.tsx:579-613`; Playwright: click “Study this” → drawer count 0, hash unchanged. |
| P0 | Graph edges render as black filled wedges: `<path>` has no `fill="none"`, and the edge classes contain literal `stroke-dasharray="5 3"` tokens (computed fill `rgb(0,0,0)`). | `src/ui/screens/Graph.tsx:193-197,320`; screenshots `graph-neighborhood-*`. |
| P1 | Graph 360 px horizontal overflow **377 px** (720 px SVG in a `w-full` panel); labels overlap/clip (text boxes span x=-40…734). | `Graph.tsx:284-291`; `metrics`/Playwright: `scrollWidth=737` at `vw=360`. |
| P1 | Graph footer prints the template source literally: `2-hop neighborhood of {rootId ? … } ({neighborhoodNodes.length} topics)`. | `Graph.tsx:384`; screenshots. |
| P1 | Grading 360 px horizontal overflow **107 px**: the course `<select>` is intrinsically as wide as its longest option (451 px). | `src/ui/screens/Grading.tsx:96-102`; `scrollWidth=467` at `vw=360`. |
| P1 | Bottom nav has **7 tabs in `grid-cols-6`**, so Graph wraps to a second row; labels are `text-[11px]` (DESIGN minimum 13 px), and `pb-24` (96 px) is shorter than the resulting bar (~112 px). | `src/ui/App.tsx:381,390`; screenshots show Graph on row 2. |
| P2 | Activity citation chips are **28 px** tall (4 on the live screen), below the 44 px tap-target rule. | `src/ui/components/ActivityRenderer.tsx:41-46`; `metrics.json` live `smallCount=5`. |
| P2 | Graph shows a duplicate root: the real root node plus a centered `MasteryRing` overlay with the same title. | `Graph.tsx:368-380`; screenshot. |
| P2 | Default course is `courses[0]` (`ana-201a`), which has no questions/concepts; Exams, Graph and Progress therefore open on empty states while data exists in `ana-202a`/`bch-203`. | screenshots `exams-360`, `graph-360`, `progress-360` vs `*-ana-202a`/`*-bch-203`. |
| P2 | Stale empty-state flash when switching course: prior snapshot (`total=0`) renders “No topics yet” while the new fetch is in flight; after ~2.6 s the 9 bch-203 concepts appear. | Playwright at 0.9 s vs 2.6 s; `Progress.tsx:205`. |
| P2 | Settings omits SPEC §4.10’s LAN toggle and MCP token; it only shows theme and read-only vault/DB/version. | `settings-360-*`; `src/ui/screens/Settings.tsx`. |
| P2 | Graph overview has no zoom/collapsed subtrees, labels are always shown (not “hidden until zoomed”), search filters instead of focusing a node, and there is no node-cap evidence at 300 nodes. | `Graph.tsx`; DESIGN §7.5. |
| P2 | Graph sheet uses `backdrop-blur-sm`, against DESIGN §10 “no backdrop-filter”. | `Graph.tsx:596`. |

## 7. Deviations from SPEC / DESIGN

1. **No `courses` table / no `real_results` table**; `notes.source` instead of `source_type` + `trust` (SPEC §4.2).
2. **Milestone gates**: no tags for M6/M6b/Z; Lane A has no `m1` tag and its `tools/` is uncommitted.
3. **`TASKS.md`/`BLOCKERS.md` missing** (SPEC §7 gate rules 3–5).
4. **Verification bypass**: 44 questions verified with `UPDATE questions SET verified=1` rather than `verify_question`/UI.
5. **M1 acceptance**: 17 notes over 1,800 tokens; `REPORT.md` stale; queue parity off by 15; no tests/idempotency evidence.
6. **M6b exam-weight tagging not delivered**: no question→concept links; weights are manual, not past-paper mark shares (SPEC §4.8).
7. **Decay semantics**: `decayed` state vs “drops one level” (minor, but it changes dashboard/frontier wording).
8. **DESIGN §12**: only contrast is automated; axe, tap, no-scroll, keyboard-exam/reload/offline-banner and external-request assertions are missing or manual.
9. **Vault not under git** (`git -C ~/Documents/hilum-vault rev-parse` → not a repo), despite SPEC §4.12.
10. **Settings** lacks LAN/MCP-token controls (SPEC §4.10).

## 8. Risks

| Risk | Evidence | Impact |
|---|---|---|
| Unbacked state | `~/.local/share/hilum/app.db` (11 MB + 9 MB WAL) holds 35 evidence rows, 7 activities, 1 session; `scripts/copy-db.ts` exists but no cron/timer and `state/backups/` is absent. | Irrecoverable study history. |
| Direct DB verification | 44 questions flipped by SQL; no grader/verifier identity or timestamp in the row. | Wrong questions enter papers; audit trail lost. |
| Conversion drift | REPORT is stale; 17 notes over the hard limit; no tests enforce the limit on re-runs. | Context overruns and citation/read failures. |
| Lane A uncommitted | `tools/` untracked; no m1 tag. | A clean checkout cannot reproduce the vault. |
| Graph quality | P0/P1 bugs above; M6b was the graph milestone. | The teacher’s map and “Study this” from a node are unusable. |
| Untested human checkpoints | 0 papers/attempts; M4 phone exam and M6b graph human check not evidenced. | Code-green ≠ workflow-correct. |
| No automated UX gates | No axe/tap/scroll/keyboard tests; both 360 overflow bugs would have been caught. | Regressions ship silently. |
| Disk pressure | `/home` 218 G/237 G used (93%, 17 G free); DB WAL grows. | Write failures/corruption risk. |
| Stale session | bch-203 session never ended (`ended_at` NULL, no session note). | Live screen reopens an old session; no summary note. |
| External claims not asserted | README says zero external requests; smoke does not assert it (manual crawl found 0). | Regressions could add CDN calls unnoticed. |

## 10 next tasks

| # | P | Task | Why / evidence | Effort |
|---|---|---|---|---|
| 1 | DONE | Stabilize Graph rendering, responsive behavior, drawer interaction and deep links. | Implemented in `Graph.tsx`, `GraphCanvas.tsx`, `Sheet.tsx` and shared router helpers. | M |
| 2 | IN PROGRESS | Add automated 360px no-horizontal-scroll and graph stress coverage across supported screens. | `scripts/check-ui.ts` now checks 360px overflow on Home, Session, Library, Graph, Questions and Settings; `tests/concepts.test.ts` now covers a 300-node graph payload. Running the Bun/browser gate remains. | M |
| 3 | OBSOLETE | Mobile bottom-navigation fix. | Current shell uses a responsive mobile drawer; old measurements are historical. | — |
| 4 | IN PROGRESS | Raise interactive controls to 44px; add automated tap-target checks. | Current controls were raised and `scripts/check-ui.ts` now reports visible targets below 44px; execution requires Bun/browser dependencies. | S |
| 5 | P1 | Address the 17 over-limit notes (re-split or document an exception), regenerate `REPORT.md` and `VISION_QUEUE.md`, and reconcile 1,921 vs 1,906. | M1 acceptance + stale report. | M |
| 6 | P1 | Add Lane A pytest coverage: 2-run diff/stable anchors, token limit, queue parity, no dropped pages, 100-slide timing; fix Lane A `bun test` (`hono`). | No pytest; 3 pass/1 fail. | M |
| 7 | P1 | Link the 44 past questions to concept ids and compute `exam_weight` from past-paper marks; verify through the UI (or record verifier) instead of SQL. | 0 concept links; manual weights; SQL bypass. | M |
| 8 | P1 | Commit/tag M6, M6b, Z; add `TASKS.md`/`BLOCKERS.md`; commit the `answer_style` diff. | Tags/state above. | S |
| 9 | P2 | Default to the first course with content (or offer “All courses”), show a skeleton during course switches, and end the stale bch-203 session with a summary note. | Empty-state screenshots; NULL `ended_at`. | S |
| 10 | P2 | Finish SPEC settings (LAN toggle, MCP token), schedule `copy-db`, put the vault under git, and add DESIGN 12 automation (axe, tap, no-scroll, keyboard exam/reload/“Not saved”, external-request assertion). | Settings screenshot; no cron/git/axe. | L |

## Commands used

```bash
bun run verify
(cd ../learning-harness-lane-a && bun test)
(cd ../learning-harness-lane-a && .venv/bin/python -m pytest --version)
git status --short && git log --oneline -15 && git tag --list
sqlite3 -readonly ~/.local/share/hilum/app.db "…counts…"
node /tmp/opencode/shoot.cjs / shoot3.cjs / shoot4.cjs / prog2.cjs / settings.cjs
node /tmp/opencode/graphm.cjs   # computed SVG fill/overflow/scrollWidth
```

Screenshots and UI findings: `docs/ui-audit/REPORT.md` + `docs/ui-audit/*.png` + `docs/ui-audit/metrics.json`.

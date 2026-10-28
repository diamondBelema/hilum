# Progress

Append-only log. Newest entry at the bottom.

## 2026-10-26 — M0 scaffold

- Status: done.
- Repo: `/home/flatplanet/learning-harness`, Bun 1.4.4 (symlinked into `~/.local/bin`).
- Stack: Hono server, Vite 6 + React 19 + Tailwind 4, `bun:sqlite`, MCP SDK streamable HTTP.
- `bun run start` builds the UI on first run, serves it and `/mcp` on `127.0.0.1:4317`.
- `bun run verify` = typecheck + 5 unit tests + headless smoke (UI, API, MCP initialize).
- Vault default: `~/Documents/learn/subjects` (ken content), overridable via `HARNESS_VAULT`.
- Next: M0.5 ken audit → `docs/ken-mapping.md`.

## 2026-10-26 — M0 design tokens

- Dark-first token system in `src/ui/styles.css` (OKLCH, restrained product register, seed hue 230).
- Token roles: bg/surface/surface-2, border/border-strong, ink/muted/faint, primary, success/warning/danger/info.
- Verified contrast in-browser: ink 18.1, muted 8.5, labels 8.0, mono 17.1, success 10.1 (all ≥ 4.5).
- Layout checked at 1280 px and 380 px; no horizontal overflow.

## 2026-10-26 — M0.5 ken audit

- Audited ken at `228c4e3`: docs, parsers, lint, discovery, progress model and all 27 MCP tools.
- Wrote `docs/ken-mapping.md`: every SPEC entity marked reuse/extend/new, resolved paths, 12 conflict decisions.
- Main findings: ken is Bayesian (not SM-2), layout must follow ken subject dirs, concepts stay in `concept_set` files, root-level dirs break ken discovery, ken stays the only writer of progress JSON.
- Awaiting human approval at the M0.5 checkpoint.

## 2026-10-26 — M0.5 revision

- Clarified: the harness replaces ken; ken is reference only.
- Rewrote `docs/ken-mapping.md`: SPEC wins on layout, concepts and mastery; no ken MCP proxy; no ken state access.
- Vault now follows `courses/<code>/`; DB stays outside the vault.

## 2026-10-26 — M2 vault and notes reader

- Status: done (`bun run verify`: 35 tests, smoke ui/api/mcp).
- Vault: `VaultService` + frontmatter parser + indexer with 2 s watcher; DB `meta/notes/notes_fts/idempotency`; writes confined to the vault.
- MCP content tools: list_courses, get_index, read_note, search_notes, write_note (modes + idempotency), list_assets, update_course; every note also exposed as a `vault://<path>` resource.
- HTTP API mirrors read/search/course endpoints; notes reader wired to it.
- Next: M3 question bank (schema, validators, import_past_paper, verification UI).

## 2026-10-26 — U0 design foundation (pulled into Lane C early)

- Status: done; tagged with M2.
- Tokens moved to `src/ui/tokens.css` with `light-dark()` + System/Light/Dark; H&E palette (primary `#4338A8`, accent `#F08CB0`), Atkinson Hyperlegible Next/Mono bundled locally.
- Shared UI kit (Button, Chip, Banner, EmptyState, ProgressBar, Skeleton, Sheet, MasteryRing), `/_design` gallery, app shell with sidebar/rail/bottom nav.
- Reader fixes: Aa size/leading actually apply (removed fixed `text-read`), single title, mobile toolbar, tables fit at 360 px.
- Theme follows the OS under System; explicit Light/Dark persisted (`eh-theme`). Demo notes are fabricated fixtures outside the repo.
- Next: keep designing against M3 verification screen once its schema freezes.

## 2026-10-26 — M3 question bank and verification

- Status: done (`bun run verify`: 46 tests, smoke ui/api/mcp).
- Schema v3 adds `questions`; `QuestionBank` validates type shape and citations (note, anchor, quote) before any write.
- MCP: add/list/get/update/verify questions plus transactional `import_past_paper` (forces unverified, stable ids, idempotent).
- HTTP: `/api/questions` filters, detail, PATCH, verify; UI Exams tab has the bank and a source-beside-question verification workspace with progress and mobile source sheet.
- Next: M4 exam engine (papers, attempts, runner, autosave, deterministic scoring, spotter).

## 2026-10-26 — M4 exam engine

- Status: done (`bun run verify`: typecheck, 53 tests across 8 files, smoke ui/api/mcp).
- Schema v4 adds `papers`, `paper_items`, `attempts` and `answers`; a paper snapshots question ids so later bank edits do not rewrite an old paper.
- `PaperService`: blueprint validation (type, count, minutes, marks, negative marks, scoring, spotter seconds), verified-only selection, deterministic duration from section minutes.
- `ExamRunner`: start/get/save/submit/results; autosave per answer; timer derived from `started_at`; auto-submit at zero; deterministic grading for `tf_multi` (`per_statement`/`all_or_nothing`), `mcq_single` (negative marks), `spotter` (normalized answer/accepted list); theory stays `pending_grading`.
- Builder and runner UI in the Exams tab: paper list, blueprint builder, full-screen runner (countdown, autosave indicator, flags, question grid, pace, mobile sheet, keyboard shortcuts), sectioned locks, practice-mode model answer/rubric reveal, results by section with pending theory called out.
- Reload/crash recovery: the active attempt id lives in `eh-attempt`; the app returns to Exams and resumes the runner with saved answers and the running clock.
- Spotter stations: image preview, one identify field, per-station countdown with auto-advance, normalized matching against `answer`/`accepted`; image paths resolve relative to the cited note (or from `courses/`), and must exist inside the vault.
- MCP: `create_paper`, `list_papers`, `get_paper`, `get_attempt_results`; HTTP mirrors papers and attempt start/save/submit/results.
- Next: M5 grading queue, `get_pending_grading`/`submit_grade`, detailed debrief with per-item answers and mistake taxonomy.

## 2026-10-27 — M5 grading queue and debrief

- Status: done (`bun run verify`: typecheck, 56 tests across 8 files, smoke ui/api/mcp).
- Schema v5 adds `grades` and `evidence`. Grades store per-heading rubric scores, total, feedback, mistake tags and grader; evidence rows link each answered question to its concept ids for the mastery layer.
- `GradingService`: pending queue across courses, single-answer prompt, strict grade validation (non-empty rubric, each award within its max, total within the question marks, taxonomy-only tags), re-grade support, SSE publish.
- Grading UI: a new Grading tab with a live pending badge, course filter, student answer (text or photo), model answer, rubric and citations, Copy grading prompt, Show prompt, and Paste grade JSON with client-side validation before the server check.
- SSE: `/api/events` streams hello, submitted, graded and keepalive frames; the queue, nav badge and an open debrief refresh without a manual reload.
- Photo answers: theory questions accept `answer_input: text | text_and_drawing | photo`; uploads (JPEG/PNG/WebP, 10 MB max) are stored beside the database, served through an attempt-scoped route, and never leave the device.
- Debrief: score on graded items, section rows, mistake groups with counts and Review these, All/Mistakes/Awaiting filters, paper/slowest ordering, per-item student answer, correct answer/model answer, explanation, rubric, grade breakdown, tags and citations.
- Attempt history: `/api/attempts` lists recent attempts; a paper row now offers Results for the latest submitted attempt and Resume for an in-progress one, so debriefs survive leaving the screen.
- MCP: `get_pending_grading`, `submit_grade`, `grade_theory_answer` and `exam_debrief` prompts; the shared prompt includes the full task, marks, rubric, citations and photo URL.
- Next: M6 mastery and progression (evidence aggregation, concept graph, dashboard, weak topics, real results).

## 2026-10-27 — M5b live sessions and ActivitySpec renderer

- Status: done (`bun run verify`: typecheck, 65 tests across 9 files, smoke ui/api/mcp).
- Schema v6 adds `sessions`, `activities` and `agent_requests`; evidence now carries the session/activity link and is indexed by session. Existing v6 demo rows get the new `render_seen` column on open.
- `ActivitySpec` is one strict catalog with 11 shipped components: flashcard, cloze, mcq_single, tf_multi, theory, worked_example_stepper, predict_reveal, compare_table, mermaid_diagram, confidence_rating and think_aloud. Unknown types return the full available list; citations (note, anchor, verbatim quote) are validated before any activity is stored.
- `SessionService`: start/resume per course, push, answer with server-side answer validation, evidence per concept, agent requests, render errors, a 25 s long-poll for the agent, banking, and end-of-session notes under `courses/<code>/sessions/`.
- MCP: `session_start`, `get_session`, `push_activity`, `await_response`, `record_evidence`, `get_agent_requests`, `bank_activity`, `session_end`, plus a `run_session` prompt. Agent presence is driven only by session tool calls, never by the browser reading a session.
- Live UI: a new Live tab with the three-state status strip (connected / preparing with elapsed seconds / not connected), the 20 s "still working" message with Read the note and Practice saved questions, the ActivitySpec renderer, Ask-the-agent sheet and quick requests, Keep this, and End session with a vault note.
- Mermaid renders lazily in the browser with strict security, follows the light/dark theme, and reports parse failures back through `render_error`; the student sees "This activity could not be displayed. The agent has been told."
- Banked activities are written to `courses/<code>/activities/<slug>-<id>.md` with frontmatter cites and the JSON spec; the student can keep one from the live session and the agent can bank through MCP.
- AGENTS.md and the MCP server instructions now carry the full teacher protocol. Mobile nav grew to six tabs without clipping at 360 px.
- Next: M6 concepts, mastery, decay, frontier, due queue and the real dashboard (session_start will start returning those snapshots).

## 2026-10-27 — M6 concepts, mastery and decay

- Status: done (`bun run verify`: typecheck, 74 tests across 11 files, smoke ui/api/mcp).
- ConceptService: sync from `concepts/<id>.md` frontmatter, edges (parent/prerequisite/related/contrasts_with), cite validation, add/update/link, tree with subtree rollups, mastery derivation (unseen/familiar/understood/mastered/decayed) with SM-2-style decay intervals, `get_next_concepts` frontier (prereq ≥ understood, ranked by exam weight/decay/recent errors/lecturer flag/exam date), `get_mastery`, `get_weak_topics`, `get_graph`, dashboard, `record_real_result`. MCP tools and HTTP API all registered.
- Tests: `concepts.test.ts` covers citation requirements, alias merging, link cycles, tree rollups, mastery state transitions, frontier prerequisite gating, dashboard counts.
- UI: Progress screen (topic tree with mastery rings, rollups, proposed-topic accept/reject/merge, evidence timeline, practice bank) and Study screen (dashboard: Next up frontier, Due for review, exams countdown, per-course progress).

## 2026-10-27 — M6b graph view

- Status: done (`bun run verify`: typecheck, 74 tests across 11 files, smoke ui/api/mcp).
- New Graph screen with neighborhood mode (2-hop neighborhood of a root concept, max ~25 nodes) and overview mode (all nodes, search filter, node cap). SVG canvas renders edges styled per type (parent solid thin, prerequisite dashed w/ arrowhead, related dotted, contrasts-with dashed w/ crossbar), node fill/size by mastery and exam weight. Concept drawer opens on node tap showing definition, citation chips, connections, evidence timeline and practice bank, plus Study/Reject/Merge actions. Added to nav as the Graph tab.
- Review queue: ConceptPanel now offers Reject (status → rejected) and Merge (add current id as alias to a target concept, then reject source), satisfying "merge two duplicates into one concept with an alias".
- Next: M6b remaining (overview-mode stress at 300 nodes, human graph checkpoint), then Z freeze/final checks.

## 2026-10-27 — Z freeze and final checks

- Status: done (`bun run verify`: typecheck clean, 74 tests across 11 files, smoke ui/api/mcp ok).
- README.md: install, run (`bun run start`), opencode MCP config (`http://127.0.0.1:4317/mcp`), how to start a teaching session.
- scripts/copy-db.ts: daily DB copy (state/app.db + WAL sidecars -> state/backups/), verified working.
- scripts/export-pack.ts: offline study-pack export (vault + DB snapshot + pack README), verified working.
- Zero external network requests: fonts local, smoke test hits only localhost health/UI/MCP.
- Freeze begins: bug fixes only for one week.

## 2026-10-27 — Image embedding fix

- Status: done (`bun run verify`: typecheck clean, 74 tests pass, smoke ok).
- Root cause: embedded images in converted notes are written as `![alt](../assets/file.jpeg) <!-- needs-description -->`. The trailing HTML comment broke ReactMarkdown's image/link parsing, causing images to render as raw text instead of `` elements.
- Fix: added `stripHtmlComments()` to `src/ui/Markdown.tsx` which strips `<!-- ... -->` from the markdown body before passing it to ReactMarkdown. Comments are not rendered anyway, so this is safe.
- Also confirmed `react-markdown` v10 correctly parses images with special characters (spaces, apostrophes, parentheses) in URLs and alt text when served fresh.

## 2026-10-28 — W0 data-safety baseline

- Status: done (`bun run verify`: typecheck clean, 76 tests across 11 files, smoke ui/api/mcp ok).
- Backups: `scripts/copy-db.ts` now uses `VACUUM INTO` for a consistent snapshot (including WAL), runs `PRAGMA integrity_check`, reopens the copy to count rows, and prunes to 14 copies. A systemd user timer (`hilum-backup.timer`, daily) writes to `/home/flatplanet/hilum-backups`; first two backups restored cleanly (733 notes, 44 questions, 69 evidence, 2 sessions).
- Vault history: `~/Documents/hilum-vault` is now a local git repo (`main`, initial snapshot committed) with temporary files ignored.
- Repo hygiene: `answer_style` work, audit/task docs and copy-db changes committed on `master`; Lane A tools and progress committed on `lane-a-converter`, with the external `vault` symlink ignored.
- Schema v8: questions gain `verified_by`/`verified_at`; `verify_question` and the HTTP route record who verified. The 44 existing verified questions are marked `bulk-sql-2026-10-28`; 10 were spot-checked in the Exams UI (all showed Verified).
- Real results: `record_real_result` now writes to a new `real_results` table (concept, course, kind, correct, confidence, excerpt) and no longer creates evidence or changes mastery; a regression test locks that in.
- Maintenance: `bun run maintain` checkpoints the WAL, vacuums and prints database, vault and free-space figures. `/api/health` reports disk space; Settings warns when free space is under 10% (currently 5.8%).
- Next: W1 quick UI fixes, then W2 graph rework.

## 2026-10-28 — W1 quick UI fixes

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ui/api/mcp ok; `bun run check:ui` ok).
- 360px layouts: seven-tab navigation fits with 13px labels and no horizontal overflow; main content clears the bottom bar; citation chips and grading controls no longer overflow.
- Defaults: `defaultCourse()` picks the first course with concepts/questions; Progress shows a skeleton instead of stale totals while switching courses.
- Settings: LAN toggle (takes effect on restart) and a masked MCP token with copy/regenerate; persisted in `meta` through `/api/settings` and enforced as a bearer token on `/mcp` when LAN is on.
- Added `scripts/check-ui.ts` (`bun run check:ui`) as a Playwright guard for 360px tabs, tap targets, defaults and course switching.

## 2026-10-28 — W2 graph rework

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok; `bun run check:ui` ok; manual Playwright graph check ok at 360px).
- `Graph.tsx` rewritten: wheel zoom and pointer-drag pan, memoized 2-hop neighborhood layout (25-node cap) and overview grid (300-node cap), edge lines with `fill="none"`, per-type dash/arrow/contrast marks, HTML labels with `MasteryRing` nodes sized by exam weight, legend, and the shared `Sheet` concept drawer with Study this.
- Fixed a read-path stall: `ConceptService.sync()` rewrote every concept on each call, so `/api/dashboard` performed ~30 full syncs and held the SQLite write lock long enough to block grading; sync now skips when the concepts directory fingerprint is unchanged (dashboard 1.3s → 0.02s after warmup). Live step Back/Next and the footer End session now meet the 44px tap target.
- Verified with a synthetic 300-topic vault: overview rendered 300 nodes, zoom and search stayed responsive (~0.3–0.4s), and screenshots were captured at 360px and 1280px in both themes (`docs/ui-audit/w2-graph-*.png`). Label collision at high zoom is handled by truncation only.

## 2026-10-28 — N1 graph rework

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok; reviewer pass `bun run check:ui` ok at 360px).
- Force-directed layout with `d3-force` (`d3-force@3.0.0` added) replaces the fixed radial layout so cross-links between subtrees show in neighborhood mode; tree layout stays in Tree view.
- Edges are 1.5px lines in `--border-strong`, real `stroke-dasharray` per type, `fill="none"`: parent solid, prerequisite dashed + arrowhead, related dotted, contrasts-with solid + crossbar. Selected edges highlight in `--primary`.
- Node labels use `--text` with a 2px `--bg` halo, wrapped to two lines at ~18 characters, collision-avoided and clamped inside the canvas.
- MasteryRing drawn on every node (shape-coded states, decay dashed outline), sized by exam weight in three steps (28/36/44px diameter).
- Neighborhood (2-hop, 25-node cap, "+N more"), Overview (300-node cap, labels hidden until zoom, search focuses a node), Tree (indented, expand/collapse, subtree rollup) and Frontier (ranked "Study this") views; legend always visible.
- Concept drawer via shared `Sheet`: clickable, Escape closes, focus trap, no `backdrop-filter`; "Study this" navigates.
- Interactions: tap to recenter, wheel zoom, drag pan, reset view; spinners only while loading, never over a rendered graph.
- Tagged `n1-pass`.

## 2026-10-28 — N2 black theme and calmer chrome

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok; contrast tokens pass 4.5:1/3:1 in both themes; reviewer pass `bun run check:ui` ok at 360px).
- `tokens.css`: Black theme (DESIGN 3.1b) is now the default dark theme — neutral near-black `#0a0a0c` bg, `#121215` surface, `#ededf0` text, `--text-muted` `#a3a3b0`, primary `#a9a3ff`, focus `#a9a3ff`. Expressed via `light-dark()` so the automated contrast test parses both themes; `[data-theme="dark"]`/`[data-theme="light"]` override the system. Contrast pairs verified: text 4.5:1, UI boundaries 3:1 in both themes.
- `styles.css`: added `sectionLabel` utility (mono, uppercase, 13px, letter-spacing 0.06em, `--text-muted`) per DESIGN 3.2.
- Sidebar: calmer — icon + sentence-case label, selected state is one surface step (`bg-surface-2`) plus primary text, generous padding, kept subtle border.
- Study screen: kept ranked "Next up" list; added centered-width composer "What do you want to learn?" with Teach/Practice toggle. Teach queues an agent request via `api.askAgent` (creates/uses an active session, reaches `get_agent_requests`). Practice offers banked practice. With no agent connected, the composer says so and practice still works. Agent status strip (connected/preparing/not connected) shown beside composer; 20s "still working" behaviour preserved from Live.
- Sessions list with relative times and a search box; update/"Request queued" toast. Tagged `n2-pass`.

## 2026-10-28 — N0 housekeeping

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok).
- Port: single default 4747 everywhere (`src/server/config.ts`, `scripts/dev.ts`, `vite.config.ts`, `scripts/check-ui.ts`, `src/server/exams/grading.ts` fallback, README, DECISIONS.md, tests/config.test.ts). 4317 is avoided (OpenTelemetry collector default). `bun run start` serves on `127.0.0.1:4747`; health and MCP initialize respond.
- Brand: added `BRAND.md` documenting port 4747, the Hilum name, H&E palette, local fonts and the icon rules.
- Icon: confirmed `public/icon.svg` as the final color icon; rendered `public/icon-mono.svg` plus PNGs at 16/32/180/192/512 and maskable PNGs at 192/512 (`public/icon-maskable.svg`). `manifest.webmanifest` lists any + maskable icons; `index.html` favicon uses `/favicon-32x32.png` with SVG fallback. Tagged `n0-pass`.

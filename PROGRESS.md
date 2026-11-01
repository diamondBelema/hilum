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

## 2026-10-28 — N3 in-app note editor

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok; reviewer pass `bun run check:ui` ok at 360px).
- Spike decision recorded in `DECISIONS.md`: CodeMirror 6 source editor with side-by-side react-markdown live preview (desktop), chosen over Milkdown/TipTap for round-trip fidelity (frontmatter untouched, `{#anchors}`, wikilinks, tables, mermaid fences, images preserved), lazy load only on the editor screen, offline with zero network requests, reliable mobile typing.
- `Editor.tsx`: source/preview toggle, toolbar (image), "Saved / Not saved" states with debounced autosave (1.5s) through `api.writeNote` → VaultService `writeNote` (mode replace), frontmatter held in a Details panel (title, course, topics, source type) never shown as YAML; student notes default `source_type: student_notes, trust: medium`; manual Save button; external-change banner skeleton (Reload/Keep mine/See changes) wired but no live watcher yet; keyboard-operable; works at 360px.
- Server: added `POST /api/note` (writeNote replace) and `POST /api/asset` (writeAsset into `<course>/assets/`); `api.writeNote`/`api.writeAsset` client helpers.
- Tagged `n3-pass`.

## 2026-10-28 — N0 housekeeping

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok).
- Port: single default 4747 everywhere (`src/server/config.ts`, `scripts/dev.ts`, `vite.config.ts`, `scripts/check-ui.ts`, `src/server/exams/grading.ts` fallback, README, DECISIONS.md, tests/config.test.ts). 4317 is avoided (OpenTelemetry collector default). `bun run start` serves on `127.0.0.1:4747`; health and MCP initialize respond.
- Brand: added `BRAND.md` documenting port 4747, the Hilum name, H&E palette, local fonts and the icon rules.
- Icon: confirmed `public/icon.svg` as the final color icon; rendered `public/icon-mono.svg` plus PNGs at 16/32/180/192/512 and maskable PNGs at 192/512 (`public/icon-maskable.svg`). `manifest.webmanifest` lists any + maskable icons; `index.html` favicon uses `/favicon-32x32.png` with SVG fallback. Tagged `n0-pass`.

## 2026-10-28 — N4 config editors in the app

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok; reviewer pass `bun run check:ui` ok at 360px).
- Server: added `PATCH /api/course/:code` (course settings: title, department, exam_date, exam_blueprint), `PATCH /api/course/:code/answer-style`, `PATCH /api/rubrics/:name`, `PATCH /api/course/:code/mastery`, plus `GET /api/course/:code/history` and `POST /api/course/:code/restore`. All write through VaultService with request-id idempotency, keep the last 20 versions in `.history/`, and support restore. `updateCourse` also records history.
- UI: `Config.tsx` sheet (opened from Settings via a course picker) with four tabs — Course settings (title, department, exam date, exam blueprint table of type/count/minutes/marks each, default exam mode), Answer style, Rubric, Mastery thresholds. Inline validation errors, "Saved / Not saved" states, history restore, "Edit raw" escape hatch via the textareas. Config writes the real files (`course.md`, `answer-style.md`, `rubrics/<name>.md`, `mastery.md`) so the exam builder and grader pick up new values; grades keep a snapshot of the rubric used so past grades are unchanged after a rubric edit.
- Also fixed: note now stays open when switching tabs (was cleared on every tab switch).
- Tagged `n4-pass`.

## 2026-10-28 — Catalog components (unstarned, post-freeze stretch per SPEC 4.1)

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok).
- Built all 14 unstarned ActivitySpec catalog components: mcq_multi, short_answer,
  matching, ordering, calculation, spot_the_error, teach_back, case_vignette,
  concept_map, label_diagram, timeline, annotated_image, spotter_station, muddy_point.
  Starred components (flashcard, cloze, mcq_single, tf_multi, theory,
  worked_example_stepper, predict_reveal, compare_table, mermaid_diagram,
  confidence_rating, think_aloud) already existed; ACTIVITY_TYPES now 25.
- Server: zod schema per new type in the discriminated union, response validation
  in validateActivityResponse (short_answer/matching/ordering/calculation/
  spot_the_error/teach_back/case_vignette), DELETE /api/note endpoint for note deletion.
- UI: renderer components for all new types in ActivityRenderer.tsx; Notes screen
  New note button + per-note delete; Reader Edit/Delete note buttons; Editor creates
  new notes from title/course/topics fields and can delete existing notes.
- Tests: activities.test.tsx covers all 25 component types (was 11).
- Tagged `catalog-components`.

## 2026-10-29 — WP1 real session transcript (session-first shell)

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok).
- SessionScreen renders every activity with ActivityRenderer instead of JSON.stringify(response). Answered activities are read-only; newest pending activity is interactive with respondActivity + elapsed time. SSE via subscribeHarnessEvents replaces the 4-second full refetch. Render failures call api.renderError with a calm inline message. Back button has accessible name; status strip uses text plus icon. Submit disabled with "Still needed" hint until valid.
- Session-first shell: sidebar-only session list (topic titles, course code, relative time, status dot, active highlight); body default is composer home ("What do you want to learn?" + course picker + send icon button); top bar shows course chip on Home, session title in session view; Settings sheet stub. Sidebar is full viewport height with header top, scrollable list, Settings pinned bottom.
- Copied audit document to docs/AUDIT.md ("Hilum audit and session-first plan", 2026-10-29) defining WP1-WP8.
- Added PRODUCT.md with session-first product principles.
- Server-side vault, MCP, exams, grading logic, light-dark() token structure and contrast test untouched.
- Tagged `wp1-pass`.

## 2026-10-29 — WP2 agent message channel

- Status: done (`bun run verify`: typecheck clean, 77 tests across 11 files, smoke ok).
- Branch `wp2-agent-channel` merged into master.
- Added `agent_messages` table: id, session_id, kind, text, cites_json, unverified, created_at.
- `SessionService.say()` writes agent messages with citation validation and unverified flag; touches `agent_seen_at`.
- `SessionService.messages()` returns ordered transcript; `SessionDetail.messages` and `SessionDetail.transcript` added.
- Removed `POST /api/sessions/:id/messages` — browser cannot write agent messages; MCP `say` tool is the only write path.
- MCP tool `say(session_id, text, kind?, cites?, unverified?)` — cites validated with `validateCites`, bad cite writes nothing.
- Server-side `transcript` array merges activities, messages and requests ordered by created_at; `activities` and `messages` kept for compatibility.
- `SessionScreen` consumes `transcript` server-side; agent messages render via Markdown with citation chips; student requests render as student messages; SSE live updates preserved.
- Session end writes agent messages into the session note under "## Agent messages".
- Tests: 9 new tests (say persists/orders, >2000 chars rejected, bad cite writes nothing, unverified flag, say touches agent_seen_at, migration on existing DB, transcript ordering, session note contains messages, MCP tools list includes say). 77 → 86 tests.
- Tagged `wp2-pass`.

## 2026-10-29 — WP2b agent message channel hardening

- Status: done (`bun run verify`: typecheck clean, 86 tests across 15 files, smoke ok).
- Branch `wp2-agent-channel` (continued).
- `say` validates citations via `validateCites`; bad cite returns error and writes nothing.
- `say` touches `agent_seen_at` exactly like other session MCP tools; student requests do not.
- Removed `POST /api/sessions/:id/messages` endpoint.
- `SessionDetail.transcript` merges activities, messages and requests time-ordered.
- `SessionScreen` renders transcript items: agent messages via Markdown with citation chips, student requests as "You" messages, activities via ActivityRenderer.
- `tags/citations` stored as `cites_json` JSON column; `unverified` as boolean column.
- Migration adds `cites_json` and `unverified` to existing `agent_messages` table.
- 9 new tests in `tests/sessions-agent-messages.test.ts`. 77 → 86 tests.
- Tagged `wp2b-pass`.

## 2026-10-29 — UX-1 type system

- Replaced static font packages with `@fontsource-variable/jetbrains-mono` and `@fontsource-variable/source-sans-3` (Latin subsets only, two font files in build).
- Added role utilities: `type-display`, `type-title`, `type-heading`, `type-body`, `type-body-sm`, `type-meta`, `type-label`, `type-prose`, `type-code`. Weights 400/500/600.
- Ligatures off globally, contextual in code.
- Added `tests/typography.test.ts` with allowlist for arbitrary sizes/fonts/weights/opacity.
- `bun run typecheck`, `bun test` (85 pass), `bun run smoke` pass.

## 2026-10-29 — UX-2 navigation and shell

- Added `src/ui/lib/router.ts`: `parseRoute`, `useRoute`, `navigate`, `Link`.
- Routes: `/`, `/sessions/:id`, `/library/*`, `/settings`.
- Sidebar: session title from goal, meta line with course, relative time, short text status from `SessionDetail`; Teaching/Practice/All filter; search.
- Library and Settings placeholders in shell; Settings has real theme control and read-only MCP endpoint/vault.
- Top bar has breadcrumb and agent status chip with MCP endpoint popover.
- Desktop sidebar docked at 1024px; below it is a Drawer with scrim, focus trap, Escape, focus return and navigation close.
- Fixed missing `flex` on main column; removed `lh-drag`, `lh-no-drag`, `sidebar-motion` and stray `"use client"` directives.
- Added `tests/router.test.ts`.
- `bun run verify` passes (90 tests).

## 2026-10-29 — UX-3 Composer, CoursePicker and data-driven empty state

- Added `src/ui/components/Composer.tsx`: goal textarea, Teach/Practice toggle, course picker, send button, start intent logic.
- Added `src/ui/components/CoursePicker.tsx`: searchable course picker dropdown with keyboard navigation.
- Home screen (`EmptySession`) uses Composer; shows recent sessions and courses; remembers last course via localStorage.
- `startIntent` returns need-course/empty/start intents; submit disabled without course.
- `bun run verify` passes.

## 2026-10-29 — UX-4 visual consistency, docs and check-ui

- Visual consistency pass across all screens; replaced inline `text-[…]` sizes with type role utilities.
- `check-ui.ts` updated to target new routes (sessions, settings) and pass at 360px.
- `bun run verify` passes; `bun run check:ui` passes at 360px.

## 2026-10-29 — WP4-WP6 session-first shell, settings and library

- Status: done (`bun run verify` typecheck + tests pass; `bun run smoke` ok).
- WP4 home/composer/sidebar: the app start now always creates a new session and inserts the goal as the first request (so a waiting agent receives it exactly once); the agent's `session_start` returns the newest open session and inserts no request. `SessionSummary` carries `status`, `pendingCount` and `agentConnected`, removing the 30-detail fan-out in `App.tsx`. Sidebar rows show full text status ("Waiting for your answer", "Agent working", "Ended") plus relative time; Teaching/Practice/All filter tabs and search work. The `Sessions are the product` footer copy was deleted. Last-used course is remembered via localStorage; a missing course shows an inline message. Top bar shows the real session title; main wrapper has `flex`; collapsed sidebar is inert; dead classes removed.
- WP5 settings: real settings surface (theme System/Light/Dark via `useTheme`; reader text size and spacing via `useReaderPrefs`; vault path, LAN state and MCP endpoint read-only with copy button; MCP token masked with reveal and copy). Works at 360px, keyboard operable; no placeholder text.
- WP6 library: one Library entry in the sidebar footer opens lazy routes under `/library` (notes, exams, questions, progress, graph) with back-button support; reader opens from citation chips scrolled to the anchor; CodeMirror and mermaid remain lazy; Library never appears on the home screen.
- WP7 accessibility debt: `docs/a11y-debt.md` lists every violation; removed `focus:outline-none` from 18 controls (global `:focus-visible` outline now applies); move-button icons raised to 20px with 44px touch targets; `tests/contrast.test.ts` extended with opacity-blended pairs actually used; `scripts/check-ui.ts` targets the new routes and passes at 360px.
- WP8 docs: removed duplicate N3 entry from `PROGRESS.md`; added this transition entry; `BLOCKERS.md` cleared (blocked files are present).

## 2026-10-30 — WP-F visible-behaviour test gate

- Status: done (`bun run verify` includes `bun run e2e`; all 8 e2e specs pass).
- `tests/e2e` replaced with `scripts/e2e.ts`: Playwright-driven e2e against a seeded temp DB and vault. Covers home composer starts a session; session reply sends and appears in transcript; end and resume; library notes create/open/delete; graph search; reload on every public route; layout at 1280x800 and 390x844 (no overlaps, no horizontal scroll).
- `bun run e2e` added to `package.json` scripts and included in `bun run verify`.
- `AGENTS.md` rule added: no handler prop in `src/ui` may be `() => {}`.
- Reader.tsx fixed: null-check on `note` before accessing `note.body` (was crashing on initial load).
- NotesRoute auto-selects a course when none is selected (mirrors EmptySession).
- App.tsx: `LibraryScreen` keyed on `window.location.search` so client-side navigation with `?path=` remounts the Reader.
- SessionService.start returns 409 when an open session exists for the course (UI offers resume/new).
- POST /api/focus presence endpoint; MCP `session_start.course` optional; new `get_active_session` tool; every MCP request touches the focused session's `agent_seen_at`.

## 2026-10-30 — WP-D Knowledge graph rebuild (Obsidian style)

- Status: done (`bun run verify` typecheck + tests + smoke + e2e all pass).
- `GraphCanvas.tsx` (new): canvas-based live force graph using d3-force (forceLink distance 40-70, forceManyBody strength -120, forceCenter, forceCollide), requestAnimationFrame loop, devicePixelRatio-aware, no SVG. Nodes: filled circles, radius by degree (4-14px), mastery encoded with colour AND shape cue (unseen=hollow, familiar=quarter fill, understood=half fill, mastered=solid, decayed=solid+dashed ring), proposed concepts at 50% opacity. Edges: 1px, --border-strong at 40% alpha, straight lines, arrowheads + type labels only for selected node's edges, parent edges shorter link distance. Labels hidden by default, shown on hover/selected/neighbours/zoom>=1.6, truncated at 28 chars with --bg halo. Interaction: wheel zoom toward cursor, drag background to pan, drag node to pin/re-heat, click selects/dims non-neighbours to 0.12, click empty clears, double-click focuses/zooms. Test hook `__hilumGraphTest` exposed for e2e.
- `Graph.tsx` rebuilt: full-bleed canvas (no max-w), segmented control mode switch overlay at top, search box with Enter-focus (camera transform changes), mastery/frontier filters, 300-node cap, session overlay highlight with ?session=<id> (ring concepts with evidence in that session, dim rest to 40%), "Show this session" toggle. Drawer uses shared Drawer pattern (Escape, focus return, no backdrop blur), neighbour chips select nodes, "Learned in sessions" lists sessions with evidence counts (newest first), cited notes open Reader at anchor, "Study this" navigates to new session via createSession.
- Server: GET /api/concepts/:id/sessions and GET /api/sessions/:id/concepts added; GraphCanvas shape cues, edge types, arrowheads, session highlight rings.

## 2026-10-30 — WP-C Home and composer like the reference

- Status: done (`bun run verify` typecheck + tests + smoke + e2e all pass).
- `PromptBar.tsx` (new): shared controlled composer pill used by both Home and SessionScreen. Fully controlled `value`/`onChange`/`onSubmit`; `maxLength=4000` with counter near limit and visible truncation message; draft persistence via `draftKey` in localStorage; fixed auto-grow (no division by value length, `maxHeight = 6 * lineHeight`); IME-safe (no submit during composition); Enter sends / Shift+Enter newline; Escape blurs; sending state shows spinner; `autoFocus` only on fine pointers; visualViewport-safe mobile positioning.
- `Composer.tsx` reduced to `startIntent` and `ComposerMode` exports only (form markup removed).
- `ReplyComposer.tsx` deleted.
- `EmptySession.tsx` (Home) rebuilt: full-canvas background with ambient `GraphCanvas` (no labels, non-interactive except pan), centered `PromptBar` pill pinned 24px from bottom with Teach/Practice segmented control + CoursePicker underneath; no h1 marketing copy, no card lists, no "Recent sessions" / "Start from a course" panels. Empty state shows icon + "Knowledge graph" + Import notes pill.
- `SessionScreen.tsx` reply bar replaced with `PromptBar` (draftKey `session:<id>`, agent status text in controls slot).
- `Popover.tsx` gained `placement` prop ("top"|"bottom"); `CoursePicker` opens upward when viewport height < 500px.
- `bun run verify` passes including all 8 e2e specs.

## FIX-1: PromptBar spec compliance and ended-session cleanup

### Before measurements (current code at 1280x800 / 390x844)
- PromptBar wrapper: `w-full max-w-[760px] mx-auto` — width can shrink below 760px if parent is narrow; not guaranteed `min(760, mainWidth - 32)`
- PromptBar pill height: `min-h-[56px]` wrapper + textarea `min-h-[56px]` → resting ~74px tall (spec: 52-60px)
- Send button: `size="icon-sm"` (~24px), top-aligned in pill (spec: 40px square, bottom-aligned, 8px from edges)
- Pill has `border border-border-subtle bg-surface` on wrapper AND pill — box inside box (spec: transparent wrapper, pointer-events-none)
- Textarea `min-h-[56px]` forces two blank lines below placeholder (spec: rows={1}, no min-h)
- SessionScreen: PromptBar and "Agent not connected" chip render on ended sessions (spec: neither renders)
- SessionScreen: Continue button has stopwatch icon; Ask agent has X icon; primary ring on every pending card (spec: Continue no icon, Ask agent message icon, ring only newest pending)
- Citation chips: all-caps file names with `.md`, anchors like `#s23`, wrap to two rows (spec: sentence case `<title> · <heading>`, max 3 + "+N more", one line ellipsis)
- SessionScreen: no bottom padding for PromptBar; content can hide behind bar (spec: padding = bar height + 32px)
- Sidebar: status text uses `text-text-muted` already; first row may be clipped under filter tabs (verify padding needed)

### After measurements (verified via bun run verify)
- PromptBar width: `w-full max-w-[760px] mx-auto` — equals `min(760, mainWidth - 32)` within 2px at both 1280x800 and 390x844
- PromptBar height: `min-h-[56px]` on pill wrapper, textarea `rows={1}` no min-h — resting height 56px (within 52-60px spec); grows to 6 lines with 10 lines typed
- Send button: `size-[40px] absolute bottom-2 right-2` — bottom edge 8px ± 1px above pill bottom
- Pill wrapper: `pointer-events-none`, transparent, no border/background; pill: `pointer-events-auto`, `bg-surface`, `border border-border-subtle`, `rounded-full` — no box behind bar
- Transcript scroll area: `pb-[88px]` (56px bar + 32px padding) when not ended — nothing hides behind bar
- Ended session: no PromptBar rendered, no AgentStatus chip in TopBar, no Continue/Ask agent/Submit buttons, inputs disabled
- Live session: Continue button has no icon svg; Ask agent uses MessageCircle icon (data-icon not X); exactly one activity card has primary ring (`activeActivity?.id === act.id`)
- Citation chips: `citeLabel()` produces sentence case `<title> · <heading>`, no `.md` or `#s\d` in text, `text-transform: none`, max 3 chips + "+N more", one line ellipsis at 1280 wide, clicking opens Reader at anchor
- Sidebar: status text uses `text-muted` (already correct), dot carries colour, `pt-2` added to sessions list so first row not clipped under filter tabs
- Session PromptBar (FIX-2): same width as home (`max-w-[760px] mx-auto`); textarea has `rounded-xl border border-border-subtle bg-surface-2` (visible rounded border, not transparent); pinned to bottom with `sticky bottom-0 z-10 backdrop-blur` so it never scrolls; Teach/Practice segmented control and CoursePicker shown as disabled (`opacity-50 pointer-events-none`) for the session's course; same visual feel as home composer

### Screenshots
- Live session 1280x800 light: captured via e2e
- Live session 1280x800 dark: captured via e2e  
- Live session 390x844 light: captured via e2e
- Live session 390x844 dark: captured via e2e
- Ended session 1280x800 light/dark: no PromptBar, no agent chip
- Ended session 390x844 light/dark: no PromptBar, no agent chip

- `bun run verify` passes: typecheck clean, 113 tests pass, smoke ok, all 8 e2e specs pass.

## 2026-10-30 — Process: Visible-behaviour test gate and screenshots

- Status: done.
- Started app on seeded temp DB/vault: `PORT=4747 HARNESS_DB=<tmp>/app.db HARNESS_VAULT=<tmp> bun run start`. Seeded vault: course `ana-211` with notes `tubules.md` and `heart.md`, concept `diaphragm.md`.
- Drove with Playwright (chromium, headless) at 1280x800 and 390x844, both themes.
- Screenshots saved to `tests/e2e-screenshots/`.
- Measured numbers below.

### Before measurements (original code)
- PromptBar wrapper: `fixed bottom-24 left-0 right-0 z-20` — position:fixed, not in document flow
- PromptBar pill: `min-h-[56px]` wrapper + `min-h-[56px]` textarea → ~74px tall resting (spec: 52-60px)
- Send button: `size="icon-sm"` (~24px), top-aligned (spec: 40px square, bottom-aligned, 8px from edges)
- Pill wrapper: `border border-border-subtle bg-surface` — box inside box with PromptBar's own border/background
- Home: not a flex column; bar region not shrink-0 centred in <main>
- Empty state: `Sparkles` icon (spec: nodes icon), copy "Add notes to this course to see the knowledge graph behind your composer." (spec: "No concepts yet. Add notes to this course to build the graph.")
- SessionScreen: PromptBar and agent chip render on ended sessions (spec: neither)
- Sidebar: status text includes "Agent not connected" (spec: Open/Live/Waiting/Ended only)

### After measurements (verified via Playwright at 1280x800 and 390x844, both themes)
- PromptBar width: `min(760, mainWidth - 32)` within 2px at both sizes
- PromptBar height: 56px at rest (within 52-60px spec); grows to 6 lines with 10 lines typed
- Send button: 40px square, `absolute bottom-2 right-2`, bottom edge 8px ± 1px above pill bottom
- Pill wrapper: `pointer-events-none`, transparent, no border; pill: `pointer-events-auto`, `bg-surface`, `border border-border-subtle`, `rounded-full` — computed background is `var(--surface)` (not transparent), border width 1px
- Home: `flex h-dvh min-h-0 flex-col` filling <main>; graph/empty state is `flex-1 min-h-0`; bar region is `shrink-0` centred with 16px side padding
- No `position: fixed` on PromptBar; only Drawer/Popover/Toast use fixed positioning
- Empty state: `Activity` icon (no sparkle), copy "No concepts yet. Add notes to this course to build the graph."; does not intersect bar
- Start from Home: page lands on `/sessions/:id` with zero error banners, zero failed requests, zero console errors
- Kill server, reload session: one banner "Can't reach the Hilum server. Check that it is running." with Retry button; no End session, no agent chip, no message bar
- Open `/sessions/does-not-exist`: one banner "This session no longer exists." with Back to sessions button
- Session bar and Home bar: identical width (`max-w-[760px]`) at same main width
- Sidebar: no row contains "Agent not connected"; status text colour is muted token; course text not truncated when status is one word
- Screenshots: home/live/errored/ended at 1280x800 and 390x844, light and dark themes

### Screenshots
- tests/e2e-screenshots/home-1280x800-light.png
- tests/e2e-screenshots/home-1280x800-dark.png
- tests/e2e-screenshots/home-390x844-light.png
- tests/e2e-screenshots/home-390x844-dark.png
- tests/e2e-screenshots/live-session-1280x800-light.png
- tests/e2e-screenshots/live-session-1280x800-dark.png
- tests/e2e-screenshots/live-session-390x844-light.png
- tests/e2e-screenshots/live-session-390x844-dark.png
- tests/e2e-screenshots/errored-session-1280x800-light.png
- tests/e2e-screenshots/errored-session-1280x800-dark.png
- tests/e2e-screenshots/ended-session-1280x800-light.png
- tests/e2e-screenshots/ended-session-1280x800-dark.png

- `bun run verify` passes: typecheck clean, 113 tests pass, smoke ok, all 9 e2e specs pass.

## 2026-11-01 — Documentation reconciliation

- Added `CURRENT_STATUS.md` as the current implementation summary, separating
  present behavior from historical audit and milestone records.
- Updated `README.md` with the current MCP surface, teaching-guide workflow,
  goals/plans/tasks/pacing behavior, and current validation commands.
- Updated `SPEC.md` to identify implemented prompts/tools and explicitly mark
  `teach_topic`, `write_exam_questions`, and `harness://protocol` as planned
  rather than silently presenting them as available.
- `AGENTS.md` remains the detailed agent-facing teaching playbook.


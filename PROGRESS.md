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

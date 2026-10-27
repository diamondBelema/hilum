# Review

## 2026-10-26 — M2 + U0 (Lane B/C)

**Verdict: pass.** `bun run verify` green (typecheck, 35 tests across 6 files, smoke ui/api/mcp).

### Scope
- M2: vault paths/frontmatter/indexer with 2 s watcher, SQLite `notes` + FTS5 + idempotency, `VaultService`, MCP content tools, notes reader, HTTP API.
- U0 (Lane C, pulled forward): H&E design tokens with `light-dark()`, Atkinson fonts, shared components, `/_design` gallery.

### Checked against SPEC
- [x] Vault is source of truth; DB outside the vault (`state/app.db`), single writer through `VaultService`.
- [x] `notes` schema and FTS5 match 4.2; `notes` rows rebuilt from frontmatter, tokens counted.
- [x] Watcher reindexes external edits; indexer tolerates broken YAML without crashing the server.
- [x] Content tools 4.9 complete: `list_courses`, `get_index`, `read_note`, `search_notes`, `write_note` (create/append/replace, `request_id` idempotency, vault-confined), `list_assets`, `update_course`.
- [x] Notes exposed as `vault://<path>` resources, including frontmatter, with list + read.
- [x] Notes reader: course list, note list, search, markdown rendering, TOC with anchors, citations chip-ready, image zoom, reading size/spacing, theme, mobile layouts.
- [x] DESIGN.md: tokens only from `tokens.css`, `light-dark()` + System/Light/Dark, 44 px targets, no horizontal overflow at 360/1280, contrast enforced by `tests/contrast.test.ts`.
- [x] No vault content or DB committed; demo fixtures live outside the repo.

### Gaps (deferred by design)
- Citation validation on `write_note` and banked items is M3 (4.3), together with `add_questions`.
- Question/attempt/session tables are M3+; M2 only ships `notes`, `notes_fts`, `meta`, `idempotency`.
- `tools/` deletions in the worktree belong to Lane A and were left out of this commit.
- U0 has no independent tag gate in SPEC; tagged with M2 for traceability.

## 2026-10-26 — M3 question bank

**Verdict: pass.** `bun run verify` green (typecheck, 46 tests across 7 files, smoke ui/api/mcp).

### Scope
- M3: `questions` schema v3, citation validator, question validators, `QuestionBank`, MCP question tools, `import_past_paper`, HTTP question API, bank + past-paper verification UI.

### Checked against SPEC
- [x] `questions` row per 4.2 (course, type, question_kind, topics, concepts, difficulty, marks, body, cites, source_paper, verified, unverified, created_by).
- [x] Types `tf_multi` (4–5 statements), `mcq_single` (options + key), `theory` (prompt + question_kind); marks must be positive.
- [x] Citations hard rule 4.3: source must exist, anchor must resolve (explicit `{#id}` or heading slug), quoted text must appear in that section (whitespace-normalized); every banked item needs a quote.
- [x] Tools 4.9: `add_questions`, `list_questions`, `get_question`, `update_question`, `verify_question`, `import_past_paper`; all-or-nothing writes.
- [x] `import_past_paper` forces `verified:false` / `unverified:true`, derives stable ids, validates the source path inside the vault, and is idempotent with `request_id`.
- [x] Verification screen 7.7: source (photo or note) beside parsed fields, per-question edit, Mark verified/Unverify, "N of M verified" progress; mobile source sheet; keyboard labels and 44 px controls.
- [x] Unverified questions are visibly marked and described as excluded from papers.

### Gaps (deferred)
- Citation chip with quote highlight on note open (DESIGN 6.2) is still display-only in the reader; the verification screen shows the source beside the question instead.
- Wikilink citation validation inside `write_note` bodies is not yet enforced (question writes are).
- Paper/attempt tables and exam-only inclusion rules are M4. `spotter` validation waits for M4.
- Demo bank uses fabricated past-paper fixtures outside the repo.

## 2026-10-26 — M4 exam engine

**Verdict: pass.** `bun run verify` green (typecheck, 53 tests across 8 files, smoke ui/api/mcp).

### Scope
- M4: schema v4 papers/attempts/answers, paper builder, strict/sectioned/practice runner, autosave, auto-submit, deterministic grading, spotter stations, MCP + HTTP exam API, browser UI.

### Checked against SPEC / DESIGN
- [x] Paper builder takes a blueprint (sections, type, count, minutes, marks, topics, negative marks, scoring) and fails on a shortfall rather than drawing unverified items.
- [x] Strict: countdown, autosave on every answer, auto-submit at zero, flag, pace, grid, submit dialog with unanswered/flagged counts, no notes.
- [x] Sectioned: each section has its own remaining time; inputs and grid entries lock when a section's time is up; other sections stay reachable.
- [x] Practice: soft timer, spellcheck on, model answer/explanation/rubric revealed once answered.
- [x] Reload mid-exam restores answers and the running timer; auto-submit also fires after a reload past the deadline.
- [x] Objective grading: TF per-statement/all-or-nothing, MCQ negative marks, spotter normalized exact/accepted answers; theory → `pending_grading`.
- [x] Spotter stations: image, one identify field, 60–90 s-style per-station timer with auto-advance, rotating through N stations.
- [x] Keyboard: N/→, P/←, G, L, A–E; Enter advances from a spotter answer; shortcut sheet.
- [x] Results: score first, section rows, pending theory called out, flagged-vs-unflagged accuracy, mistake tags.
- [x] MCP tools `create_paper`, `list_papers`, `get_paper`, `get_attempt_results`; HTTP mirrors start/save/submit/results.
- [x] 360/1280 px and light/dark checked for builder, runner, spotter, results and resume.

### Gaps (deferred)
- Full debrief (student answer vs correct answer, explanation, citations per item; time-per-question sort) is M5.
- Spotter 3D/annotated-pin variants are reserved; v1 uses a static image plus text identify.
- Autosave failure uses the "Not saved … Retry" banner code path but was not exercised with the server stopped.
- Theory rubric checklist is shown as text in practice mode, not per-heading checkboxes.

## 2026-10-27 — M5 grading queue and debrief

**Verdict: pass.** `bun run verify` green (typecheck, 56 tests across 8 files, smoke ui/api/mcp).

### Scope
- M5: schema v5 grades/evidence, pending queue, grade validation, SSE, copy/paste fallbacks, photo answers, full debrief, attempt history, MCP grading tools and prompts.

### Checked against SPEC / DESIGN
- [x] Theory submissions become `pending_grading`; the queue shows question, rubric, model answer, response or photo.
- [x] `get_pending_grading` and `submit_grade` exist; `grade_theory_answer` and `exam_debrief` prompts render usable instructions.
- [x] Grade JSON is validated on both sides: non-empty rubric rows, awarded ≤ max, total ≤ marks, taxonomy-only mistake tags.
- [x] SSE updates the nav badge and queue immediately; an open debrief refetches after a grade for its attempt.
- [x] Fallback "Copy grading prompt" and "Paste grade JSON" work without any agent connected.
- [x] Photo flow: theory `answer_input=photo`, upload/replace, preview, attempt-scoped serving, pending/debrief display.
- [x] Results: large score, section rows, grouped mistakes with counts, Review these, flagged accuracy, sortable time, per-item student/correct answers, explanation, rubric, grade breakdown and citations.
- [x] Each final answer writes evidence tagged to the question's concept ids; re-grading is idempotent.
- [x] Attempt history: Results/Resume from the paper list, so a debrief is reachable after leaving the screen.
- [x] 360/1280 px and light/dark checked for grading, debrief, photo upload and the five-tab mobile nav; no horizontal scroll at 360 px.

### Gaps (deferred)
- Photo answers are shown at fit-to-width; pinch/zoom and labelled-diagram annotation are not built.
- The photo URL in a grading prompt is localhost-scoped; a remote agent needs network access to the same host.
- Practice-mode theory answers still enter the grading queue even though practice reveals the reference answer.
- Attempt history is API-level only; the paper row shows the latest attempt rather than a list of all attempts.
- Evidence is keyed by concept id; topic-level aggregation is left to M6's mastery views.

## 2026-10-27 — M5b live sessions and ActivitySpec renderer

**Verdict: pass.** `bun run verify` green (typecheck, 65 tests across 9 files, smoke ui/api/mcp).

### Scope
- M5b: schema v6 sessions/activities/agent_requests, SessionService, the 11 starred ActivitySpec components, live link/SSE, agent requests, render errors, banking, session notes, AGENTS.md, MCP session tools and `run_session`, Live UI.

### Checked against SPEC / DESIGN
- [x] `session_start` returns a session plus mastery/due/frontier placeholders; `get_session`, `push_activity`, `await_response`, `record_evidence`, `get_agent_requests`, `bank_activity`, `session_end` all exist.
- [x] ActivitySpec is validated against a fixed catalog; unknown types are rejected with the available list; every activity carries valid cites.
- [x] All starred components render: flashcard, cloze, mcq_single, tf_multi, theory, worked_example_stepper, predict_reveal, compare_table, mermaid_diagram, confidence_rating, think_aloud. Component renderer tests use server-side React rendering, so each catalog entry is exercised.
- [x] Mermaid renders locally with strict security, follows light/dark, and a parse failure is reported back to the agent and shown as the friendly fallback.
- [x] Status strip: connected, preparing with elapsed seconds, not connected; after 20 s it adds "Still working…" and the two escape buttons. Student actions cannot fake presence.
- [x] Confidence and think-aloud appear only when the spec asks for them; answers write evidence per concept.
- [x] Ask-the-agent sheet has Explain this / Quiz me / I am confused / Go slower, a custom request, and a visible queue.
- [x] A student can Keep this; the activity lands in `courses/<course>/activities/` with cites and spec. End session writes a session note with summary and activity log.
- [x] AGENTS.md and MCP server instructions describe the same loop; `run_session` prompt is available.
- [x] 390/1440 px and light/dark checked; six-tab mobile nav fits at 360 px without clipping; diagram, stepper, compare table, confidence and think-aloud all usable.

### Gaps (deferred)
- Mastery, due items and frontier are empty until M6; `find_concepts`/`get_next_concepts` do not exist yet.
- Banked activities are stored and cited but cannot yet be replayed, scheduled or included in papers.
- The browser flow was exercised with seeded session data; the MCP loop is covered in memory, not against a real external teaching agent.
- Session history is API-level; the Live screen does not list old sessions.
- Only one active session per course is surfaced; overlapping sessions in other courses are not managed in the UI.

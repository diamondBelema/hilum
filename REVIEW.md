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

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

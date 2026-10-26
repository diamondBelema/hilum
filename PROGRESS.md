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

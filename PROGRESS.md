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

# UX shell progress

Branch `ux-shell`. Runtime: `PORT=4749`, own `HARNESS_DB` and `HARNESS_VAULT`
under `/tmp/opencode/ux`. This file is separate from `PROGRESS.md` on purpose.

## 2026-10-29 — UX-1 type system

- Replaced static Atkinson/JetBrains/Source Sans packages with
  `@fontsource-variable/jetbrains-mono` and `@fontsource-variable/source-sans-3`.
- Font faces are declared against the package's Latin WOFF2 files only; the
  build output contains exactly two font files (Latin).
- Added role utilities: `type-display`, `type-title`, `type-heading`,
  `type-body`, `type-body-sm`, `type-meta`, `type-label`, `type-prose`,
  `type-code`. Weights stay in 400/500/600.
- Ligatures off globally, contextual in code.
- Added `tests/typography.test.ts` with an explicit allowlist for
  `SessionScreen.tsx` (WP2) and `Reader.tsx` (reader preference).
- `bun run typecheck`, `bun test` (85 pass), `bun run smoke` pass.

## 2026-10-29 — UX-2 navigation and shell

- Added `src/ui/lib/router.ts`: `parseRoute`, `useRoute` (popstate + internal
  navigation event), `navigate`, `Link`.
- Routes now drive the shell: `/`, `/sessions/:id`, `/library/*`, `/settings`.
- Sidebar: session title from goal, meta line with course, relative time and a
  short text status derived from `SessionDetail` (`Waiting`, `Working`,
  `Connected`, `No agent`, `Ended`); Teaching/Practice/All filter; search.
- Added Library and Settings placeholders inside the shell; Settings has the
  real theme control and read-only MCP endpoint/vault.
- Top bar has a breadcrumb and the agent status chip with an MCP endpoint
  popover (`Popover`, `AgentStatus`). Desktop sidebar is docked at 1024px;
  below that it is a `Drawer` with scrim, focus trap, Escape, focus return and
  navigation close.
- Fixed the missing `flex` on the main column, removed `lh-drag`,
  `lh-no-drag`, `sidebar-motion` and the stray `"use client"` directives.
- Added `tests/router.test.ts`.
- Note: direct reload of `/library`, `/settings` or `/sessions/:id` returns 404
  from the server; client-side navigation, back and forward work. Requested a
  server SPA fallback from the other agent.
- `bun run verify` passes (90 tests).

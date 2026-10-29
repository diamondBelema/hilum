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

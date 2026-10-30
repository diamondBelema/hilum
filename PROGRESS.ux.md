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

## 2026-10-30 — Part A: server and agent channel

- A1 SPA fallback: tests added in `tests/app.test.ts` "spa fallback" for `/library/graph`, `/settings`, `/sessions/abc`, `/api/nope` (404 JSON), `/assets/missing.js` (404). Fallback already returns `dist/ui/index.html` for non-API/non-asset GETs without extensions.
- A2 Active session = focus lease: `session_focus` gained `tab_id` column (migration to schema v9). `focus(sessionId, tabId)` heartbeats; `focused()` returns the focused session if updated within 90s, else falls back to `active()` (newest open), never null while an open session exists. `GET /api/sessions/active` returns `focused()`. `get_active_session` MCP tool returns top-level `session_id`, `title`, `course`, `mode`, `started_at`, `unread_user_messages`, `open_requests` plus the full session detail. MCP description and AGENTS.md updated (agent states session id in first say).
- A3 Real agent presence: new `agent_presence` table (schema v9). Every MCP tool call updates `last_seen_at`/`client_name` from `initialize` via a `withPresence` wrapper on all tool handlers. `await_response` sets `listening_until` while blocked and clears on return. Session detail exposes `agent: { state, clientName, lastSeenAt }` (listening/connected/idle/none); `agentConnected` = listening or connected. State changes publish SSE `agent` event. Tests cover connected/listening/idle/none transitions.
- A4 Message lifecycle: `POST /api/sessions/:id/requests` accepts `clientId`, stores with status `sent`, idempotent by clientId. Statuses sent → seen (get_agent_requests/await_response) → answered (say/push_activity), each publishing SSE events. Tests cover the three transitions plus idempotency.
- A5 Titles: nullable `title` column on sessions (schema v9). `session_start(course, goal, title?)` and new `set_session_title` MCP tool; `PATCH /api/sessions/:id {title}` for UI rename; history and detail return title. Tests cover create-with-title, PATCH rename, get_session title.
- A6 End session summary: empty summary now writes a deterministic fallback note built from the transcript (goal, concepts touched, answers right/wrong). Test: ending with summary "" produces non-empty note content.
- A7 Course-scoped notes endpoints: `GET /api/notes/tree?course=` (reuses `vault.notesForCourse`), `POST /api/notes` (create from {course, title, folder}), `PUT /api/notes` (save with If-Match etag, 409 on mismatch). Tests for all three.
- `bun run typecheck`, `bun test` (126 pass), `bun run smoke` pass.

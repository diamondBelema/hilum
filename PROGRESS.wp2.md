# WP2 Progress — Agent Message Channel

## Status: DONE

## Branch: wp2-agent-channel (commit 3826db7)

## Changes (all within allowed scope):

### src/server/db.ts
- Added `agent_messages` table: id, session_id, kind (default 'say'), text, created_at
- Index on session_id, created_at

### src/server/sessions/service.ts
- Added `SessionService.say(sessionId, text, kind)` — writes a message, validates non-empty and <=2000 chars, updates agent_seen_at, publishes SSE event
- Added `SessionService.messages(sessionId)` — returns ordered transcript array
- Extended `SessionDetail` type with `messages` field
- `detail()` now includes messages in the response

### src/server/app.ts
- Added POST /api/sessions/:id/messages — creates an agent message (validates text present)

### src/server/mcp.ts
- Added MCP tool `say` — schema: session_id (required), text (1-2000 chars), kind (say/teach/probe/coach, default say)

### src/ui/api.ts
- Added `api.say(id, text, kind)` — POST /api/sessions/:id/messages

### src/ui/screens/SessionScreen.tsx
- Transcript now interleaves activities and agent messages ordered by creation time
- Agent messages rendered with "Agent" label, kind chip, timestamp, whitespace-pre-wrap text
- SessionDetail type updated to include messages array

## Tests: 77 pass, 0 fail
## Typecheck: clean

## Next: WP3 (Agent contract AGENTS.md rewrite and tool profiles)
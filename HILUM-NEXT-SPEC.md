# HILUM-NEXT-SPEC.md (v2)

This spec is the merged HILUM NEXT target. It supersedes the milestone narrative in SPEC.md where they conflict.
The five core principles:

1. **Baseline first:** no work package starts until `bun run typecheck` and `bun test` are green on `main`. Every PR leaves them green.
2. **The core loop must close:** uploads sort, convert, and feed the agent; jobs execute, not just enqueue.
3. **Launcher security:** config saves and agent start are gated on the connection's remote address being loopback, and refused entirely in LAN mode — never on the `Origin` header alone.
4. **Every job is visible:** any background job appears in the Agent activity list within one second of creation.
5. **No silent failures:** a converter failure marks the item `unreadable` with the error and never crashes the runner.

## S1. Precondition (baseline)

`bun run typecheck` has 0 errors; `bun test` has 0 failures and 0 errors; `pytest tools` passes without `PYTHONPATH`. CI runs all three. Each test fix states in DECISIONS.md whether code or test was wrong (vault `section`, graph order, frontier reason, calibration, dangling prerequisite). Assertions are not weakened without a stated reason.

## S2. "Where it appears" table

| Surface | Content |
|---|---|
| Shell status pill (always visible) | Agent not connected, Starting, Working (N jobs), Idle, Failed (with reason). Updates over SSE, no polling |
| Empty state and session screen | Same status text with a Start button when not connected and there is queued work or an unanswered student action |
| Settings, Agent launcher | Config form (S3), Test connection, last run, log tail, consecutive failures, Pause |
| Agent activity list | Queued, running and finished jobs with type, course, age, Cancel and Pause. Reachable from the pill |
| Inbox | Per-file status from `new` to `converted`, with the job that moved it |

## S3. Launcher config through the UI

A form with a command field (argument array, one argument per line), presets for opencode and Kilo, working directory, timeout and runs per hour. Saves over loopback only. A "Test connection" button starts the command once and reports whether `await_work` was called. A first-run prompt appears when nothing is configured. Hand-editing `state/agent.json` stays possible but is never required.

## S4. Server job runner

A runner leases `executor='server'` jobs in priority order, one at a time. For `convert` it spawns `tools/convert.py` as an argument array, parses JSON progress lines, writes `note_paths_json`, sets `inbox_items.status` (`converting`, `converted`, `needs_vision`, `unreadable`) and publishes `{type:"inbox"}` events. On success it enqueues `vision_transcribe` per flagged page and `map_concepts` for notes with no citing concept. On failure it records the error, retries up to `max_attempts`, and never blocks the queue.

## S5. Trigger definitions

For each job type in spec 5.1:

| Job type | Detecting query | Evaluator / interval | Dedupe key | Cap |
|---|---|---|---|---|
| `convert` | inbox item status = `sorted`, kind = presentation | on `correct` with course assigned | `convert:<sha256>` | none (dedupe) |
| `map_concepts` | converted note with zero citing concepts | after each `convert` completes + every 10 min timer | `map:<note_path>` | 20/hour |
| `tag_questions` | banked question rows without concept ids | every 15 min timer | `tag:<question_id>` | 10/hour |
| `write_questions` | exam within 21 days AND bank below threshold | daily timer | `write:<course>:<date>` | 5/hour |
| `vision_transcribe` | converter flagged pages | after each `convert` completes | `vision_transcribe:<inbox_item_id>` | 30/hour |
| `find_image` | concept with no figure and pages exist | on graph open | `find_image:<concept_id>` | 10/hour |

## S6. Launcher security

Config saves and `/api/agent/start` are refused unless the connection's remote address is loopback (`127.0.0.1`, `::1`, `localhost`), and config saves are refused whenever LAN mode is on, regardless of any header. Add a test that sends a request with no `Origin` header from a non-loopback address and expects rejection.

## S7. End-to-end loop test in `bun run verify`

Scripted scenario: create a vault with two courses, upload a fixture PPTX, assert it sorts and converts, assert `map_concepts` is queued, run a fake agent that completes it, assert a plan proposal can be created, assert the status pill state sequence over SSE (not connected, starting, working, idle). This test fails if any link in the chain is not wired.

## S8. Visible-when-idle rule

Any background job must appear in the Agent activity list within one second of creation. A feature whose work cannot be seen by the student is not done.

## Added work orders

**WO-12 Agent surfaces in the UI (M).** Shell status pill component, Settings agent launcher panel, Agent activity list screen, api.ts types.

**WO-13 End-to-end loop test (S).** `tests/loop.test.ts` implementing S7, runs in `bun run verify`.

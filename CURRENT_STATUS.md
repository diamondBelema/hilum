# Hilum current status

Updated: 2026-11-01

This is the current implementation summary. `PROGRESS.md`, `STATUS.md`, and
`docs/ui-audit/` retain historical milestone and audit evidence; older claims
in those files should not override this document.

## What is implemented

| Area | Current state |
| --- | --- |
| Vault and notes | Markdown vault, indexing, FTS5 search, citations, note resources, and note editing |
| Questions and exams | Cited question bank, past-paper import/verification, paper builder, timed runner, autosave, deterministic grading, theory grading queue |
| Teaching sessions | Live sessions, validated ActivitySpec catalog, SSE/UI responses, agent requests, banking, evidence, session notes |
| Teaching guide | Root `AGENTS.md` playbook plus MCP `get_teaching_guide`; instructions point agents to the guide |
| Concepts and mastery | Proposed/accepted concepts, aliases, graph links, mastery evidence, decay, frontier, weak topics, real results |
| Goals and plans | Optional goals with deadlines and daily study minutes; draft plans, approval, reordering, plan changes, coverage, carry-over |
| Tasks | Course-scoped practice/review/revisit/custom tasks, due dates, validation, UI completion, automatic completion from evidence/mastery |
| Pacing | Server-owned deterministic pacing, capped student-time accounting, time boxes, over-estimate nudges, estimate calibration |
| UI | Study, live session, plan, exams, grading, notes/editor, progress, graph, settings, responsive shell |
| Operations | SQLite migrations, database maintenance/backups, offline export, local fonts, LAN configuration and MCP token support |

## Agent-facing teaching flow

1. Call `get_active_session`; use `session_start` only when there is no active session.
2. Call `get_teaching_guide` when the full teaching playbook is needed.
3. Read the course `INDEX.md`, then only the cited notes.
4. Read `get_goal` and `get_pacing` when the session has a goal.
5. Probe, await the student response, diagnose confidence versus correctness, teach
   one concept, and check it again.
6. Link activities to the active plan item and follow server pacing nudges.
7. Record evidence for activities that are not auto-graded.
8. End with `session_end` and a concise summary when the sitting is complete.

The server remains authoritative for elapsed student time, mastery, plan state,
task completion, and pacing. Agents may propose plans and plan changes, but the
student approves plans and applies changes.

## MCP surface

The live server registers the following groups:

- Content: `list_courses`, `get_index`, `read_note`, `search_notes`, `write_note`,
  `list_assets`, `update_course`
- Teaching: `get_teaching_guide`, `session_start`, `get_active_session`,
  `get_session`, `push_activity`, `await_response`, `say`, `record_evidence`,
  `get_agent_requests`, `bank_activity`, `session_end`, `set_session_title`
- Goals and pacing: `get_pacing`, `get_coverage`, `get_goal`, `propose_plan`,
  `update_goal`, `propose_plan_change`, `update_plan_item`, `add_task`,
  `update_task`, `list_tasks`
- Concepts and mastery: `find_concepts`, `add_concept`, `update_concept`,
  `link_concepts`, `get_concept`, `get_graph`, `get_next_concepts`,
  `get_mastery`, `get_weak_topics`, `record_real_result`
- Questions, exams, and grading: the question, paper, attempt, grading, and
  debrief tools listed in `README.md`

`run_session`, `grade_theory_answer`, and `exam_debrief` are registered prompts;
`get_teaching_guide` is a registered tool. The authoritative runtime surface is
the registration in `src/server/mcp.ts`.

## Validation

Run these from the repository root:

```bash
bun run verify
bun run check:ui
bun run maintain
```

`bun run verify` covers typechecking, unit tests, localhost smoke checks, and
browser end-to-end checks. If Bun or dependencies are unavailable, source-level
validation is incomplete; do not describe the project as fully verified.

## Known follow-up work

- Add contract coverage specifically for `get_teaching_guide`.
- Decide whether repeated `propose_plan` calls should replace or append draft items.
- Narrow carry-over to the session's linked active plan item if that is the desired
  behavior rather than deferring every active item in the goal.
- Reconcile the remaining historical milestone language in `SPEC.md` with the
  current implementation without deleting audit history.

# Hilum — Exam Harness

Local-first study and exam-simulation app for medical students. A markdown vault is the
source of truth; an MCP server exposes notes, questions, exams, grading, live teaching
sessions, goals and the knowledge graph. The app is designed to make zero external
network requests at runtime.

**Current implementation status:** see [`CURRENT_STATUS.md`](CURRENT_STATUS.md).
Historical milestone and audit evidence remains in `PROGRESS.md`, `STATUS.md`, and
[`docs/ui-audit/`](docs/ui-audit/).

## Requirements

- [Bun](https://bun.sh) >= 1.4
- A modern browser (phone over LAN works)
- Linux desktop builds additionally require WebKitGTK 4.1 and librsvg development
  packages; see the Tauri prerequisites for your platform.

## Install

```bash
git clone <repo> learning-harness
cd learning-harness
bun install
```

## Run

```bash
bun run start
```

Builds the UI on first run, then serves the app and the MCP endpoint on
`http://127.0.0.1:4747`. Use the `./start` wrapper to launch from any directory.

| Script | What it does |
| --- | --- |
| `bun run start` | Build UI + serve app and MCP on port 4747 |
| `bun run dev` | Server on 4747 + Vite dev server on 5173 |
| `bun run verify` | Typecheck + unit tests + localhost smoke + browser e2e |
| `bun run test` | Unit tests |
| `bun run smoke` | Health, UI shell, MCP initialize |
| `bun run scripts/copy-db.ts` | Daily DB backup to `state/backups/` |
| `bun run scripts/export-pack.ts` | Offline data bundle in `.study-pack/` |
| `npm run tauri:dev` | Run the desktop shell around the local app |
| `npm run tauri:build` | Build desktop installers (platform prerequisites required) |

The desktop shell is an early Tauri integration. It uses the same React/Hono app
layer and currently adds native vault folder selection and opening. Packaged
desktop builds compile and bundle a local Hilum server sidecar; web mode remains
the reference runtime for now. The sidecar build requires Bun (or uses `npx bun`
as a fallback).

## Configuration

All optional; defaults are fine for local use.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4747` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` for LAN access |
| `HARNESS_VAULT` | `./vault` | Vault directory |
| `HARNESS_DB` | `./state/app.db` | SQLite database |
| `HARNESS_UPLOADS` | beside the DB | Photo-answer uploads |
| `HARNESS_MCP_TOKEN` | unset | Bearer token used for LAN MCP access when configured |

## Vault

Default vault: `~/Documents/hilum-vault` (override with `HARNESS_VAULT`). It is
**not committed** — notes, concepts, past papers and attempts are personal data.

```
vault/
  INDEX.md                  root index
  courses/<code>/           notes, banked activities, session notes
  concepts/<id>.md          concept graph nodes (cited frontmatter)
  rubrics/                  grading rubrics
  inbox/<course>/           slides/PDFs awaiting conversion
```

Drop slides/PPTX/PDFs into `vault/inbox/<course>/`, then run the Lane A converter
(`learning-harness-lane-a/tools/intake.py`, then `convert.py`) to produce notes, or
write notes directly.

The database (`state/app.db`) holds attempts, grades, evidence and mastery. It is
**not rebuildable from the vault** — back it up with `bun run scripts/copy-db.ts`.

## Sharing

There is no built-in account system; the app trusts whoever can reach it.

- **Same Wi-Fi:** `HOST=0.0.0.0 bun run start`, then open `http://<your-lan-ip>:4747`.
  Anyone on that network gets read/write access to the vault and database, so only do
  this on a trusted network.
- **Another machine:** copy the repo plus your vault and `state/app.db`, then run with
  `HARNESS_VAULT=/path/to/vault bun run start`. Keep the repository private if the
  vault is personal.
- **Offline data only:** `bun run scripts/export-pack.ts` writes the vault plus a DB
  snapshot to `.study-pack/`. It is a read-only snapshot, not a runnable app.

## MCP (opencode or any MCP client)

One endpoint: `http://127.0.0.1:4747/mcp` (streamable HTTP). Example global config:

```json
{
  "mcp": {
    "hilum": {
      "type": "remote",
      "url": "http://127.0.0.1:4747/mcp",
      "enabled": true
    }
  }
}
```

Tool groups:

- **Vault:** `read_note`, `write_note`, `search_notes`, `list_courses`, `get_index`, `list_assets`, `update_course`
- **Teaching guide and loop:** `get_teaching_guide`, `session_start`, `get_active_session`, `get_session`, `push_activity`, `await_response`, `say`, `record_evidence`, `get_agent_requests`, `bank_activity`, `session_end`, `set_session_title`
- **Concepts:** `find_concepts`, `add_concept`, `update_concept`, `link_concepts`, `get_concept`, `get_graph`, `get_mastery`, `get_next_concepts`, `get_weak_topics`, `record_real_result`
- **Questions and exams:** `add_questions`, `import_past_paper`, `list_questions`, `get_question`, `update_question`, `verify_question`, `create_paper`, `list_papers`, `get_paper`, `get_attempt_results`
- **Grading:** `get_pending_grading`, `submit_grade`
- **Goals, plans, tasks and pacing:** `get_goal`, `update_goal`, `propose_plan`, `update_plan_item`, `propose_plan_change`, `get_coverage`, `get_pacing`, `add_task`, `update_task`, `list_tasks`

Prompts: `run_session(course)`, `grade_theory_answer(answer_id)`, `exam_debrief(attempt_id)`.
The full teaching playbook is available through `get_teaching_guide` and is
also stored in the repository root as `AGENTS.md`.

## Start a teaching session

1. `bun run start` and open `http://127.0.0.1:4747`.
2. Add cited concepts (MCP `add_concept` or the Progress screen).
3. Optionally create a goal in **Plan**, set its deadline/daily study minutes, and
   approve the generated draft plan.
4. Study tab → the frontier and due reviews show what to study next. Choose a goal
   and optional 25/45/60-minute time box when starting a session.
5. The agent calls `get_active_session`, reads `AGENTS.md` through
   `get_teaching_guide` when needed, and drives cited activities via MCP while you
   answer.
6. Pacing, coverage, carry-over, and task completion are calculated by the server.
   The agent can propose changes, but the student approves plan changes.
7. End the session (`session_end`); mastery updates from evidence automatically.

## Notes

- Concepts, questions and activities cannot be saved without citations that resolve
  against the vault (note + anchor + verbatim quote).
- Mastery is derived from evidence only; it is never edited by hand.
- Goal plans are soft proposals. Draft plans and plan changes require explicit
  student approval/application; the agent must not approve its own changes.
- Student time is measured from activity creation to answer, capped per activity;
  agent latency is excluded from pacing.
- Graph tab: 2-hop neighborhood view by default, overview mode with search; tap a node
  for its definition, citations, evidence timeline and practice bank.
- Fonts are served locally and the server makes no outbound requests.

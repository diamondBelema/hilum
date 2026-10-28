# Hilum — Exam Harness

Local-first study and exam-simulation app for medical students. A markdown vault is the
source of truth; an MCP server exposes notes, questions, exams, grading, live teaching
sessions and the knowledge graph. The app makes zero external network requests at runtime.

## Requirements

- [Bun](https://bun.sh) >= 1.4
- A modern browser (phone over LAN works)

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
`http://127.0.0.1:4317`. Use the `./start` wrapper to launch from any directory.

| Script | What it does |
| --- | --- |
| `bun run start` | Build UI + serve app and MCP on port 4317 |
| `bun run dev` | Server on 4317 + Vite dev server on 5173 |
| `bun run verify` | Typecheck + tests + smoke (UI, API, MCP) |
| `bun run test` | Unit tests |
| `bun run smoke` | Health, UI shell, MCP initialize |
| `bun run scripts/copy-db.ts` | Daily DB backup to `state/backups/` |
| `bun run scripts/export-pack.ts` | Offline data bundle in `.study-pack/` |

## Configuration

All optional; defaults are fine for local use.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4317` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` for LAN access |
| `HARNESS_VAULT` | `./vault` | Vault directory |
| `HARNESS_DB` | `./state/app.db` | SQLite database |
| `HARNESS_UPLOADS` | beside the DB | Photo-answer uploads |
| `HARNESS_MCP_TOKEN` | unset | Reserved; not enforced yet |

## Vault

Default vault: `learning-harness/vault/` (override with `HARNESS_VAULT`). It is
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

- **Same Wi-Fi:** `HOST=0.0.0.0 bun run start`, then open `http://<your-lan-ip>:4317`.
  Anyone on that network gets read/write access to the vault and database, so only do
  this on a trusted network.
- **Another machine:** copy the repo plus your vault and `state/app.db`, then run with
  `HARNESS_VAULT=/path/to/vault bun run start`. Keep the repository private if the
  vault is personal.
- **Offline data only:** `bun run scripts/export-pack.ts` writes the vault plus a DB
  snapshot to `.study-pack/`. It is a read-only snapshot, not a runnable app.

## MCP (opencode or any MCP client)

One endpoint: `http://127.0.0.1:4317/mcp` (streamable HTTP). Example global config:

```json
{
  "mcp": {
    "hilum": {
      "type": "remote",
      "url": "http://127.0.0.1:4317/mcp",
      "enabled": true
    }
  }
}
```

Tool groups:

- **Vault:** `read_note`, `write_note`, `search_notes`, `list_courses`, `get_index`, `list_assets`, `update_course`
- **Teaching loop:** `session_start`, `push_activity`, `await_response`, `record_evidence`, `get_agent_requests`, `bank_activity`, `session_end`
- **Concepts:** `find_concepts`, `add_concept`, `update_concept`, `link_concepts`, `get_concept`, `get_graph`, `get_mastery`, `get_next_concepts`, `get_weak_topics`, `record_real_result`
- **Questions and exams:** `add_questions`, `import_past_paper`, `list_questions`, `get_question`, `verify_question`, `create_paper`, `list_papers`, `get_paper`, `get_attempt_results`
- **Grading:** `get_pending_grading`, `submit_grade`

Prompts: `run_session(course)`, `grade_theory_answer(answer_id)`, `exam_debrief(attempt_id)`.

## Start a teaching session

1. `bun run start` and open `http://127.0.0.1:4317`.
2. Add cited concepts (MCP `add_concept` or the Progress screen).
3. Study tab → the frontier shows what to study next and what is due for review.
4. Click **Study this** to open a live session; the agent drives activities via MCP
   while you answer.
5. End the session (`session_end`); mastery updates from evidence automatically.

## Notes

- Concepts, questions and activities cannot be saved without citations that resolve
  against the vault (note + anchor + verbatim quote).
- Mastery is derived from evidence only; it is never edited by hand.
- Graph tab: 2-hop neighborhood view by default, overview mode with search; tap a node
  for its definition, citations, evidence timeline and practice bank.
- Fonts are served locally and the server makes no outbound requests.

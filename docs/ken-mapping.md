# ken reference mapping (M0.5)

Revised after clarification: the Exam Harness replaces ken. ken is reference material only, not a runtime dependency.

Audited at ken commit `228c4e3` (2026-07-26):

- `/home/flatplanet/GoProjects/ken/AGENTS.md`, `README.md`, `CONTENT-CREATION.md`, `ken-spec.md`
- `internal/parser/{document,concept,flashcard,quiz,notes}.go`
- `internal/lint/lint.go`, `internal/discovery/discovery.go`, `internal/progress/progress.go`
- `cmd/ken/mcp.go`, `cmd/ken/mcp_handlers.go`
- Existing content: `/home/flatplanet/Documents/learn/subjects/` (8 subjects)

## Verdict

The harness owns the app, the vault, the MCP surface, mastery and all state. Nothing calls ken at runtime.

ken is worth copying where it already solved a problem:

- Markdown + YAML frontmatter as the content format.
- `flashcard_set`, `quiz_set` and `concept_set` schemas, and the `c-` / `<subject>-` ID conventions.
- The lint rules (duplicate IDs, missing concept refs, parent cycles, empty fields).
- The idea of concept-linked evidence driving mastery.

Nothing from ken is binding. Where SPEC and ken differ, SPEC wins. Compatibility with ken is a nice-to-have for migration, not a design constraint.

## Layout

Follow SPEC section 2. The previous ken-layout constraints are withdrawn because ken discovery no longer runs.

| SPEC path | Resolved | Notes |
|---|---|---|
| `vault/` | configurable (`HARNESS_VAULT`) | harness-owned vault |
| `vault/courses/<code>/` | per SPEC | course code is the real code, e.g. `ana-211` |
| `vault/rubrics/` | per SPEC | no phantom-subject problem |
| `vault/inbox/<code>/` | per SPEC | converter input; Lane A already uses it |
| `vault/state/app.db` | **outside** the vault | vault is plain files and may be git/synced; DB is mutable. Default `~/.local/share/exam-harness/app.db`, dev override `state/app.db` |
| `vault/INDEX.md` | per SPEC | safe, no scanner to confuse |
| `<course>/assets/`, `past-questions/`, `notes/`, `slides/`, `questions/` | per SPEC | harness-owned |
| `<course>/course.md` | per SPEC | metadata, answer style, exam blueprint, exam date |

Course directory names are the real course codes. Existing ken subject directories are not used in place; they can be imported.

## Entity mapping

| SPEC entity | Reuse from ken | Verdict | Location |
|---|---|---|---|
| course | subject concept | new (SPEC schema) | `courses/<code>/course.md` |
| `INDEX.md` | none | new | root and per course |
| slides / notes | markdown notes, `[c-id]` refs, heading anchors | format borrowed | `<course>/slides/`, `<course>/notes/` |
| assets | none | new | `<course>/assets/` |
| questions | `flashcard_set` / `quiz_set` schemas where types match | format borrowed | `<course>/questions/`, SQLite |
| `mcq_single` | ken `mcq` (1-indexed options) | reuse schema | SQLite + question files |
| true/false single | ken `true_false` | reuse schema | SQLite + question files |
| `fill_blank` | ken `fill_blank` | reuse schema | SQLite |
| `tf_multi`, `theory`, `cloze`, `short_answer`, `matching`, `label_diagram` | none | new | SQLite + question files |
| past papers | none | new | `<course>/past-questions/`, SQLite |
| rubrics / answer styles | none | new | `rubrics/`, `<course>/answer-style.md` |
| concept | `concept_set` ids, names, parents, descriptions | format borrowed, model per SPEC 4B | `concepts/<id>.md` (one file per concept) |
| concept edges | `parent_id` + `relationships[]` | format borrowed | concept frontmatter |
| course groups | `groups.yaml` | optional import only | `<course>/course.md` or groups file |
| mastery | Bayesian confidence algorithm as reference | new implementation per SPEC 4B | SQLite |
| familiarity / reflection | ken layers | optional, not v1 | - |
| papers, attempts, answers, grades | none | new | SQLite |
| sessions, activities, evidence | none | new | SQLite + session notes |
| `real_results` | none | new | SQLite |
| tasks | ken task model | new (only if needed later) | SQLite |

## MCP surface

One harness-native MCP server. No ken proxy, no ken process, no `~/.local/share/ken` access.

- **Content:** `list_courses`, `get_index`, `read_note`, `search_notes`, `write_note`, `list_assets`
- **Questions:** `add_questions`, `list_questions`, `get_question`, `update_question`, `import_past_paper`
- **Exams:** `create_paper`, `get_paper`, `list_papers`, `get_attempt_results`
- **Grading:** `get_pending_grading`, `submit_grade`
- **Graph and mastery:** `find_concepts`, `add_concept`, `link_concepts`, `update_concept`, `get_concept`, `get_graph`, `get_next_concepts`, `get_weak_topics`, `get_mastery`, `record_real_result`
- **Sessions:** `session_start`, `push_activity`, `await_response`, `get_session`, `record_evidence`, `session_end`, `get_agent_requests`

Optional later: a one-way importer for ken subject folders (`concepts/`, `flashcards/`, `quizzes/`, `notes/`) so existing material moves into the harness vault.

## Format decisions

**Notes.** Keep YAML frontmatter for provenance (`source`, `pages`, `ocr`, `summary`). Emit stable heading anchors `{#s5}`. Frontmatter is always before the first heading so generic markdown renderers do not show it.

**Question formats.** Adopt the Part C schemas. Where a type matches ken (`mcq`, `true_false`, `fill_blank`), keep ken's field names (`question`, `options`, `answer`, `explanation`, `concept_id`) to ease import. Exam-only types use the Part C schemas (`stem`, `statements`, `prompt`, `model_answer`, `rubric`).

**Concepts.** One markdown file per concept at `concepts/<id>.md`, per SPEC 4B. ken's multi-concept `concept_set` files are imported by splitting them into one file per concept, preserving ids.

**Edges.** `parent_id` in frontmatter, plus typed `related`, `contrasts`, `prerequisite` arrays. The graph is rebuildable from files.

**Mastery.** SPEC 4B heuristic (evidence, decay, rollup, exam_weight). ken's Bayesian constants are a reference for later tuning, not the v1 engine. `mastery` is derived from evidence, never hand-edited.

**State.** SQLite is authoritative for questions, papers, attempts, grades, mastery, sessions and evidence. The vault holds content only. Grades and attempts never go in markdown.

**IDs.** Keep ken conventions where they exist (`c-*` concepts, `<subject>-*` cards, `<subject>-q*` questions, unique per course). Harness entities use SQLite integer ids.

**Validation.** Port ken's lint checks into the harness loader (duplicate ids, broken concept refs, parent cycles, empty required fields). Optionally run `ken lint` during import only.

## Decisions that changed from the first M0.5 draft

| # | First draft | Revised |
|---|---|---|
| 1 | ken wins on formats and mastery | SPEC wins; ken is a reference |
| 2 | Follow ken subject layout | Follow SPEC layout (`courses/<code>`) |
| 3 | Proxy ken's 27 MCP tools | Harness-native MCP only |
| 4 | Keep concepts in `concept_set` files | One concept per file (SPEC 4B) |
| 5 | Reuse ken's Bayesian mastery | SPEC 4B mastery in SQLite |
| 6 | Never write progress JSON because ken owns it | There is no ken progress JSON in this app |
| 7 | Root-level dirs break ken discovery | Not a concern; SPEC layout is safe |

## Open items for the human

1. Vault location for real use, and whether to import the existing ken subjects (anatomy, physiology, biochemistry, ...).
2. First course and its materials (SPEC section 8) - still missing.
3. Approval of this mapping (M0.5 checkpoint).

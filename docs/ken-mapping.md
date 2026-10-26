# ken mapping (M0.5)

Audit of how the Exam Harness maps onto ken. Written before M2.

Audited at ken commit `228c4e3` (2026-07-26):

- `/home/flatplanet/GoProjects/ken/AGENTS.md`, `README.md`, `CONTENT-CREATION.md`, `ken-spec.md`
- `internal/parser/{document,concept,flashcard,quiz,notes}.go`
- `internal/lint/lint.go`, `internal/discovery/discovery.go`, `internal/progress/progress.go`
- `cmd/ken/mcp.go`, `cmd/ken/mcp_handlers.go`
- Vault: `/home/flatplanet/Documents/learn/subjects/` (8 subjects, markdown + `ken.yaml`)

## Verdict

ken is the content and mastery engine. The harness adds exam simulation, grading, sessions and the knowledge graph on top. Nothing in ken's formats is replaced. The harness writes markdown files ken ignores, and reads ken's formats without rewriting them.

Three rules follow from the audit:

1. **The vault root is ken's subjects folder.** Courses are subject directories.
2. **The harness never writes ken progress JSON.** Mastery signals go through ken's MCP tools.
3. **ken has one MCP surface.** The harness proxies ken tools and adds its own, so agents connect once.

## Layout resolution

SPEC section 2 proposes a layout that would break ken discovery: `discover.Discover` treats every directory under the subjects root as a subject, so root-level `rubrics/`, `inbox/` and `state/` would appear as empty subjects.

| SPEC path | Resolved path | Reason |
|---|---|---|
| `vault/` | `~/Documents/learn/subjects/` | ken's subjects root |
| `vault/courses/<code>/` | `~/Documents/learn/subjects/<subject>/` | one directory per ken subject |
| `vault/rubrics/` | `<subject>/rubrics/` | root-level dirs become phantom subjects |
| `vault/inbox/<code>/` | `~/Documents/learn/inbox/<subject>/` | sibling of the vault, outside discovery |
| `vault/state/app.db` | `~/.local/share/exam-harness/app.db` (dev: repo `state/app.db`) | must not live under the vault |
| `vault/INDEX.md` | `~/Documents/learn/subjects/INDEX.md` | files are ignored by discovery; safe |
| `<course>/INDEX.md` | `<subject>/INDEX.md` | safe, ken only scans `concepts/`, `flashcards/`, `quizzes/`, `notes/` |
| `<course>/assets/` | `<subject>/assets/` | unknown subdirectory, ignored by ken |
| `<course>/past-questions/` | `<subject>/past-questions/` | unknown subdirectory, ignored by ken |
| `<course>/course.md` | `<subject>/course.md` | new file next to `ken.yaml`; ignored by ken |

**Course identity:** reuse the existing subject directory names (`anatomy`, `renal-physiology`, ...), not new codes like `ana-301`. The real course code goes in `course.md` as `code:`.

## Entity mapping

| SPEC entity | ken reality | Verdict | Location |
|---|---|---|---|
| course | subject directory + `ken.yaml` manifest | reuse | `<subject>/` |
| `course.md` | none (manifest has id/name/description only) | new | `<subject>/course.md` |
| `INDEX.md` (root and per course) | none | new | `<subject>/INDEX.md`, subjects root |
| slides/ and notes/ | `notes/*.md`, read by `ken read`, concept refs `[c-id]` | reuse | `<subject>/notes/` |
| figures and page images | none | new | `<subject>/assets/` |
| converted tables, text, OCR flags | plain markdown in `notes/` | reuse | `<subject>/notes/` |
| `past-questions/` | none | new | `<subject>/past-questions/` |
| `rubrics/` | none | new | `<subject>/rubrics/` |
| flashcards | `flashcards/*.md`, `type: flashcard_set` | reuse | `<subject>/flashcards/` |
| cloze | none (ken has `fill_blank`, not cloze) | new type | `flashcards/` frontmatter or harness questions |
| MCQ (single) | `quizzes/*.md`, `type: mcq` (1-indexed answer) | reuse | `<subject>/quizzes/` |
| true/false (single statement) | `quizzes/*.md`, `type: true_false` | reuse | `<subject>/quizzes/` |
| `tf_multi` | none | new | `<subject>/questions/` + SQLite |
| `theory`, `short_answer`, `matching`, `label_diagram` | none | new | `<subject>/questions/` + SQLite |
| concept | `concepts/*.md`, `type: concept_set`, frontmatter array | reuse | `<subject>/concepts/` |
| concept edges | `parent_id` + `relationships[]` (`type`, `target`) | extend | concept frontmatter |
| course groups | `groups.yaml` | reuse | `<subject>/groups.yaml` |
| mastery (concept confidence) | Bayesian confidence in `~/.local/share/ken/<subject>.json` | reuse | via ken MCP |
| familiarity, reflection | per-concept state in progress JSON | reuse | via ken MCP |
| papers, attempts, answers, grades | none | new | SQLite (`state/app.db`) |
| live sessions, activities, evidence | none | new | SQLite + session notes |
| `real_results` (CA/exam calibration) | none | new | SQLite |
| tasks | `tasks.json` + ken task tools | reuse | ken MCP (out of harness scope) |
| registry packages | `ken.yaml`, registry | reuse | untouched |

## MCP surface

ken exposes 27 tools via `ken mcp` (stdio) and `ken mcp --http`.

**Reuse unchanged (proxied by the harness):**

| Group | Tools |
|---|---|
| Subjects | `list_subjects`, `get_subject_overview`, `get_subject_content` |
| Concepts | `get_concepts`, `get_concept`, `search_concepts`, `get_weak_concepts`, `get_course_groups` |
| Study state | `get_due_items`, `get_flashcards`, `get_quiz_questions`, `get_notes`, `save_note`, `save_summary` |
| Grading signals | `record_flashcard_grade`, `record_quiz_answer`, `update_familiarity`, `update_reflection` |
| Validation | `lint_subject` |
| Planning | `plan_study_session`, `get_study_recommendation` |
| Tasks | `create_task`, `complete_task`, `get_tasks`, `get_overdue_tasks`, `get_today_tasks`, `delete_task` |

**New harness tools:**

| Group | Tools |
|---|---|
| Content | `get_index`, `read_note`, `search_notes`, `write_note`, `list_assets` |
| Questions | `add_questions`, `list_questions`, `get_question`, `update_question`, `import_past_paper` |
| Exams | `create_paper`, `get_paper`, `list_papers`, `get_attempt_results` |
| Grading | `get_pending_grading`, `submit_grade` |
| Graph | `find_concepts`, `add_concept`, `link_concepts`, `update_concept`, `get_graph`, `get_next_concepts`, `record_real_result` |
| Sessions | `session_start`, `push_activity`, `await_response`, `get_session`, `record_evidence`, `session_end`, `get_agent_requests` |

Naming conflicts: SPEC's `get_weak_topics` and `get_mastery` duplicate ken's `get_weak_concepts` and `get_concepts`. Reuse ken's names; add `get_next_concepts` as the deterministic frontier. `list_courses` maps to `list_subjects` (reuse the ken name).

**Proxy decision:** the harness starts `ken mcp` over stdio with the SDK client and re-exports its tools, prefix-free, from the harness server. This keeps one endpoint, reuses ken's Bayesian updates and progress writes, and avoids reimplementing ken logic in TypeScript. If the proxy fails, the harness still serves its own tools and reports ken tools as unavailable.

## Format decisions

**Notes.** SPEC frontmatter is compatible with ken: `ParseTaggedNote` drops all lines before the first `#` heading, so YAML frontmatter never renders in `ken read`. Keep the title as the first heading. Anchors emitted as `## Slide 5 — Title {#s5}` survive ken but show the literal `{#s5}` suffix in the ken TUI; accepted as cosmetic, harness strips it for display. Do not use `[c-...]` in slide headings unless the heading really maps to a concept.

**Question types.** ken quizzes support only `mcq`, `true_false`, `fill_blank`; unknown types are skipped with a warning. Exam types (`tf_multi`, `theory`, and later `matching`, `label_diagram`) live in `<subject>/questions/*.md` in the SPEC Part C format and are indexed into SQLite. Simple items that map cleanly (`mcq_single` → `mcq`, self-rated cards → `flashcards`) are written in ken format so ken and offline mode can use them.

**Concepts.** Keep ken's `concept_set` file format (multiple concepts per file, body sections `## <id>`). Add optional fields (`aliases`, `prerequisites`, `related`, `contrasts`, `exam_weight`, `cites`, `status`) to each concept entry; ken's parser reads only known keys, so extras are inert. `parent_id` is the hierarchy; `relationships[]` carries prerequisite/related/contrasts edges. SPEC 4B's one-file-per-concept model is rejected.

**Rubrics and answer styles.** New files under `<subject>/rubrics/` and `<subject>/answer-style.md`; referenced by name from `course.md` and question `rubric` fields. No ken equivalent, no conflict.

**Mastery.** SPEC 2A calls it SM-2; ken actually uses Bayesian confidence with per-concept familiarity/reflection layers (`internal/mastery/mastery.go`, constants in `ken-spec.md`). ken wins. Harness evidence stays in its own tables and is mapped to ken concept confidence at grade time through `record_flashcard_grade` / `record_quiz_answer` where a ken item exists. Harness-only items (theory, tf_multi) update harness mastery and are reconciled to concepts; two ledgers exist but only ken's is authoritative for ken-backed study.

**Progress state.** `~/.local/share/ken/<subject>.json` is written only by ken. The harness must not edit it directly: it has no cross-process lock and a write would race the TUI. All writes go through ken MCP tools.

**ID conventions.** Keep ken's: concepts `c-*`, cards `<subject>-*`, questions `<subject>-q*`, unique per subject across all files. Harness IDs (papers, attempts, sessions, activities) are SQLite integers/UUIDs and never reuse ken ID namespaces.

**Lint.** `lint_subject` stays the validator for ken files. Harness adds validation for its new question/paper formats; converter output must pass `ken lint <subject>` on the target course before it is accepted.

## Conflicts and decisions

| # | Conflict | Decision |
|---|---|---|
| 1 | SPEC says SM-2; ken uses Bayesian confidence | ken wins; do not build a second scheduler for ken items |
| 2 | SPEC vault layout vs ken subject layout | ken layout wins; new dirs go inside a subject or outside the vault |
| 3 | SPEC one file per concept vs `concept_set` | ken wins; extend concept entries instead |
| 4 | Root-level `rubrics/`, `inbox/`, `state/` become phantom ken subjects | move to `<subject>/rubrics/`, `~/Documents/learn/inbox/`, XDG data dir |
| 5 | SPEC puts `state/app.db` in the vault | keep it outside; back up daily |
| 6 | ken skips unknown quiz types | exam-only types never go in `quizzes/` |
| 7 | Two MCP servers for agents | harness proxies ken over stdio, one endpoint |
| 8 | SPEC notes/summaries are vault files; ken keeps them in progress JSON | reuse ken tools; do not duplicate personal notes in the vault |
| 9 | `get_weak_topics` duplicates `get_weak_concepts` | reuse ken's name; graph frontier is `get_next_concepts` |
| 10 | Course codes (`ana-301`) absent from ken subject names | reuse directory names; real code lives in `course.md` |
| 11 | ken never writes the content tree; harness will write notes | safe (ken only reads); writes are confined to `<subject>/notes/`, `assets/`, `questions/`, `past-questions/`, `rubrics/` |
| 12 | Anchors `{#s5}` show literally in the ken TUI | accept; strip for harness display |

## Open items for the human

1. Confirm the first course and supply its slides/past papers (SPEC section 8) - still missing.
2. Confirm proxying ken MCP is acceptable versus reimplementing its tools.
3. Confirm exam-only question files under `<subject>/questions/` are acceptable additions in the content tree.

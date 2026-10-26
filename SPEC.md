# Exam Harness v1 — Build Spec

A local-first content harness and exam-simulation engine. It contains **no AI model**. External agents (Claude, opencode/DeepSeek, any MCP client) teach, write questions and grade through an MCP server. Markdown is the source of truth.

**Build window:** two days. After that, bug fixes only while studying.

## 0. Goals and non-goals

**Goals**

1. Convert slides and past questions into token-cheap, well-indexed markdown (Part A, do first).
2. Let any MCP agent read the vault, write notes and questions, and grade theory answers.
3. Run realistic exam simulations: true/false, MCQ and theory, under timer pressure, with course-specific answer structure.
4. Ship many defaults (question types, rubrics, exam modes) so nothing has to be invented before studying.

**Non-goals for v1**

- No built-in LLM or agent loop. No on-device models. No accounts or cloud sync.
- No arbitrary generated code or UI: agents may only use the ActivitySpec catalog in section 9.
- No fancy spaced-repetition scheduler. Weak-topic ranking only.

## 1. Locked decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Form factor | Local web app, not a TUI | Needs images (anatomy), countdown timers, long-form answer editors, side-by-side marking. A TUI cannot do these well. |
| Language | TypeScript everywhere in the app | Most reliable for coding agents; one language for server and UI. |
| Runtime | Bun (or Node 22 if Bun gives trouble) | Fast start, built-in SQLite and test runner. |
| Server | Hono, single process | Hosts MCP, HTTP API and static UI together. |
| UI | Vite + React + Tailwind | Agents build this fastest and most reliably. |
| Storage | Markdown vault on disk (truth) + SQLite (index and state) | SQLite can be deleted and rebuilt from the vault, except attempts/grades. |
| MCP | Official TypeScript MCP SDK, stdio and streamable HTTP | Every capability is an MCP tool. |
| Delivery | Runs on the laptop; phone opens it over LAN as a PWA | Tauri/desktop wrapper is optional later. |

Accept the tradeoff: the server must be running to study. A single `bun run start` command is the requirement.

## 2A. Relationship to ken (read first)

ken already exists and must be reused, not rebuilt: markdown-with-frontmatter flashcards and quizzes per subject folder, SM-2 state in progress.json, a concepts layer with parent ids, notes/summaries/diagrams/links, the familiarity, understanding, mastery flow, course groups, and an MCP server.

- **The vault is ken's subjects folder.** Courses are ken subjects. Where Part C formats differ from ken's, ken's formats win. Add only what ken lacks: exam question types with rubrics, papers, attempts, and live sessions.
- **M0.5 (first hour, before anything else):** the builder agent audits ken's format docs, ken lint rules and MCP tool list, then writes docs/ken-mapping.md: which entities map to existing ken files, which are new, which ken tools to reuse, and any conflict. Do not start M2 until this exists.
- **One MCP surface for agents.** Default: the new server passes ken's content tools through and adds the new tools, so an agent connects to one server. The mapping doc records the final choice.
- The Go TUI and the Android app stay untouched. The new app only reads and writes the same files, so both keep working.
- The vault layout in section 2 is a proposal. ken's layout wins on any conflict.

## 2. Vault layout

```
vault/
  INDEX.md                      # root index: courses + one line each
  rubrics/                      # answer-structure templates (data, not code)
    anatomy-structured.md
    physiology-structured.md
    biochemistry-structured.md
  courses/
    <course-code>/              # e.g. ana-301
      course.md                 # metadata (see Part C)
      INDEX.md                  # table of every note: path, summary, tags, tokens
      slides/                   # converted lecture notes
      notes/                    # agent- or user-written notes
      past-questions/           # structured question files per paper/year
      assets/                   # extracted figures and page images
inbox/<course-code>/            # raw PDFs/PPTX dropped here, never edited
state/app.db                    # SQLite
```

Rules: the vault is plain files. Never store grades or attempts in markdown. Paths are always relative to the vault root.

## 3. Part A — Conversion pipeline (today's task)

Build a standalone Python tool, `tools/convert.py`, separate from the TypeScript app. Input: `inbox/<course-code>/*`. Output: the vault.

### 3.1 Requirements

1. **One lecture → one or more topic notes.** Split at heading boundaries so every note is at most about 1,500 tokens (roughly 1,100 words). Never split mid-table or mid-list.
2. **Slides:** keep order. Use `## Slide N — <title>`. Keep speaker notes if present, under `> Notes:`.
3. **Tables** become markdown tables. **Equations** become plain text or LaTeX. **Lists** stay lists.
4. **Figures:** export each figure or slide image to `assets/` with a stable id (`<lecture>-p<page>-f<n>.png`). Reference it in the note as `![<id>](../assets/<file>)`. If no vision model is available, add the flag `<!-- needs-description -->` after the image. Never silently drop a figure. Classify every page: (a) text-layer page, convert normally; (b) image-only page, run OCR, and if OCR confidence is low or the page is mostly a diagram, flag it with the comment \<!-- needs-transcription -->; (c) mixed page, keep the text, embed the figure, and flag the figure with \<!-- needs-description -->. For every flagged page, render a full-page PNG to assets/pages/\<lecture>-p\<page>.png and add a line to courses/\<code>/VISION\_QUEUE.md (note path, page, PNG path, flag type, status: todo). The app renders embedded images straight from the asset files, so no image is lost even before it is transcribed. Vision pass (a separate step, not part of the converter): a vision-capable agent works through VISION\_QUEUE.md, reads each PNG file directly, writes the transcription or description into the note next to the image (for a diagram: its title, every label as a list, and what it shows), removes the flag and marks the queue line done. A browser or Playwright MCP is not required for this; it is only a fallback if the agent can see pages only through a browser, and it still needs a vision-capable model.
5. **Scanned pages:** detect pages with no text layer and OCR them (Tesseract). Mark OCR'd notes `ocr: true` in frontmatter, if the OCR'd notes produce random gabbage then view the image your self and write wha you see if any diagrams then embed that image in the markdown.
6. **Past questions:** parse into the structured question format in Part C. If a paper cannot be parsed, keep the raw markdown in `past-questions/raw/` and list it in the report.
7. **Provenance:** every note's frontmatter records source file and page range.
8. **Indexes:** generate `courses/<code>/INDEX.md` (path, one-line summary, tags, token estimate) and the root `INDEX.md`. Summaries can be extractive in v1 (first sentence or heading); an agent can improve them later via MCP.
9. **Idempotent:** re-running on the same input produces the same output and does not duplicate files.
10. **Report:** write `REPORT.md` per run: pages in vs pages covered, figures exported, OCR pages, flagged items, notes over the token limit.

### 3.2 Suggested tooling (agent may substitute)

PyMuPDF or pymupdf4llm for text and images, marker or docling for hard layouts, Tesseract for OCR, python-pptx for PPTX. Token estimate: characters divided by 4 is fine.

### 3.3 Acceptance criteria

- Every input page appears in exactly one output note or is listed as skipped in `REPORT.md`.
- No note exceeds 1,800 estimated tokens.
- Every figure has an asset file and a reference, and every flagged page has a PNG in assets/pages/ and a line in VISION\_QUEUE.md.
- Tables from a sample slide deck survive as valid markdown tables.
- Running the tool twice yields no diff.
- `INDEX.md` lists every note with a non-empty summary.
- A 100-slide deck converts in under 2 minutes on a laptop.

### 3.4 Token-saving rule for all agents

An agent must read `INDEX.md` first, then only the notes it needs. Never read whole PDFs.

## 4. Part B — Architecture

### 4.1 Components

```
[Markdown vault] <--> [VaultService + Indexer] <--> [SQLite: FTS5 index, questions, attempts, grades, mastery]
                                   |
                     Core services (shared)
                     QuestionBank · ExamEngine · GradingQueue · MasteryLedger
                         |                              |
                   [MCP server]                   [HTTP API + SSE]
                (stdio + streamable HTTP)               |
                         |                         [Web UI]
                 external AI agents
```

Both the MCP server and the HTTP API call the same core services. No business logic lives in either layer.

### 4.2 Data model (SQLite)

- `courses(code, title, department, answer_style, exam_blueprint_json)`
- `notes(path, course, title, summary, tags, tokens, source, updated_at)` + FTS5 table over title/body
- `questions(id, course, type, topic_tags, difficulty, marks, body_json, source_paper, created_by)`
- `papers(id, course, title, blueprint_json, mode, duration_sec, created_at)`
- `paper_items(paper_id, question_id, section, position)`
- `attempts(id, paper_id, started_at, submitted_at, status, duration_used_sec)`
- `answers(id, attempt_id, question_id, response_json, time_spent_sec, flagged, auto_score, status)` — status: `auto_graded | pending_grading | graded`
- `grades(answer_id, rubric_scores_json, total, feedback_md, mistake_tags, graded_by, graded_at)`
- `mastery(course, topic, score, last_seen, evidence_count)`
- `activities(id, course, spec_json, created_at)` (stretch)

Attempts and grades are the only data that cannot be rebuilt from the vault. Back up `state/app.db` daily (copy file).

### 4.3 Question types (defaults)

Exam types (required):

1. **tf\_multi** — a stem with 4–5 statements; the student marks each True or False. Scoring option per question: `per_statement` (default) or `all_or_nothing`.
2. **mcq\_single** — best answer from 4–5 options. Optional negative marking.
3. **theory** — long-form answer graded against a rubric and model answer.

Study types (defaults, lower priority): 4. **flashcard** (front/back, self-rated), 5. **cloze**, 6. **short\_answer** (agent-graded), 7. **matching**, 8. **label\_diagram** (image with numbered targets; stretch).

In the live model these types are components of the activity catalog (section 9A), not separate content systems. Objective types are graded deterministically in the app. Theory and short\_answer go to the grading queue.

### 4.4 Exam simulation (the core feature)

**Paper builder.** Input is a blueprint: counts per type, topic weights, difficulty mix, marks, duration. Output is a paper drawn from the question bank. Default blueprints are stored per course in `course.md` and can mirror the real paper (for example Section A true/false, Section B MCQ, Section C theory).

**Modes**

- **Strict:** visible countdown, per-section timers, auto-submit at zero, autosave on every answer, no notes, optional no-back-navigation.
- **Sectioned:** matches the real paper; each section has its own timer and locks when time is up.
- **Practice:** soft timer, can peek at the model answer after answering.

**Pressure features:** pace indicator (marks per minute remaining vs needed), flag-for-review, a final review screen, and a short distraction-free layout.

**After submission:** score by section, time per question, flagged vs unflagged accuracy, and a mistake taxonomy: `knowledge_gap | misread_question | wrong_structure | ran_out_of_time | careless`. Objective items are tagged automatically (for example a chosen distractor linked to a topic). Theory items are tagged by the grader through MCP.

### 4.5 Theory answer structure (rubrics as data)

Each course sets `answer_style` in `course.md`, pointing to a rubric template in `rubrics/`. A rubric defines the required headings in order, what earns marks under each, mark allocation, and command-word guidance (describe, explain, discuss, outline).

Ship these **drafts** and mark them `status: draft — replace with lecturer-specific research`:

- `anatomy-structured`: origin, insertion, nerve supply, blood supply, actions, relations, clinical anatomy.
- `physiology-structured`: definition, mechanism, regulation, factors affecting, clinical significance.
- `biochemistry-structured`: definition, pathway/reaction, enzymes and regulation, energetics, clinical correlation.

Diamond's per-course research replaces these. The grader must score structure and content separately.

### 4.6 Grading flow without an internal model

1. Student submits theory answers. Status becomes `pending_grading`. The UI shows "awaiting grading".
2. An external agent calls `get_pending_grading`, which returns each answer with the question, rubric, model answer and the student's response.
3. The agent calls `submit_grade` with per-rubric-item marks, feedback and mistake tags.
4. The UI shows the graded result immediately via SSE.

**Fallbacks (required):** a "Copy grading prompt" button that copies a self-contained prompt for any chat agent, and a "Paste grade JSON" box that validates against the `submit_grade` schema. The app must never depend on one specific agent being connected.

### 4.7 MCP surface

Transports: stdio and streamable HTTP. LAN HTTP requires a bearer token from settings. All tool inputs are validated with Zod. All write tools accept an optional `request_id` for idempotency.

**Content**

- `list_courses()`
- `get_index(course)` — returns INDEX.md content
- `read_note(path)`
- `search_notes(query, course?, limit?)` — FTS5
- `write_note(path, content, mode: create|append|replace)` — validates frontmatter, confines to `vault/`, blocks path traversal
- `list_assets(course)`

**Questions**

- `add_questions(items[])` — batch, validated per type
- `list_questions(filter)`, `get_question(id)`, `update_question(id, patch)`
- `import_past_paper(course, year, markdown)`

**Exams**

- `create_paper(course, blueprint)`, `get_paper(id)`, `list_papers(course)`
- `get_attempt_results(attempt_id)`

**Grading**

- `get_pending_grading(limit?)`
- `submit_grade(answer_id, rubric_scores[], feedback, mistake_tags[])`

**Mastery**

- `get_weak_topics(course, n)`, `get_mastery(course)`

**MCP resources:** every note as `vault://<path>`.

**MCP prompts (shipped defaults):** `teach_topic(course, topic)`, `write_exam_questions(course, topic, count, type)` (uses past papers for style), `grade_theory_answer(answer_id)`, `post_exam_debrief(attempt_id)`.

### 4.8 UI screens

1. **Dashboard:** courses, weak topics, next suggested action.
2. **Notes reader:** rendered markdown, images, search, table of contents.
3. **Question bank:** filter by type/topic/source; preview; edit.
4. **Exam builder:** blueprint form with defaults per course.
5. **Exam runner:** timers, flagging, review screen, autosave.
6. **Results and debrief:** section scores, time per question, mistake taxonomy.
7. **Grading queue:** pending items, copy-prompt button, paste-JSON box.
8. **Settings:** vault path, MCP token, LAN toggle.

UI rules: dense, fast, keyboard-friendly, dark mode, usable at 380 px width.

### 4.9 Non-functional requirements

- Local-first; works offline; no external network calls from the server.
- Cold start under 2 seconds; note open under 100 ms.
- Exam runner survives a page reload or crash with timer and answers intact.
- Deterministic scoring for objective types, covered by unit tests.
- Vault watcher reindexes on file change within 2 seconds.

## 4A. Teaching sessions and the live agent link (core)

The harness teaches as well as examines. In a teaching session the student uses the app while an external agent (in opencode or any MCP client) drives: it plans, probes understanding, pushes activities into the app, reads the responses and adapts. The app is the surface, the agent is the brain, and the vault plus the mastery ledger are the memory. Exam simulation (4.4) stays deterministic and needs no agent while running.

### Session loop (agent side)

1. session\_start(course, goal?) returns the session id, a mastery snapshot, due items and the last session summary.
2. Read INDEX.md, then only the notes needed.
3. Probe: push\_activity(session\_id, spec) with an ActivitySpec (section 9), for example 3 quick questions, a confidence rating and a think-aloud box.
4. await\_response(session\_id, timeout\_s up to 25) returns the student's responses or "pending"; the agent loops.
5. Diagnose, then teach. The agent picks the method per step: note excerpt, worked example, predict-then-reveal, spot-the-error, teach-back, flashcards, quiz items, exam-style items, or custom blocks.
6. The app records every result as a standard evidence record (concept ids, response, correct or not, confidence, time, reasoning text). The agent may add diagnosis tags with record\_evidence.
7. session\_end(session\_id, summary\_md) writes a session log note and updates mastery; the next session starts from it.

Rule: the format is free, the evidence record is fixed. That keeps mastery tracking working for any activity an agent invents.

### New MCP tools

session\_start, push\_activity, await\_response, get\_session, record\_evidence, session\_end, get\_agent\_requests.

The UI can also send requests to the agent (buttons on a note or question: explain, quiz me, I am confused). They are stored and returned by get\_agent\_requests. An "agent connected" indicator shows live status.

### Offline mode

With no agent connected, the app still runs the defaults: SM-2 flashcards, quizzes, exam simulations and the notes reader. Nothing may depend on an agent being present.

### Making any agent know what to do

- **AGENTS.md** at the repo and vault root (opencode reads it): one page. It says the agent is the teacher of this harness and gives the start sequence (session\_start, read INDEX, probe, loop), the evidence rule and the accuracy rule below.
- **MCP server instructions** in the initialize result: a 10-line summary of the same protocol, so agents that ignore AGENTS.md still get it.
- **MCP prompts and resource:** run\_session(course), exam\_debrief(attempt\_id), and the full protocol at harness://protocol.

### Sub-agents (opencode)

Define narrow roles as separate opencode agents (check opencode's current docs for the file format), each with only the tools it needs:

| Role | Job | Tools it needs |
| --- | --- | --- |
| Teacher (main) | Runs the session loop | session, notes, activity tools |
| Question writer | Writes questions in the lecturer's style from past papers | add\_questions, read\_note |
| Grader | Grades theory answers against rubrics | get\_pending\_grading, submit\_grade |
| Transcriber | Works through VISION\_QUEUE.md (needs a vision model) | read\_note, write\_note |
| Auditor | Samples agent-written notes and questions for errors | read\_note, list\_questions |

### Accuracy rule (medical content)

Agent-written notes and questions can be wrong. Every agent-authored note, question or activity must carry citations that the server validates (section 9A), or be marked unverified: true. The auditor samples unverified items first, and unverified items are excluded from exam papers unless the student opts in.

### Priority if time runs short

Exam runner first, conversion and the ken audit second, live agent link third, knowledge graph (4B) fourth, everything else after. Never cut the exam runner.

## 4B. Knowledge graph and mastery

The graph is the teacher's map. It says what there is to learn, how concepts depend on each other, where the student stands on each, and what to teach next. Sessions, activities, exam results and notes all attach to it.

### Nodes and edges

- A **concept** is a markdown file, concepts/\<id>.md. ken's concepts layer already has ids and parent\_id; confirm the exact format in M0.5. Frontmatter: id, title, aliases, parent, prerequisites, related, contrasts, topics, exam\_weight, cites (section 9A), status (proposed or accepted). Body: a short definition.
- **Edge types:** parent (hierarchy), prerequisite, related, contrasts\_with. Edges live in the concept's frontmatter, so the graph is plain files and can always be rebuilt.
- No cite, no concept. A concept from the model's own knowledge is marked unverified.

### How the graph is built

1. The extractor sub-agent reads INDEX.md and the notes and proposes concepts and edges, each with cites. It must actively look for cross-links: related and contrasts\_with edges between concepts in different subtrees (for example ADH appearing in both a renal and an endocrine course). The teacher keeps adding cross-links as it teaches.
2. Before creating a concept it must call find\_concepts (fuzzy match on titles and aliases) so that "loop of Henle" and "Henle's loop" become one concept with an alias.
3. New concepts are status: proposed. The UI has a review queue: accept, merge, edit or reject, with bulk-accept per lecture. The teacher may use proposed concepts but flags them.
4. During a session the teacher may add concepts or edges it discovers, under the same rules.

### Evidence connects everything

Every activity result is an evidence record: session, activity, concept ids, kind, correct or not, confidence, time, a response excerpt and a timestamp. Exam answers are evidence too. So the chain is concept to evidence to session (or exam attempt). A session note lists the concepts it touched, and a concept page lists every session and exam item that touched it. No separate link table is needed.

### Data model additions (replace the mastery table in 4.2)

- concepts(id, course, title, aliases, parent\_id, status, exam\_weight): an index of the concept files
- edges(from\_id, to\_id, type)
- sessions(id, course, started\_at, ended\_at, summary\_note\_path)
- evidence(id, session\_id, activity\_id, answer\_id, concept\_id, kind, correct, confidence, time\_sec, excerpt, created\_at)
- mastery(concept\_id, state, score, last\_evidence\_at, decay\_due\_at, evidence\_count): derived from evidence, never edited by hand
- real\_results(course, kind, score, max, date, notes)

### Mastery (v1 heuristic, thresholds in config)

| State | Rule |
| --- | --- |
| unseen | no evidence |
| familiar | read or seen, or answered with low accuracy |
| understood | correct explanation or application at least 2 times, across at least 2 activity types, with confidence matching accuracy |
| mastered | understood, plus correct under timed exam-style conditions at least once, at least 80% accuracy over the last 5 pieces of evidence, and not decayed |

**Decay:** mastery expires. Each concept has a decay\_due\_at set from SM-2 style intervals on its banked retrieval items (or a default interval). Past that date the state drops one level and the concept returns to the review queue. Parent concepts roll up from their children, weighted by exam\_weight.

**Calibration:** the app logs the student's real CA and exam scores per course (record\_real\_result) so predicted mastery can be compared with reality and thresholds tuned. Any exam-readiness figure is an estimate, never a promise. ken's Bayesian rule can replace this heuristic later.

### Choosing what to teach next (deterministic, not the agent's guess)

get\_next\_concepts(course, n) returns the frontier: concepts that are not mastered, whose prerequisites are at least understood, ranked by exam\_weight, decay urgency and recent errors. The teacher takes the top items, teaches, collects evidence and repeats. A course counts as done when every concept above the exam\_weight cutoff is mastered and no decay review is overdue.

### Exam weight

Past-paper questions are tagged with concept ids (by the question-writer or extractor, with cites). exam\_weight is the share of marks across past papers that touch the concept, with a small floor so untested concepts are not ignored.

### UI

- **Tree view (default):** the parent hierarchy with a mastery bar per node and a rollup per subtree. This is the most useful daily view.
- **Frontier view:** the next 10 concepts and why each was chosen.
- **Graph view:** force-directed (Cytoscape.js or d3-force). Color is mastery state, size is exam\_weight, dashed lines are prerequisites. Filter by course and topic, collapse subtrees, cap at about 300 visible nodes. The graph exists because a tree cannot show cross-links between concepts in different subtrees. Its default mode is the neighborhood view: pick a concept and see everything within 2 hops across all edge types, including cross-links. The full-graph view is for overview. The tree and the frontier stay as the outline and the to-do list.
- **Concept drawer:** definition, citation links, the evidence timeline with links to sessions, banked items, and a suggested next activity.

### MCP tools added

find\_concepts, add\_concept, link\_concepts, update\_concept, get\_concept, get\_graph(course, filter), get\_next\_concepts(course, n), record\_real\_result. get\_weak\_topics (4.7) becomes a view over the graph.

### Scope warning

Decision: everything from M0 to M6b is built inside the two-day window, with an unattended overnight run. The run rules are in section 6A. The freeze starts after M6b. If M5 (the exam engine) is not passing its acceptance tests by the end of day 2, stop adding features and fix M5 before anything else.

## 5. Part C — File formats

**Note frontmatter**

```yaml
---
course: phy-301
title: Tubular transport of sodium
topics: [renal, nephron, sodium]
source: inbox/phy-301/lecture-05.pdf
pages: 12-18
ocr: false
summary: One-line summary
---
```

**course.md**

```yaml
---
code: phy-301
title: Renal Physiology
department: physiology
answer_style: physiology-structured
exam_blueprint:
  - {section: A, type: tf_multi, count: 10, minutes: 15, marks_each: 1}
  - {section: B, type: mcq_single, count: 30, minutes: 30, marks_each: 1}
  - {section: C, type: theory, count: 3, minutes: 60, marks_each: 10}
---
```

(Blueprint values above are placeholders; replace with the real paper format.)

**Question files** (`past-questions/<year>.md` or imported into SQLite)

```yaml
- id: phy301-2024-a1
  type: tf_multi
  topics: [renal, nephron]
  marks: 5
  stem: Concerning the proximal convoluted tubule:
  statements:
    - {text: "Most filtered sodium is reabsorbed here.", answer: true}
    - {text: "...", answer: false}
  explanation: "..."
- id: phy301-2024-b1
  type: mcq_single
  stem: "..."
  options: {A: "...", B: "...", C: "...", D: "..."}
  answer: C
  explanation: "..."
- id: phy301-2024-c1
  type: theory
  marks: 10
  prompt: "Describe the countercurrent mechanism."
  model_answer: "..."
  rubric: physiology-structured
```

**Rubric template**

```yaml
name: physiology-structured
status: draft
sections:
  - {heading: Definition, marks: 1, expects: "concise, precise definition"}
  - {heading: Mechanism, marks: 4, expects: "stepwise, causal"}
  - {heading: Regulation, marks: 2}
  - {heading: Clinical significance, marks: 1}
command_words:
  describe: "state features and sequence"
  explain: "give causes and mechanism"
  discuss: "balanced points with reasoning"
```

**submit\_grade payload**

```json
{"answer_id": 123, "rubric_scores": [{"heading": "Mechanism", "awarded": 3, "max": 4, "comment": "missed ADH step"}], "feedback": "...", "mistake_tags": ["wrong_structure"]}
```

## 6. Build order and acceptance criteria

### Day 1

**M0 — Scaffold.** Repo, Bun, Hono, Vite+React, SQLite, test runner, `bun run start`. *Accept:* one command serves UI and `/mcp`.

**M0.5 — ken audit.** Write docs/ken-mapping.md (section 2A). *Accept:* every entity in this spec is marked reuse, extend or new, with ken file paths; conflicts are listed with a decision.

**M1 — Conversion tool (Part A).** *Accept:* all Part A criteria on one real course.

**M2 — Vault and index.** VaultService, indexer, FTS5, watcher, MCP content tools, notes reader. *Accept:* `get_index` returns in under 200 ms for 500 notes; `search_notes` returns ranked hits; an MCP client can read and write a note; path traversal attempts are rejected.

### Day 2

**M3 — Question bank.** Schema, `add_questions`, `import_past_paper`, browser UI. *Accept:* all three exam types validate and render; invalid items are rejected with clear errors.

**M4 — Exam engine.** Paper builder, runner, three modes, autosave, auto-submit, deterministic grading for tf\_multi and mcq\_single. *Accept:* reload mid-exam restores timer and answers; auto-submit fires at zero; scoring unit tests pass for per-statement and all-or-nothing.

**M5 — Grading queue and results.** Pending queue, `get_pending_grading`, `submit_grade`, copy-prompt button, paste-JSON box, results and debrief with mistake taxonomy. *Accept:* an external MCP client can grade a theory answer end to end; the UI updates without refresh.

**M5b — Live session link (section 4A).** session tools, ActivitySpec renderer, agent-connected indicator, AGENTS.md, MCP server instructions, run\_session prompt. *Accept:* push\_activity shows in the UI within 1 second; the student's answer reaches await\_response within 1 second; with the agent disconnected the UI shows offline and the defaults still run; a fresh opencode session given only AGENTS.md calls session\_start without being told to.

**M6 — Mastery and weak topics.** *Accept:* `get_weak_topics` ranks topics from attempt results.

**M6b — Knowledge graph (section 4B).** Concept files, edges, extractor flow with find-before-add, evidence to mastery derivation with decay, get\_next\_concepts, tree, frontier and graph views, review queue. *Accept:* a concept cannot be saved without valid cites; duplicate titles are caught by find\_concepts; mastery state for a seeded evidence set matches the rules in 4B (unit tests); get\_next\_concepts never returns a concept whose prerequisites are below understood; opening a concept shows its sessions and evidence.

**Freeze.** After M6, bug fixes only for one week.

### Stretch (only after the freeze)

label\_diagram, MCP Apps, Tauri wrapper.

## 6A. Unattended build plan (two days, overnight run)

Export this document as Markdown into the repo as SPEC.md before starting. The agents build; the human reviews at checkpoints. The run must keep going safely without supervision and stop cleanly when stuck.

### Lanes (parallel, separate git worktrees)

- **Lane A (Python):** the converter and vision-queue tooling (M1). Independent of everything else.
- **Lane B (TypeScript core):** M0, M0.5, M2, M3, M4, M5 in that order (server, SQLite, MCP, exam engine).
- **Lane C (UI):** starts when the M3 schema is frozen. Builds the screens and ActivitySpec components against a mock server, then merges once the M4 API is stable.
- **Then in sequence:** M5b (live link), then M6b (knowledge graph), because both depend on lanes B and C.

### Gate rules

1. A milestone is done only when bun run verify passes: unit tests, MCP contract tests and a headless UI smoke test.
2. Commit and tag at each milestone (for example m4-pass). The next milestone branches from the tag.
3. Maximum 3 fix attempts per failing test. After that, write BLOCKERS.md (what failed, what was tried) and switch to work that does not depend on it.
4. Append-only PROGRESS.md: timestamp, milestone, status, next step. The human reads it in the morning.
5. Reviewer pass: after each milestone, a second agent (the auditor) reviews the diff against the acceptance criteria and writes REVIEW.md before the next milestone starts.
6. No destructive commands. Never delete or overwrite the vault or state/app.db. Copy the database before any migration.
7. Keep each task narrow because of context limits. At the start of each task, re-read only the spec sections it needs.
8. Rate limits: the run script retries with backoff and can fall back to a second model. Free models can be throttled or contended, especially at peak times, so expect pauses and plan for them.

### Human checkpoints (about 10 minutes each, not continuous supervision)

- After M0.5: approve docs/ken-mapping.md.
- After M4: take one mock exam.
- After M5b: run one live session.
- After M6b: open the graph and check a few concepts and their citations.

Agent-written code that passes its own tests can still be wrong. The checkpoints and the smoke tests exist for that reason.

### Kickoff prompt (paste into the build agent)

You are the build agent for the Exam Harness. Read SPEC.md sections 1, 2A, 6 and 6A first, then work milestone by milestone following the gate rules. Start with M0 and M0.5. After each milestone: run bun run verify, commit and tag, update PROGRESS.md, run the reviewer pass, then continue. Ask questions only if blocked by missing input from section 8; otherwise record the blocker in BLOCKERS.md and move on. Never delete or overwrite the vault or state/app.db. Keep tasks narrow and re-read only the spec sections you need.

## 7. Instructions to the builder agent (paste at the start)

- Read this spec in sections. Do not load everything at once; work milestone by milestone.
- Do not add features that are not in the spec. If something is ambiguous, pick the simplest option and note it in `DECISIONS.md`.
- Every milestone ends with passing tests and a short note in `PROGRESS.md`.
- Keep files under about 300 lines. Prefer boring, readable code.
- Validate every input at the boundary. Never write outside `vault/` or `state/`.
- Ask the user only when blocked by missing input (see section 8).

## 8. Inputs Diamond must supply

1. Slides and notes for the first course, as PDFs or PPTX, in `inbox/<course-code>/`.
2. Every past paper available, plus the real exam format per course (sections, counts, durations, marking).
3. Per-course answer-structure research, so the draft rubrics can be replaced.
4. A decision on which course goes first (suggest the one with the nearest assessment).

## 9. ActivitySpec (open-UI lite), core for live sessions

An agent can call `create_activity(spec)` with a JSON document made of blocks: `markdown`, `image`, `question` (by id or inline), `reveal`, `timer`, `input_text`, `choice`. The UI renders a fixed catalog of components from it. Results flow through the same attempt and grading pipeline. This gives agents room to invent new study formats without the app shipping arbitrary code.

## 9A. Activity catalog, banking and citations

**The model.** There is no separate flashcard system and quiz system. Everything the student does is an activity: a validated ActivitySpec built from a fixed catalog of components. Activities are either **ephemeral** (composed live by the agent to probe or teach, logged in the session note) or **banked** (saved to the vault as reusable, cited items). Banked items are what offline mode, spaced repetition and exam simulation run on. push\_activity (section 4A) and bank\_activity use one shared validator.

**Why banked items still matter.** Spaced repetition and exam papers need items with a stable identity, and a fresh question every time breaks both. Replay must work without an agent. A banked item can be audited once and reused. Ephemeral activities are for diagnosis and teaching.

### Catalog (about 20 to 24; v1 ships the ones marked with a star)

| Group | Components |
| --- | --- |
| Retrieve | flashcard ★, cloze ★, short\_answer, matching, ordering |
| Assess | mcq\_single ★, mcq\_multi, tf\_multi ★, theory ★, calculation |
| Explain | worked\_example\_stepper ★, predict\_reveal ★, spot\_the\_error, teach\_back, compare\_table ★, case\_vignette |
| Visualize | mermaid\_diagram ★, concept\_map, label\_diagram, timeline, annotated\_image |
| Reflect | confidence\_rating ★, think\_aloud ★, muddy\_point |

Mermaid diagrams are rendered in the browser with mermaid.js in strict security mode. If the source fails to parse, the UI reports a render\_error back to the agent through await\_response so it can fix and resend.

Each component is one schema, one React component and one renderer test. The agent can only compose from shipped components. An unknown type is rejected, and the error lists the available types so the agent self-corrects. Add the unstarred components one at a time from the same pattern after the freeze.

### Citations (hard rule)

Every agent-authored note, question or activity carries cites:

```json
"cites": [{"note": "courses/phy-301/slides/lecture-05.md", "anchor": "s7", "quote": "short verbatim phrase from that section"}]
```

In markdown notes the same reference is a wikilink: \[\[phy-301/slides/lecture-05#s7\]\]. Past papers are citable the same way.

The server validates on every write (write\_note, add\_questions, push\_activity, bank\_activity):

1. The note path exists.
2. The anchor exists in that note.
3. If a quote is given, it appears in that section (whitespace-normalized). Banked items need at least one cite with a quote.
4. A failure returns a clear error and writes nothing, so the agent fixes it and retries.

In the UI, a citation is a chip that opens the note at the anchor with the quoted text highlighted. Each note shows backlinks: everything that cites it.

**Part A requirement:** the converter must emit a stable anchor on every heading and slide, for example "## Slide 5 — Title {#s5}", and keep anchors identical across re-runs.

**Model knowledge.** Content not found in the vault is marked source: model\_knowledge and unverified: true, and is excluded from exam papers unless the student opts in.

**Limit.** Validation catches fabricated or misplaced references. It does not catch an agent misreading a real note, or an error in the slides themselves. Auditor sampling stays.

### Banking

bank\_activity(activity\_id, tags) saves a cited activity into the vault. Retrieval-type items (flashcard, cloze, mcq, tf\_multi, short\_answer, matching) use ken's file format and SM-2 where ken already has the type (confirm in M0.5). Other types are stored as activities/\<id>.md with frontmatter and the JSON spec. The student can tap "keep this" in the UI, and the agent can bank too. Exam papers draw only from banked, cited items that are not marked unverified.

### Offline floor and seeding

Without an agent the app runs banked items only. Before an exam period, run a seeding task: the question-writer sub-agent generates cited items per topic from the slides and past papers, the auditor samples them, and they are banked.

### Two-day scope

Ship the starred components only. Everything else is a later addition from the same pattern.

## 10. Risks and honest caveats

- **Diagrams:** anatomy slides are image-heavy. Text conversion will lose meaning unless figures are described. The vision pass needs a vision-capable model. Per community plugin docs, opencode's free DeepSeek V4 Flash is text-only, while MiMo-V2.5 Free accepts images (free for a limited time, and its data may be used for training). Verify with one slide PNG before running the whole queue.
- **Grading quality** depends on the external model and on rubric quality. Treat grades as feedback, not ground truth.
- **Lecturer fidelity** depends on how many past papers you can find. With few, question style will be approximate.
- **Scope creep** is the biggest risk. The two-day cap and the freeze are part of the spec.
- **DeepSeek on opencode** has limited context. Work from small spec slices and keep each task narrow.

## 11. Addendum: mixed sources, anatomy extras, answer styles, further items

Where this addendum conflicts with an earlier section, the addendum wins.

### 11.1 Intake of mixed, scattered files (extends Part A)

Reality: one folder holds PPTX files, PDFs and phone photos (photographed past papers and photographed projected slides), with truncated and inconsistent file names. Add a **Stage 0 intake step** (tools/intake.py) before conversion.

1. **Inventory** every file: path, size, SHA-256, type. Exact duplicates (same hash) are dropped.
2. **Classify** each file as one of: pptx, pdf\_text, pdf\_scanned, photo\_of\_paper, photo\_of\_slide, photo\_other. For images, a vision-capable model returns JSON: kind, course\_code\_guess, title\_guess, confidence.
3. **Assign a course** from title-slide or header text (course codes and department names appear on the slides), then lecturer names, then file names. Low confidence goes to inbox/\_unsorted/ and is listed in INTAKE\_REPORT.md for human review. Never guess silently.
4. **Near-duplicates:** the same lecture as a PPTX, a PDF and photos, or two versions of one topic. Compare titles and text similarity. Keep the best source as primary (pptx, then text pdf, then scanned pdf, then photo) and list the others as alt\_sources in frontmatter. If two versions differ in content, keep both and note the differences.
5. **Provenance and trust** in frontmatter: source\_type (lecturer\_slides, coursemate\_notes, photo, past\_paper\_photo) and trust (high, medium, low). A low-trust source cannot be the only cite for a banked question.

**Photos of slides:** deskew and crop, then transcribe with the vision model. Mark ocr\_quality: photo and flag low-confidence regions needs-check. If a native deck exists for the same lecture, keep the photos only as alt\_sources.

**Photos of past papers** (the highest-value, lowest-volume data): parse with the vision model into the question format and set verified: false. Unverified questions are excluded from exam papers. Add a **past-paper verification screen** to the UI: the original photo on the left, the parsed questions on the right, edit, then mark verified. A misread option or answer would silently corrupt practice, so these are reviewed by eye.

**Acceptance:** INTAKE\_REPORT.md lists every file with kind, course, confidence, primary or alt role and flags. No file is silently dropped. Every photo-sourced question is verified: false until reviewed.

### 11.2 Anatomy extras

**Spotter practicals.** The collected material includes gross practicals, so assume spotter-style practical exams. Add the activity type spotter\_station: an image, annotated image or 3D view with a pin or arrow, an identify answer, and a per-station timer (60 to 90 seconds). Add a paper section type spotter that rotates through N stations.

**3D models (special Learn mode).** A model3d block in the ActivitySpec:

- Viewer: three.js or model-viewer, with glTF files stored locally under assets/models/ as regional subsets (upper limb, lower limb, thorax and so on), compressed (Draco or meshopt) so they load on a phone.
- Mapping: concept.model\_ref = {model, mesh\_ids\[\]}. Agent tools: set\_highlight(meshes), isolate(layer), set\_camera(preset). Tapping a structure opens its concept.
- Activities: identify the highlighted structure, tap the named structure, trace a nerve or vessel path, peel layers.
- Candidate sources: Z-Anatomy (an open atlas built on the BodyParts3D data set), released under CC BY-SA. Verify the current download location and format before relying on it, since a public thread asked whether the files were still reachable. The existing Z-Anatomy Android app can be used for exploration in the meantime.
- Caveats: generic models may not match the lecturer's diagrams or emphasis. Full-body models are large. Share-alike licensing applies to derived models if they are ever shared. Mapping lecture concepts to mesh names is data work: an agent proposes mappings from structure names and the student verifies them.
- Scope: after the freeze. v1 only reserves the model3d block type and the model\_ref field.

### 11.3 Course answer-style cards

Answer style is per question kind, not only per course. Within anatomy, for example: muscle (origin, insertion, nerve supply, blood supply, action), region (boundaries, contents, relations), embryology process (stages, timing, clinical correlates), histology (identify, features, function).

- **File:** courses/\<code>/answer-style.md. Frontmatter lists kinds, each with: kind, rubric, typical\_marks, minutes, drawing\_expected, notes. The body holds plain-language guidance from lecturers or seniors, plus one or two model answers from top scripts.
- **Mapping:** every theory question has a question\_kind. The card maps each kind to a rubric. The grader scores structure and content separately.
- **How to fill a card:** (1) the agent drafts command words, marks and structure from the past papers; (2) add the lecturer's marking scheme or model answers if any exist; (3) convert one or two scripts or notes from top-scoring coursemates into model answers; (4) review the result with a senior who took the course. Until reviewed, the card is status: draft, and the grader says so in its feedback.

```yaml
---
course: ana-211
status: draft
kinds:
  - {kind: muscle, rubric: anatomy-muscle, typical_marks: 10, minutes: 12, drawing_expected: true, notes: "origin and insertion as headings"}
  - {kind: region, rubric: anatomy-region, typical_marks: 10, minutes: 12, drawing_expected: false}
---
```

### 11.4 Handwriting and drawings

Real theory exams are likely handwritten and may expect labeled diagrams. Typed practice trains content, not handwriting speed or drawing. Add answer\_input: text, text\_and\_drawing or photo per question kind. Photo flow: the student writes on paper, photographs it and uploads it in the UI; status becomes pending\_grading; a vision-capable grader reads it. Diagrams are graded for labels present, labels correct and structure. Plan timed handwritten sessions in the last 2 to 3 weeks before each exam.

### 11.5 Further items

1. **Exam dates:** exam\_date in course.md. get\_next\_concepts weights by days remaining, and the dashboard shows a countdown.
2. **Lecturer emphasis:** a lecturer\_flag on concepts for things stressed in class or hinted at. It boosts exam\_weight and can be set quickly from the UI or MCP.
3. **Interleaving:** studying one course a day means earlier courses fade. Reserve 20 to 30 percent of each session for the decay review queue from earlier courses.
4. **Offline study pack:** export a static bundle (notes, banked items, PWA cache) so the phone works when the laptop sleeps or the power is out. Banked items only; results sync back later.
5. **Backups:** the vault under git, and state/app.db copied daily to a second location.
6. **Calibration:** log real results per course (record\_real\_result) and review the mastery thresholds after each exam.
7. **Source quality:** coursemate notes can be wrong. Trust levels decide what may enter exam papers.

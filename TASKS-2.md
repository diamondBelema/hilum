# TASKS-2.md: next wave

Same rules as `TASKS.md`: read only the sections a card names, finish with `bun run verify`, commit, tag, append to `PROGRESS.md`, run the reviewer pass, build and test on `fixtures/` only, never delete or overwrite the vault or `state/app.db`.

Run the two read-only audits first (status audit and UI audit). Their findings may reorder this list. Default order: N0, N1, N2, N3, N4. The 3D pilot waits until these are done.

---

## N0: Housekeeping (S)
- The app runs on port 4317, but `BRAND.md` says 4747. 4317 is also the default port of the OpenTelemetry collector, so it can clash later. Pick one (recommend 4747), update README, MCP config examples and `BRAND.md`.
- Confirm the final icon, then regenerate PNG sizes, the maskable version and the mono version from it.
**Accept:** one port everywhere; `bun run start` serves on it; manifest and favicon use the final icon.

## N1: Graph rework (M)
**Read:** DESIGN 3, 6.1, 7.5. SPEC 4.8, 4.10.
**Problems seen in the current screen (fix all):**
1. Node labels are dark text on a dark background and fail contrast. Labels use `--text` with a 2px `--bg` halo so they stay readable over edges.
2. Edges render as thick black tapered ribbons and are nearly invisible. Use 1.5px lines in `--border-strong`, with the DESIGN 7.5 edge styles: parent solid, prerequisite dashed with an arrowhead, related dotted, contrasts-with solid with a crossbar.
3. Every node looks the same. Draw the MasteryRing (shape-coded states, decay dashed) on every node and size nodes by exam weight in three steps.
4. Nodes are about 100px wide. Use 28 to 44px.
5. Labels are cut off at the canvas edge. Fit the view to the content with padding, wrap labels to two lines at about 18 characters, and clamp inside the canvas.
6. A loading spinner with a stray label sits on top of the rendered graph. Show spinners only while loading, never over a rendered graph. Selection is a ring plus the drawer.
7. Labels and edges overlap. Add label collision avoidance.
8. Missing: neighborhood and overview modes, legend, concept drawer, tree view and frontier view (DESIGN 7.5). Add them.
9. Interaction: tap a node to recenter, pinch and wheel zoom, drag to pan, focus search.
10. Use a force-directed layout (d3-force or Cytoscape fcose) for the graph, so cross-links between subtrees show. The tree layout stays in Tree view.
**Accept:** contrast at least 4.5:1 for labels in both themes; node state is readable without color; 25 nodes legible at 360px; 300 nodes stay interactive on a mid-range phone; a cross-link between two subtrees is visible in neighborhood mode; screenshot tests at 360px and 1280px in both themes; legend present.

## N2: Black theme and calmer chrome (M)
**Read:** DESIGN 3.1b, 3.2, 4, 7.4.
- Implement the Black theme tokens (DESIGN 3.1b) as the default dark theme and add the section-label style.
- Calm the sidebar: icon plus sentence-case label, a subtle selected state (one surface step plus the primary text color), generous spacing, no heavy borders.
- **Study screen:** keep the ranked "Next up" list from DESIGN 7.4 and add a single centered-width composer at the top: "What do you want to learn?" with a Teach and Practice toggle. Submitting stores an agent request (`agent_requests`) that the connected agent picks up with `get_agent_requests`. The agent status strip shows connected, preparing, or not connected. With no agent connected, the composer says so and offers banked practice instead. (The reference app is chat-first because its agent runs inside the app. Ours does not, so the composer queues requests and the live session renders in Live.)
- Sessions list with relative times and a search box; update-ready toast.
- Do not copy assets or code from the reference app. Borrow ideas only.
**Accept:** DESIGN 12 contrast and accessibility checks pass on the Black theme; composer request reaches `get_agent_requests`; with no agent, the UI says so and offers practice; screenshots at 360px and 1280px.

## N3: In-app note editor (L)
**Read:** SPEC 3.2 (anchors), 4.3 (citations), 4.12, 5. DESIGN 7.2, 8, 9.
**Goal:** create and edit notes inside the app, for people who have never used markdown, with images. Files stay markdown on disk.
**Step 1, spike (about 1 hour):** compare Milkdown, TipTap with a markdown serializer, and CodeMirror 6 with live preview. Criteria: round-trip fidelity on `fixtures/` (frontmatter untouched, `{#anchors}` preserved, wikilinks, tables, mermaid fences, images), lazy-loaded size within the DESIGN 10 budget, mobile typing. Record the choice in `DECISIONS.md`.
**Step 2, build:**
- A WYSIWYG body editor with a toolbar (headings, bold, italic, lists, checklist, quote, code, table, link, image, divider), a "/" menu, markdown shortcuts, undo and redo, and a "Markdown" source toggle. On phones, a bottom toolbar.
- Frontmatter is never shown as YAML. A "Details" panel holds title, course, topics and source type. Student notes get `source_type: student_notes`, `trust: medium`.
- **Images:** paste, drag and drop, file picker, phone camera. Save to `<course>/assets/` with stable ids and relative references. Prompt for alt text; "Describe later" sets `needs-description` and adds a `VISION_QUEUE.md` line. Downscale anything over 2000px. Zoom in the reader.
- Mermaid block with live preview and clear error messages.
- "Insert citation": search notes, choose a heading, insert a wikilink chip, optionally pick a quote.
- **Anchors:** every heading gets a stable anchor automatically. Renaming a heading keeps its anchor unless the user picks "Change link ID", and the UI warns how many citations point to it.
- **Saving:** debounced autosave through VaultService with the "Saved / Not saved" states from DESIGN 7.1. If the file changes from outside (an agent through MCP, or the watcher), show a banner: "This note was changed elsewhere" with Reload, Keep mine, and See changes. Never overwrite silently.
- New-note flow on the Notes screen: choose course and title; templates (blank, lecture summary).
**Accept:** opening and saving a note without edits changes zero bytes (golden tests on all fixture notes); anchors persist across edits; image paste works offline; the external-change banner appears when a script edits the file; keyboard-only operation; works at 360px; zero external network requests; accessibility checks pass.

## N4: Config editors in the app (L)
**Read:** SPEC 4.4, 4.5, 4.8 (mastery config), 5. DESIGN 8, 9.
**Goal:** change course settings, answer styles, rubrics and thresholds from the app without touching YAML. The files stay the source of truth.
- **Course settings:** title, department, exam date, exam blueprint (a table of sections: type, count, minutes, marks each), default exam mode.
- **Answer-style editor:** list of question kinds (add, remove, reorder); for each: name, rubric picker, typical marks, minutes, drawing expected, answer input, guidance text, model answers (markdown); a draft or reviewed status with a "reviewed by" note.
- **Rubric editor:** headings table (heading, marks, expects), command words, status.
- **Mastery thresholds:** editable numbers with plain explanations and "Reset to defaults".
- **Rules:** forms write the same files (`course.md`, `answer-style.md`, `rubrics/*.md`) through VaultService with the same Zod schemas as the server; inline errors; an "Edit raw" escape hatch; history (the last 20 versions in `.history/`) with restore; the external-change banner from N3; record `updated_by`.
- **Grades keep a snapshot of the rubric used**, so editing a rubric never changes past grades.
**Accept:** editing the exam date, a blueprint row, a rubric and an answer-style kind in the UI changes the right files, and the exam builder and grader use the new values; invalid input is rejected with a clear message; history restore works; past grades are unchanged after a rubric edit.

## Later: 3D anatomy pilot
Wait for N1 to N4. Scope when it starts: one region (for example the upper limb), about 20 mapped structures, three activities (identify the highlighted structure, tap the named structure, trace a nerve), through the `model3d` block and the reserved tools in SPEC 4.11. Verify the model source and its license first.

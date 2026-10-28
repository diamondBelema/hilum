# TASKS-3.md: stabilize, then close the learning loop

Built from `STATUS.md` and `docs/ui-audit/REPORT.md` (2026-10-28). Same rules as `TASKS.md`: read only the sections a card names, finish with `bun run verify`, commit, tag only when acceptance truly passes, append to `PROGRESS.md`, run the reviewer pass. **This file overrides the order in `TASKS-2.md`.** Cards N0, N2, N3, N4 from `TASKS-2.md` come after W5.

First action, before any card: copy `TASKS.md`, `TASKS-2.md`, `TASKS-3.md`, `SPEC.md`, `DESIGN.md`, `BRAND.md` into the repo root (the audit found `TASKS.md` and `BLOCKERS.md` missing) and create an empty `BLOCKERS.md`.

Feature freeze applies until W0, W1, W2 and the W4 human checkpoint are done. Bug fixes and the cards below are allowed.

---

## W0: Protect the data and the history (S, do first)
**Why:** the real database holds the only copy of your study history, 44 questions were verified by raw SQL, the vault is not in git, Lane A is uncommitted, and the disk is 93% full.
1. **Backups:** run `scripts/copy-db.ts` now. Schedule it daily (systemd user timer or cron) to a second location on a different disk or folder, keep 14 copies, and add a restore test (copy to temp, open, count rows).
2. **Vault under git:** `git init` in the vault (local only, no remote), `.gitignore` for temp files, first commit. Do not push it anywhere.
3. **Commit the work:** commit the `answer_style` diff on main. Commit Lane A's `tools/` and its progress files on a branch. Do not tag `m1-pass` yet (see W3).
4. **Honest verification record:** add `verified_by` and `verified_at` to questions (migration). Mark the 44 existing rows `verified_by: "bulk-sql-2026-10-28"`. Then spot-check 10 random questions through the verification UI and record the result. If more than 1 has an error, queue all 44 for UI review.
5. **Real results must not become evidence:** `recordRealResult` currently writes an `evidence` row (`src/server/concepts/service.ts:706`), which can distort mastery. Create the `real_results` table from SPEC 4.2, move existing rows, and make mastery ignore them.
6. **Disk:** report sizes (vault assets, DB, WAL) and run a WAL checkpoint. Add a warning in Settings when free space is under 10%.
**Accept:** a restore test passes from the latest backup; the vault has a git history; `git status` is clean on both repos; verification rows show who and when; no mastery calculation reads `real_results`; Settings shows free disk space.

## W1: Quick UI fixes (S)
**Read:** DESIGN 4, 9, 11. Audit "S" list and bugs P1/P2.
1. Grading: constrain the course `<select>` (`w-full max-w-full`), fixing the 107px overflow at 360px.
2. Mobile nav: 7 tabs fit (7 columns, or 6 plus a "More" sheet), labels at least 13px, main bottom padding equals the real bar height.
3. Citation chips: minimum height 44px (`ActivityRenderer.tsx:41-46`).
4. Default course: pick the first course that has content (or add "All courses"); show a skeleton when switching course so the previous empty state never flashes (`Progress.tsx:205`).
5. Settings: add the LAN toggle and MCP token controls from SPEC 4.10 (token shown masked with copy and regenerate).
6. Replace every `text-[10px]` and `text-[11px]` with at least 13px.
**Accept:** automated test: `scrollWidth <= innerWidth` at 360px on every tab; tap-target scan reports no element under 44px on Live, Notes, Grading and Settings; nav shows all 7 destinations without wrapping; course switch shows a skeleton, not "No topics yet".

## W2: Graph rework (M)
**Read:** TASKS-2 N1 (all ten items), DESIGN 6.1, 7.5.
**Exact defects to fix (from the audit):**
- Edge `<path>` has no `fill="none"` and the dash style is a class token instead of an SVG attribute (`Graph.tsx:193-197,320`). Edges become 1.5px lines in `--border-strong` with real `stroke-dasharray` per edge type.
- The SVG is fixed at 720px, causing 377px overflow at 360px (`Graph.tsx:284-291`). Use a `viewBox` with `w-full h-auto`.
- Labels clip and overlap; SVG `<text>` ignores `max-width`. Use HTML labels or a collision and ellipsis pass; text uses `--text` with a `--bg` halo.
- The footer prints template source (`Graph.tsx:384`). Fix the template literal.
- A duplicate root (a node plus a `MasteryRing` overlay) at `Graph.tsx:368-380`. Remove the overlay.
- The drawer uses a local `Sheet` whose backdrop covers the panel; Escape is not handled; `backdrop-blur-sm` violates DESIGN 10 (`Graph.tsx:579-613`). Use the shared dialog component: clickable, Escape closes, focus trap, no blur.
- Overview: no zoom, labels always on, search filters instead of focusing, no cap. Add zoom and pan, labels hidden until zoomed or hovered, search that focuses a node, a cap of about 300 nodes, and for the neighborhood view a cap of 25 with a "+N more" control.
- Mastery state is shown by fill only. Use the shape-coded MasteryRing on every node.
**Accept:** TASKS-2 N1 acceptance, plus: clicking "Study this" in the drawer navigates; Escape closes the drawer and returns focus; a 300-node synthetic graph stays interactive; screenshot tests at 360px and 1280px in both themes.

## W3: Conversion hygiene, Lane A (M)
**Read:** SPEC 3.2 to 3.4.
1. **17 notes exceed 1,800 tokens** (worst: `courses/ana-207/slides/Gross practical report 1.md`, 4,147). Re-split at heading boundaries; where there are no headings, split at paragraph boundaries; allow an exception only for an indivisible table, and record it.
2. Regenerate `REPORT.md` from the current files. The converter must **fail loudly** if any note is over the limit (it currently reports PASS from stale data).
3. Reconcile 1,921 flagged pages against 1,906 queue rows (15 missing).
4. Add a pytest suite: two runs give no diff, anchors are stable, token limit enforced, queue parity, no dropped pages, timing on a fixture deck. Install pytest in the venv. Fix the Lane A `bun test` failure (`Cannot find package 'hono'`) or remove the stale scaffold tests.
**Accept:** zero notes over the limit (or documented table exceptions); pytest green; `REPORT.md` regenerated and consistent with the files; then tag `m1-pass`.

## W4: Close the learning loop (M, includes a human checkpoint)
**Why:** the database has 0 papers and 0 attempts. The exam runner, the app's first priority, has never been used on real data. Also, the course being studied now (bch-203) has 9 concepts and no questions.
1. **Seed bch-203:** the question-writer sub-agent writes cited questions (tf_multi, mcq_single, theory) per concept from the bch-203 notes, target 40. The auditor samples 20%. Verify through the UI or `verify_question` with the verifier recorded.
2. **Concept links and exam weight:** link the 44 ana-202a questions and the new bch questions to concept ids. Compute `exam_weight` from past-paper marks only (SPEC 4.8). Keep hand-set weights as `lecturer_flag` boosts.
3. **Decay wording:** either implement "drops one level" or update SPEC 4.8 to describe the `decayed` state, then make frontier and dashboard wording match.
4. **End the stale session:** end the open bch-203 session with `session_end` so it writes a summary note.
5. **Human checkpoint:** take a 15-question timed mock on bch-203 on your phone, in the dark or daylight, with the keyboard-free flow. Grade the theory answer, read the debrief, and note anything confusing in `DECISIONS.md`.
**Accept:** at least 1 paper, 1 attempt and 1 graded theory answer exist in the real database; mastery changed because of the attempt; the session summary note exists; the human checkpoint is logged.

## W5: Automate the DESIGN 12 checks (L)
**Read:** DESIGN 9, 12.
Add to `bun run verify`: an axe scan on dashboard, reader, runner, results, live and tree; the tap-target scan; no horizontal scroll at 360px for every tab; the keyboard-only 10-question exam; reload mid-exam restores answers and timer; the "Not saved" banner when the API is stopped; a smoke assertion of **zero external requests**; reduced-motion test.
**Accept:** each check fails when deliberately broken (prove it once) and passes now.

## After W5
Run `TASKS-2.md` cards N0, N2, N3, N4 in that order. Then tag M6, M6b and Z honestly (only if their acceptance passes), and start the 3D pilot.

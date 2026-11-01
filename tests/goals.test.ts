import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";
import { openDb } from "../src/server/db.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "hilum-goals-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/course.md"),
    "---\ncode: ana-211\ntitle: Anatomy\nexam_date: 2026-12-01\n---\n\n# Anatomy\n",
    "utf8",
  );
  await writeFile(
    join(root, "courses/ana-211/notes/tubules.md"),
    "---\ntitle: Tubules\n---\n\n## Reabsorption {#reabsorption}\n\nSodium is reabsorbed.\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("goals", () => {
  test("migrates an existing sessions database additively", () => {
    const path = join(root, "legacy.sqlite");
    const legacy = openDb(path);
    legacy.exec("DROP TABLE goals; DROP TABLE plan_items; DROP TABLE tasks;");
    legacy.exec("CREATE TABLE goals (id TEXT PRIMARY KEY, course TEXT NOT NULL, title TEXT NOT NULL, deadline TEXT, study_min_per_day INTEGER, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
    legacy.close();
    const migrated = openDb(path);
    expect(migrated.query("PRAGMA table_info(sessions)").all()).toHaveLength(12);
    expect(migrated.query("SELECT name FROM sqlite_master WHERE name = 'tasks'").get()).toBeTruthy();
    migrated.close();
  });

  test("creates a goal, draft plan, and task idempotently", async () => {
    const { indexer, goals } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Cover anatomy", study_min_per_day: 30 }, "goal-1");
    expect(goal.deadline).toBe("2026-12-01");
    const same = await goals.create({ course: "ana-211", title: "Different", study_min_per_day: 30 }, "goal-1");
    expect(same.id).toBe(goal.id);
    const updated = goals.update(goal.id as string, { title: "Finish anatomy", status: "done" }, "goal-update-1");
    expect(updated.title).toBe("Finish anatomy");
    expect(updated.status).toBe("done");

    const planned = await goals.proposePlan(goal.id as string, [{
      title: "Map reabsorption",
      kind: "map",
      position: 0,
      est_min_low: 20,
      est_min_high: 30,
      note_path: "courses/ana-211/notes/tubules.md",
      note_anchor: "reabsorption",
    }], "plan-1");
    expect(planned.plan_items).toHaveLength(1);
    expect((planned.plan_items[0] as { plan_state: string }).plan_state).toBe("draft");

    const task = await goals.addTask({
      course: "ana-211",
      goal_id: goal.id,
      title: "Do practice questions",
      kind: "practice",
    }, "task-1");
    expect((task as { status: string }).status).toBe("open");
    const taskAgain = await goals.addTask({
      course: "ana-211",
      title: "Changed title",
    }, "task-1");
    expect((taskAgain as { id: string }).id).toBe((task as { id: string }).id);
  });

  test("rejects invalid plan references without writing", async () => {
    const { indexer, goals, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Cover anatomy" });
    await expect(goals.proposePlan(goal.id as string, [{
      title: "Bad concept",
      position: 0,
      est_min_low: 10,
      est_min_high: 20,
      concept_id: "missing",
    }])).rejects.toThrow("concept not found");
    const count = db.query("SELECT COUNT(*) AS count FROM plan_items").get() as { count: number };
    expect(count.count).toBe(0);
  });

  test("computes coverage from heading anchors and concept status", async () => {
    const { indexer, goals, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const now = Date.now();
    db.query(
      `INSERT INTO concepts (id, course, title, cites_json, status, path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "ana-reabsorption",
      "ana-211",
      "Reabsorption",
      JSON.stringify([{ note: "courses/ana-211/notes/tubules.md", anchor: "reabsorption" }]),
      "accepted",
      "courses/ana-211/concepts/ana-reabsorption.md",
      now,
    );
    db.query(
      `INSERT INTO concepts (id, course, title, cites_json, status, path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "ana-other",
      "ana-211",
      "Other",
      JSON.stringify([{ note: "courses/ana-211/notes/tubules.md", anchor: "missing" }]),
      "rejected",
      "courses/ana-211/concepts/ana-other.md",
      now,
    );
    const coverage = goals.getCoverage("ana-211");
    expect(coverage.sections).toBe(1);
    expect(coverage.covered_accepted).toBe(1);
    expect(coverage.covered_accepted_unverified).toBe(0);
    expect(coverage.covered_proposed).toBe(0);
    expect(coverage.uncovered).toHaveLength(0);
  });

  test("computes pacing from approved items and capped activity time", async () => {
    const { indexer, goals, sessions, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({
      course: "ana-211",
      title: "Finish anatomy",
      deadline: "2026-12-01",
      study_min_per_day: 30,
    });
    const planned = await goals.proposePlan(goal.id as string, [{
      title: "Reabsorption",
      position: 0,
      est_min_low: 20,
      est_min_high: 30,
    }]);
    const item = planned.plan_items[0] as { id: string };
    goals.updatePlanItem(item.id, { plan_state: "approved", status: "active" });
    const session = await sessions.start("ana-211", "learn", null, "agent", {
      goalId: goal.id as string,
      timeBoxMin: 45,
    });
    const now = Date.now();
    db.query("UPDATE sessions SET active_plan_item_id = ?, started_at = ? WHERE id = ?").run(item.id, now - 41 * 60_000, session.id);
    db.query(
      `INSERT INTO activities (id, session_id, course, spec_json, plan_item_id, status, created_at, answered_at)
       VALUES (?, ?, ?, ?, ?, 'answered', ?, ?)`,
    ).run("act-pacing", session.id, "ana-211", "{}", item.id, now - 20 * 60_000, now - 1 * 60_000);
    const pacing = goals.getPacing(session.id);
    expect(pacing.plan.remaining_min_range).toEqual([20, 30]);
    expect(pacing.plan.status).toBe("ahead");
    expect(pacing.active_item?.elapsed_min).toBe(10);
    expect(pacing.session.time_box_min).toBe(45);
  });

  test("defers active items and records capped actual time when a session ends", async () => {
    const { indexer, goals, sessions, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Finish anatomy" });
    const planned = await goals.proposePlan(goal.id as string, [{
      title: "Reabsorption",
      position: 0,
      est_min_low: 10,
      est_min_high: 20,
    }]);
    const item = planned.plan_items[0] as { id: string };
    goals.updatePlanItem(item.id, { plan_state: "approved", status: "active" });
    const session = await sessions.start("ana-211", "learn", null, "agent", { goalId: goal.id as string });
    const now = Date.now();
    db.query(
      `INSERT INTO activities (id, session_id, course, spec_json, plan_item_id, status, created_at, answered_at)
       VALUES (?, ?, ?, ?, ?, 'answered', ?, ?)`,
    ).run("act-carry", session.id, "ana-211", "{}", item.id, now - 20 * 60_000, now - 1 * 60_000);
    await sessions.end(session.id, "finished");
    const saved = db.query("SELECT status, partial, actual_sec FROM plan_items WHERE id = ?").get(item.id) as {
      status: string;
      partial: number;
      actual_sec: number;
    };
    expect(saved.status).toBe("deferred");
    expect(saved.partial).toBe(1);
    expect(saved.actual_sec).toBe(600);
    await sessions.end(session.id, "ignored");
    const unchanged = db.query("SELECT actual_sec FROM plan_items WHERE id = ?").get(item.id) as { actual_sec: number };
    expect(unchanged.actual_sec).toBe(600);
  });

  test("emits an over-estimate nudge once per item and session", async () => {
    const { indexer, goals, sessions, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Finish anatomy" });
    const planned = await goals.proposePlan(goal.id as string, [{
      title: "Reabsorption",
      position: 0,
      est_min_low: 1,
      est_min_high: 5,
    }]);
    const item = planned.plan_items[0] as { id: string };
    goals.updatePlanItem(item.id, { plan_state: "approved", status: "active" });
    const session = await sessions.start("ana-211", "learn", null, "agent", { goalId: goal.id as string });
    const now = Date.now();
    db.query("UPDATE sessions SET active_plan_item_id = ? WHERE id = ?").run(item.id, session.id);
    db.query(
      `INSERT INTO activities (id, session_id, course, spec_json, plan_item_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).run("act-nudge", session.id, "ana-211", "{}", item.id, now - 11 * 60_000);
    expect(goals.getPacing(session.id).active_item?.nudge).toBe("over_estimate");
    expect(goals.getPacing(session.id).active_item?.nudge).toBeNull();
  });

  test("counts proposed and unverified coverage separately", async () => {
    const { indexer, goals, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const now = Date.now();
    db.query(
      `INSERT INTO concepts (id, course, title, cites_json, status, unverified, path, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "ana-proposed",
      "ana-211",
      "Proposed",
      JSON.stringify([{ note: "courses/ana-211/notes/tubules.md", anchor: "reabsorption" }]),
      "proposed",
      1,
      "courses/ana-211/concepts/ana-proposed.md",
      now,
    );
    const coverage = goals.getCoverage("ana-211");
    expect(coverage.covered_accepted).toBe(0);
    expect(coverage.covered_proposed).toBe(1);
    expect(coverage.covered_proposed_unverified).toBe(1);
  });

  test("stores plan changes as drafts and applies them explicitly", async () => {
    const { indexer, goals } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Plan" });
    const plan = await goals.proposePlan(goal.id as string, [{
      title: "Old item",
      position: 0,
      est_min_low: 10,
      est_min_high: 20,
    }]);
    const old = plan.plan_items[0] as { id: string };
    const change = goals.proposePlanChange(goal.id as string, {
      defer: [old.id],
      add: [{ title: "New item", position: 1, est_min_low: 5, est_min_high: 10 }],
    });
    expect(change.status).toBe("draft");
    expect((goals.get(goal.id as string).plan_items[0] as { status: string }).status).toBe("todo");
    const applied = goals.applyPlanChange(change.id as string);
    expect(applied.plan_items).toHaveLength(2);
    expect((applied.plan_items.find((item) => (item as { id: string }).id === old.id) as { status: string }).status).toBe("deferred");
    const listed = goals.listPlanChanges(goal.id as string);
    expect(listed).toHaveLength(1);
    expect((listed[0] as { status: string }).status).toBe("applied");
  });

  test("reorders plan items without changing their approval state", async () => {
    const { indexer, goals } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Order" });
    const plan = await goals.proposePlan(goal.id as string, [
      { title: "First", position: 0, est_min_low: 10, est_min_high: 20 },
      { title: "Second", position: 1, est_min_low: 10, est_min_high: 20 },
    ]);
    const first = plan.plan_items[0] as { id: string };
    const second = plan.plan_items[1] as { id: string };
    goals.updatePlanItem(first.id, { plan_state: "approved", position: 1 });
    goals.updatePlanItem(second.id, { plan_state: "approved", position: 0 });
    const reordered = goals.get(goal.id as string);
    expect(reordered.plan_items.map((item) => (item as { title: string }).title)).toEqual(["Second", "First"]);
    expect(reordered.plan_items.every((item) => (item as { plan_state: string }).plan_state === "approved")).toBe(true);
  });

  test("auto-completes measurable tasks from evidence", async () => {
    const { indexer, goals, sessions, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const session = await sessions.start("ana-211", "practice", null, "agent");
    const task = await goals.addTask({
      course: "ana-211",
      title: "Answer three questions",
      kind: "practice",
      target_json: { questions: 3 },
    });
    const now = Date.now();
    for (let index = 0; index < 3; index += 1) {
      db.query(
        `INSERT INTO evidence (session_id, activity_id, concept_id, kind, correct, created_at)
         VALUES (?, ?, ?, 'practice', 1, ?)`,
      ).run(session.id, `practice-${index}`, `missing-${index}`, now - index);
    }
    goals.autoCompleteTasks("ana-211", session.id);
    expect((db.query("SELECT status FROM tasks WHERE id = ?").get((task as { id: string }).id) as { status: string }).status).toBe("done");
  });

  test("rejects task targets for concepts outside the course", async () => {
    const { indexer, goals, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    await expect(goals.addTask({
      course: "ana-211",
      title: "Review missing concept",
      kind: "review",
      target_json: { concept_id: "missing-concept" },
    })).rejects.toThrow("concept not found in course");
    expect(db.query("SELECT COUNT(*) AS count FROM tasks").get()).toEqual({ count: 0 });
  });

  test("auto-completes review and revisit tasks from mastery state", async () => {
    const { indexer, goals, sessions, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const session = await sessions.start("ana-211", "learn", null, "agent");
    const now = Date.now();
    db.query(
      `INSERT INTO concepts (id, course, title, cites_json, status, path, updated_at)
       VALUES (?, ?, ?, '[]', 'accepted', ?, ?)`,
    ).run("review-concept", "ana-211", "Review concept", "courses/ana-211/concepts/review.md", now);
    db.query(
      `INSERT INTO mastery (concept_id, state, score, evidence_count)
       VALUES (?, 'understood', 0.7, 2)`,
    ).run("review-concept");
    const review = await goals.addTask({
      course: "ana-211",
      title: "Review concept",
      kind: "review",
      target_json: { concept_id: "review-concept" },
    });
    const revisit = await goals.addTask({
      course: "ana-211",
      title: "Revisit concept",
      kind: "revisit",
      target_json: { concept_id: "review-concept" },
    });
    goals.autoCompleteTasks("ana-211", session.id);
    expect((db.query("SELECT status FROM tasks WHERE id = ?").get((review as { id: string }).id) as { status: string }).status).toBe("done");
    expect((db.query("SELECT status FROM tasks WHERE id = ?").get((revisit as { id: string }).id) as { status: string }).status).toBe("done");
  });

  test("calibrates future estimates from completed item history", async () => {
    const { indexer, goals, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();
    const goal = await goals.create({ course: "ana-211", title: "Calibrate" });
    for (let index = 0; index < 3; index += 1) {
      db.query(
        `INSERT INTO plan_items
         (id, goal_id, title, kind, position, est_min_low, est_min_high, actual_sec, status, plan_state, created_at, updated_at)
         VALUES (?, ?, ?, 'learn', ?, 10, 20, 1800, 'done', 'approved', ?, ?)`,
      ).run(`done-${index}`, goal.id, `Done ${index}`, index, Date.now(), Date.now());
    }
    expect(goals.calibrationFactor("ana-211")).toBe(2);
    const planned = await goals.proposePlan(goal.id as string, [{
      title: "Future",
      position: 0,
      est_min_low: 10,
      est_min_high: 20,
    }]);
    expect((planned.plan_items[0] as { est_min_low: number; est_min_high: number }).est_min_low).toBe(20);
    expect((planned.plan_items[0] as { est_min_low: number; est_min_high: number }).est_min_high).toBe(40);
  });
});

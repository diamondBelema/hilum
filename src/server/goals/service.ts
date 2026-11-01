import { z } from "zod";
import type { Db } from "../db.ts";
import type { EventBus } from "../events.ts";
import type { VaultService } from "../vault/service.ts";
import type { ConceptService } from "../concepts/service.ts";
import { validateCite } from "../questions/citations.ts";
import { listSections } from "../questions/citations.ts";

const goalInput = z.object({
  course: z.string().min(1),
  title: z.string().trim().min(1),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  study_min_per_day: z.number().int().positive().nullable().optional(),
});

const planItemInput = z.object({
  concept_id: z.string().min(1).nullable().optional(),
  note_path: z.string().min(1).nullable().optional(),
  note_anchor: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  kind: z.enum(["learn", "map", "review"]).default("learn"),
  position: z.number().int().nonnegative(),
  est_min_low: z.number().int().positive(),
  est_min_high: z.number().int().positive(),
});

const taskInput = z.object({
  course: z.string().min(1),
  goal_id: z.string().min(1).nullable().optional(),
  plan_item_id: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  kind: z.enum(["practice", "review", "revisit", "custom"]).default("custom"),
  target_json: z.record(z.unknown()).nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source: z.enum(["user", "agent"]).default("user"),
});

const planPatch = z.object({
  status: z.enum(["active", "done", "deferred", "skipped"]).optional(),
  partial: z.boolean().optional(),
  plan_state: z.enum(["draft", "approved"]).optional(),
  position: z.number().int().nonnegative().optional(),
});

const taskPatch = z.object({
  status: z.enum(["open", "done", "dropped"]).optional(),
});

const goalPatch = z.object({
  title: z.string().trim().min(1).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  study_min_per_day: z.number().int().positive().nullable().optional(),
  status: z.enum(["active", "done", "archived"]).optional(),
});

const planChangeInput = z.object({
  add: z.array(planItemInput).default([]),
  remove: z.array(z.string().min(1)).default([]),
  reorder: z.array(z.object({ id: z.string().min(1), position: z.number().int().nonnegative() })).default([]),
  defer: z.array(z.string().min(1)).default([]),
});

export class GoalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalError";
  }
}

function row<T>(value: T | null, message: string): T {
  if (!value) throw new GoalError(message);
  return value;
}

export class GoalService {
  constructor(
    private readonly db: Db,
    private readonly vault: VaultService,
    private readonly events: EventBus,
    private readonly concepts?: ConceptService,
  ) {}

  private idempotent<T>(namespace: string, requestId: string | undefined, work: () => T): T {
    if (!requestId) return work();
    const key = `${namespace}:${requestId}`;
    const previous = this.db.query("SELECT result FROM idempotency WHERE key = ?").get(key) as
      | { result: string }
      | null;
    if (previous) return JSON.parse(previous.result) as T;
    const result = work();
    this.db.query("INSERT INTO idempotency (key, result, created_at) VALUES (?, ?, ?)").run(
      key,
      JSON.stringify(result),
      Date.now(),
    );
    return result;
  }

  calibrationFactor(course: string): number {
    const rows = this.db.query(
      `SELECT actual_sec, est_min_low, est_min_high
       FROM plan_items JOIN goals ON goals.id = plan_items.goal_id
       WHERE goals.course = ? AND plan_items.status = 'done' AND plan_items.actual_sec > 0`,
    ).all(course) as { actual_sec: number; est_min_low: number; est_min_high: number }[];
    if (rows.length < 3) return 1;
    const ratios = rows
      .map((item) => item.actual_sec / 60 / ((item.est_min_low + item.est_min_high) / 2))
      .sort((a, b) => a - b);
    const middle = Math.floor(ratios.length / 2);
    const median = ratios.length % 2 === 1
      ? ratios[middle]!
      : (ratios[middle - 1]! + ratios[middle]!) / 2;
    return Math.min(2, Math.max(0.5, median));
  }

  async create(input: unknown, requestId?: string) {
    const value = goalInput.parse(input);
    const course = (await this.vault.listCourses()).find((item) => item.code === value.course);
    if (!course) throw new GoalError(`course not found: ${value.course}`);
    const deadline = value.deadline ?? course.examDate;
    return this.idempotent("goal", requestId, () => {
      const id = `goal-${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      this.db.query(
        `INSERT INTO goals (id, course, title, deadline, study_min_per_day, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, value.course, value.title, deadline ?? null, value.study_min_per_day ?? null, now, now);
      this.events.publish({ type: "goal", course: value.course, goalId: id, state: "created", at: now });
      return this.get(id);
    });
  }

  get(id: string) {
    const goal = row(this.db.query("SELECT * FROM goals WHERE id = ?").get(id) as Record<string, unknown> | null, `goal not found: ${id}`);
    const items = this.db.query(
      "SELECT * FROM plan_items WHERE goal_id = ? ORDER BY partial DESC, position ASC",
    ).all(id);
    const tasks = this.db.query("SELECT * FROM tasks WHERE goal_id = ? ORDER BY status, due_date, created_at").all(id);
    return { ...goal, plan_items: items, tasks, coverage: this.getCoverage(String(goal.course)) };
  }

  update(id: string, input: unknown, requestId?: string) {
    const patch = goalPatch.parse(input);
    const current = row(
      this.db.query("SELECT course FROM goals WHERE id = ?").get(id) as { course: string } | null,
      `goal not found: ${id}`,
    );
    return this.idempotent("goal-update", requestId, () => {
      const fields: string[] = [];
      const values: unknown[] = [];
      for (const [field, value] of Object.entries({
        title: patch.title,
        deadline: patch.deadline,
        study_min_per_day: patch.study_min_per_day,
        status: patch.status,
      })) {
        if (value !== undefined) {
          fields.push(`${field} = ?`);
          values.push(value);
        }
      }
      if (fields.length) {
        fields.push("updated_at = ?");
        values.push(Date.now(), id);
        this.db.query(`UPDATE goals SET ${fields.join(", ")} WHERE id = ?`).run(...values);
        this.events.publish({ type: "goal", course: current.course, goalId: id, state: "updated", at: Date.now() });
      }
      return this.get(id);
    });
  }

  getPacing(sessionId: string) {
    const session = this.db.query(
      "SELECT id, course, goal_id, time_box_min, started_at, active_plan_item_id, ended_at FROM sessions WHERE id = ?",
    ).get(sessionId) as {
      id: string;
      course: string;
      goal_id: string | null;
      time_box_min: number | null;
      started_at: number;
      active_plan_item_id: string | null;
      ended_at: number | null;
    } | null;
    if (!session) throw new GoalError(`session not found: ${sessionId}`);

    const goal = session.goal_id
      ? this.db.query("SELECT * FROM goals WHERE id = ?").get(session.goal_id) as {
          id: string;
          title: string;
          deadline: string | null;
          study_min_per_day: number | null;
        } | null
      : null;
    const now = Date.now();
    const daysLeft = goal?.deadline
      ? Math.max(0, Math.ceil((Date.parse(`${goal.deadline}T00:00:00Z`) - Date.parse(new Date(now).toISOString().slice(0, 10) + "T00:00:00Z")) / 86_400_000))
      : null;
    const items = session.goal_id
      ? this.db.query("SELECT * FROM plan_items WHERE goal_id = ? ORDER BY position").all(session.goal_id) as {
          id: string;
          title: string;
          est_min_low: number;
          est_min_high: number;
          status: string;
          plan_state: string;
          partial: number;
        }[]
      : [];
    const remaining = items.filter((item) => item.plan_state === "approved" && !["done", "skipped", "deferred"].includes(item.status));
    const remainingMid = remaining.reduce((sum, item) => sum + (item.est_min_low + item.est_min_high) / 2, 0);
    const remainingLow = remaining.reduce((sum, item) => sum + item.est_min_low, 0);
    const remainingHigh = remaining.reduce((sum, item) => sum + item.est_min_high, 0);
    const available = goal?.study_min_per_day && daysLeft !== null ? goal.study_min_per_day * daysLeft : null;
    const status = available === null
      ? null
      : remainingMid > 1.25 * available
        ? "behind"
        : remainingMid < 0.75 * available
          ? "ahead"
          : "on_track";

    const activityRows = this.db.query(
      "SELECT plan_item_id, created_at, answered_at FROM activities WHERE session_id = ? AND plan_item_id IS NOT NULL",
    ).all(sessionId) as { plan_item_id: string; created_at: number; answered_at: number | null }[];
    const elapsedFor = (planItemId: string) => activityRows
      .filter((activity) => activity.plan_item_id === planItemId)
      .reduce((sum, activity) => sum + Math.min(600, Math.max(0, ((activity.answered_at ?? now) - activity.created_at) / 1000)), 0);
    const activeId = session.active_plan_item_id ?? activityRows.at(-1)?.plan_item_id ?? null;
    const activeItem = activeId ? items.find((item) => item.id === activeId) : null;
    const activeElapsed = activeId ? Math.round(elapsedFor(activeId) / 60) : 0;
    const overEstimate = Boolean(
      activeItem &&
      activeElapsed > 1.5 * activeItem.est_min_high &&
      this.db.query(
        "SELECT 1 FROM session_plan_nudges WHERE session_id = ? AND plan_item_id = ? AND kind = 'over_estimate'",
      ).get(sessionId, activeItem.id) === null,
    );
    if (overEstimate && activeItem) {
      this.db.query(
        "INSERT OR IGNORE INTO session_plan_nudges (session_id, plan_item_id, kind, created_at) VALUES (?, ?, 'over_estimate', ?)",
      ).run(sessionId, activeItem.id, now);
    }
    const sessionElapsed = Math.max(0, Math.round((now - session.started_at) / 60));
    const sessionRemaining = session.time_box_min === null ? null : Math.max(0, session.time_box_min - sessionElapsed);

    return {
      now: new Date(now).toISOString(),
      goal: goal && {
        id: goal.id,
        title: goal.title,
        deadline: goal.deadline,
        days_left: daysLeft,
      },
      plan: {
        done: items.filter((item) => item.status === "done").length,
        total: items.length,
        remaining_min_range: [Math.round(remainingLow), Math.round(remainingHigh)],
        status,
      },
      coverage: this.getCoverage(session.course),
      active_item: activeItem
        ? {
            id: activeItem.id,
            title: activeItem.title,
            elapsed_min: activeElapsed,
            est_min_range: [activeItem.est_min_low, activeItem.est_min_high],
            nudge: overEstimate ? "over_estimate" : null,
          }
        : null,
      session: {
        elapsed_min: sessionElapsed,
        time_box_min: session.time_box_min,
        remaining_min: sessionRemaining,
      },
    };
  }

  getCoverage(course: string) {
    const notes = this.db.query("SELECT path FROM notes WHERE course = ? ORDER BY path").all(course) as { path: string }[];
    const sections = notes.flatMap((note) => {
      try {
        return listSections(this.vault.readNote(note.path).body).map((section) => ({
          note: note.path,
          anchor: section.id,
          title: section.title,
        }));
      } catch {
        return [];
      }
    });
    const sectionKeys = new Set(sections.map((section) => `${section.note}#${section.anchor}`));
    const covered = new Map<string, { acceptedVerified: boolean; acceptedUnverified: boolean; proposedVerified: boolean; proposedUnverified: boolean }>();
    const concepts = this.db.query(
      "SELECT status, cites_json, unverified FROM concepts WHERE course = ? AND status != 'rejected'",
    ).all(course) as { status: string; cites_json: string; unverified: number }[];
    for (const concept of concepts) {
      let cites: { note?: string; anchor?: string }[] = [];
      try {
        cites = JSON.parse(concept.cites_json) as { note?: string; anchor?: string }[];
      } catch {
        continue;
      }

      for (const cite of cites) {
        if (!cite.note || !cite.anchor) continue;
        const key = `${cite.note}#${cite.anchor.replace(/^#/, "")}`;
        if (!sectionKeys.has(key)) continue;
        const existing = covered.get(key) ?? {
          acceptedVerified: false,
          acceptedUnverified: false,
          proposedVerified: false,
          proposedUnverified: false,
        };
        if (concept.status === "accepted" && concept.unverified === 0) existing.acceptedVerified = true;
        if (concept.status === "accepted" && concept.unverified === 1) existing.acceptedUnverified = true;
        if (concept.status === "proposed" && concept.unverified === 0) existing.proposedVerified = true;
        if (concept.status === "proposed" && concept.unverified === 1) existing.proposedUnverified = true;
        covered.set(key, existing);
      }
    }
    return {
      sections: sections.length,
      covered_accepted: sections.filter((section) => {
        const item = covered.get(`${section.note}#${section.anchor}`);
        return Boolean(item?.acceptedVerified);
      }).length,
      covered_accepted_unverified: sections.filter((section) => {
        const item = covered.get(`${section.note}#${section.anchor}`);
        return Boolean(item?.acceptedUnverified);
      }).length,
      covered_proposed: sections.filter((section) => {
        const item = covered.get(`${section.note}#${section.anchor}`);
        return Boolean(item?.proposedVerified || item?.proposedUnverified);
      }).length,
      covered_proposed_unverified: sections.filter((section) => {
        const item = covered.get(`${section.note}#${section.anchor}`);
        return Boolean(item?.proposedUnverified);
      }).length,
      uncovered: sections.filter((section) => !covered.has(`${section.note}#${section.anchor}`)),
    };
  }

  recordSessionCarryOver(sessionId: string, endedAt: number): void {
    const session = row(
      this.db.query("SELECT course, goal_id FROM sessions WHERE id = ?").get(sessionId) as
        | { course: string; goal_id: string | null }
        | null,
      `session not found: ${sessionId}`,
    );
    const activities = this.db.query(
      "SELECT plan_item_id, created_at, answered_at FROM activities WHERE session_id = ? AND plan_item_id IS NOT NULL",
    ).all(sessionId) as { plan_item_id: string; created_at: number; answered_at: number | null }[];
    const totals = new Map<string, number>();
    for (const activity of activities) {
      const end = activity.answered_at ?? endedAt;
      const seconds = Math.min(600, Math.max(0, (end - activity.created_at) / 1000));
      totals.set(activity.plan_item_id, (totals.get(activity.plan_item_id) ?? 0) + Math.round(seconds));
    }
    const update = this.db.transaction(() => {
      for (const [planItemId, seconds] of totals) {
        this.db.query(
          "UPDATE plan_items SET actual_sec = actual_sec + ?, updated_at = ? WHERE id = ?",
        ).run(seconds, endedAt, planItemId);
      }
      if (!session.goal_id) return;
      const active = this.db.query(
        `SELECT plan_items.id, goals.course, plan_items.goal_id
         FROM plan_items JOIN goals ON goals.id = plan_items.goal_id
         WHERE plan_items.goal_id = ? AND goals.course = ? AND plan_items.status = 'active'`,
      ).all(session.goal_id, session.course) as { id: string; goal_id: string; course: string }[];
      for (const item of active) {
        this.db.query(
          "UPDATE plan_items SET status = 'deferred', partial = 1, updated_at = ? WHERE id = ? AND status = 'active'",
        ).run(endedAt, item.id);
        this.events.publish({ type: "plan", course: item.course, goalId: item.goal_id, state: "deferred", at: endedAt });
      }
    });
    update();
  }

  list(course?: string) {
    const goals = this.db.query(
      `SELECT * FROM goals ${course ? "WHERE course = ?" : ""} ORDER BY status = 'active' DESC, updated_at DESC`,
    ).all(...(course ? [course] : [])) as Record<string, unknown>[];
    return goals.map((goal) => this.get(String(goal.id)));
  }

  async proposePlan(goalId: string, items: unknown[], requestId?: string) {
    const goal = row(this.db.query("SELECT * FROM goals WHERE id = ?").get(goalId) as { course: string } | null, `goal not found: ${goalId}`);
    const parsed = z.array(planItemInput).parse(items);
    const positions = new Set<number>();
    for (const item of parsed) {
      if (item.est_min_low > item.est_min_high) throw new GoalError("estimate low must not exceed estimate high");
      if (positions.has(item.position)) throw new GoalError(`duplicate plan position: ${item.position}`);
      positions.add(item.position);
      if (item.concept_id) {
        const concept = this.db.query("SELECT id FROM concepts WHERE id = ? AND course = ?").get(item.concept_id, goal.course);
        if (!concept) throw new GoalError(`concept not found in course: ${item.concept_id}`);
      }

      if (item.note_path && item.note_anchor) {
        validateCite(this.vault, { note: item.note_path, anchor: item.note_anchor });
      } else if (item.note_path || item.note_anchor) {
        throw new GoalError("note_path and note_anchor must be provided together");
      }
    }
    return this.idempotent("plan", requestId, () => {
      const now = Date.now();
      const factor = this.calibrationFactor(goal.course);
      const insert = this.db.transaction(() => {
        for (const item of parsed) {
          this.db.query(
            `INSERT INTO plan_items
             (id, goal_id, concept_id, note_path, note_anchor, title, kind, position, est_min_low, est_min_high, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            `plan-${crypto.randomUUID().slice(0, 8)}`, goalId, item.concept_id ?? null, item.note_path ?? null,
            item.note_anchor ?? null, item.title, item.kind, item.position,
            Math.max(1, Math.round(item.est_min_low * factor)),
            Math.max(1, Math.round(item.est_min_high * factor)),
            now, now,
          );
        }
      });
      insert();
      this.events.publish({ type: "plan", course: goal.course, goalId, state: "proposed", at: now });
      return this.get(goalId);
    });
  }

  proposePlanChange(goalId: string, input: unknown, requestId?: string) {
    const goal = row(
      this.db.query("SELECT course FROM goals WHERE id = ?").get(goalId) as { course: string } | null,
      `goal not found: ${goalId}`,
    );
    const diff = planChangeInput.parse(input);
    const existing = this.db.query("SELECT id FROM plan_items WHERE goal_id = ?").all(goalId) as { id: string }[];
    const existingIds = new Set(existing.map((item) => item.id));
    for (const id of [...diff.remove, ...diff.defer, ...diff.reorder.map((item) => item.id)]) {
      if (!existingIds.has(id)) throw new GoalError(`plan item not found in goal: ${id}`);
    }
    const reorderIds = new Set(diff.reorder.map((item) => item.id));
    if (reorderIds.size !== diff.reorder.length) throw new GoalError("duplicate plan item in reorder");
    const positions = new Set(diff.reorder.map((item) => item.position));
    if (positions.size !== diff.reorder.length) throw new GoalError("duplicate plan position in reorder");
    for (const item of diff.add) {
      if (item.est_min_low > item.est_min_high) throw new GoalError("estimate low must not exceed estimate high");
      if (item.concept_id) {
        const concept = this.db.query("SELECT id FROM concepts WHERE id = ? AND course = ?").get(item.concept_id, goal.course);
        if (!concept) throw new GoalError(`concept not found in course: ${item.concept_id}`);
      }
      if (item.note_path && item.note_anchor) validateCite(this.vault, { note: item.note_path, anchor: item.note_anchor });
      else if (item.note_path || item.note_anchor) throw new GoalError("note_path and note_anchor must be provided together");
    }
    return this.idempotent("plan-change", requestId, () => {
      const id = `change-${crypto.randomUUID().slice(0, 8)}`;
      this.db.query(
        "INSERT INTO plan_changes (id, goal_id, diff_json, created_at) VALUES (?, ?, ?, ?)",
      ).run(id, goalId, JSON.stringify(diff), Date.now());
      this.events.publish({ type: "plan", course: goal.course, goalId, state: "change_proposed", at: Date.now() });
      return this.getPlanChange(id);
    });
  }

  getPlanChange(id: string) {
    const change = row(
      this.db.query("SELECT * FROM plan_changes WHERE id = ?").get(id) as Record<string, unknown> | null,
      `plan change not found: ${id}`,
    );
    return { ...change, diff: JSON.parse(String(change.diff_json)) };
  }

  listPlanChanges(goalId: string) {
    return this.db.query(
      "SELECT * FROM plan_changes WHERE goal_id = ? ORDER BY created_at DESC",
    ).all(goalId).map((change) => ({
      ...change,
      diff: JSON.parse(String((change as { diff_json: string }).diff_json)),
    }));
  }

  applyPlanChange(id: string) {
    const change = row(
      this.db.query("SELECT * FROM plan_changes WHERE id = ?").get(id) as { goal_id: string; status: string } | null,
      `plan change not found: ${id}`,
    );
    if (change.status !== "draft") return this.get(change.goal_id);
    const goal = row(
      this.db.query("SELECT course FROM goals WHERE id = ?").get(change.goal_id) as { course: string } | null,
      `goal not found: ${change.goal_id}`,
    );
    const stored = this.db.query("SELECT diff_json FROM plan_changes WHERE id = ?").get(id) as { diff_json: string };
    const diff = planChangeInput.parse(JSON.parse(stored.diff_json));
    const now = Date.now();
    const apply = this.db.transaction(() => {
      for (const item of diff.remove) {
        this.db.query("DELETE FROM plan_items WHERE id = ? AND goal_id = ?").run(item, change.goal_id);
      }
      for (const item of diff.defer) {
        this.db.query(
          "UPDATE plan_items SET status = 'deferred', partial = 1, updated_at = ? WHERE id = ? AND goal_id = ?",
        ).run(now, item, change.goal_id);
      }
      for (const item of diff.reorder) {
        this.db.query(
          "UPDATE plan_items SET position = ?, updated_at = ? WHERE id = ? AND goal_id = ?",
        ).run(item.position, now, item.id, change.goal_id);
      }
      for (const item of diff.add) {
        this.db.query(
          `INSERT INTO plan_items
           (id, goal_id, concept_id, note_path, note_anchor, title, kind, position, est_min_low, est_min_high, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `plan-${crypto.randomUUID().slice(0, 8)}`, change.goal_id, item.concept_id ?? null,
          item.note_path ?? null, item.note_anchor ?? null, item.title, item.kind, item.position,
          Math.max(1, Math.round(item.est_min_low * this.calibrationFactor(goal.course))),
          Math.max(1, Math.round(item.est_min_high * this.calibrationFactor(goal.course))),
          now, now,
        );
      }
      this.db.query("UPDATE plan_changes SET status = 'applied', applied_at = ? WHERE id = ?").run(now, id);
    });
    apply();
    this.events.publish({ type: "plan", course: goal.course, goalId: change.goal_id, state: "change_applied", at: now });
    return this.get(change.goal_id);
  }

  updatePlanItem(
    id: string,
    input: unknown,
    requestId?: string,
  ) {
    const patch = planPatch.parse(input);
    const item = row(this.db.query("SELECT * FROM plan_items WHERE id = ?").get(id) as { goal_id: string } | null, `plan item not found: ${id}`);
    return this.idempotent("plan-update", requestId, () => {
      const fields: string[] = [];
      const values: unknown[] = [];
      if (patch.status) { fields.push("status = ?"); values.push(patch.status); }
      if (patch.partial !== undefined) { fields.push("partial = ?"); values.push(patch.partial ? 1 : 0); }
      if (patch.plan_state) { fields.push("plan_state = ?"); values.push(patch.plan_state); }
      if (patch.position !== undefined) { fields.push("position = ?"); values.push(patch.position); }
      if (fields.length) {
        fields.push("updated_at = ?");
        values.push(Date.now(), id);
        this.db.query(`UPDATE plan_items SET ${fields.join(", ")} WHERE id = ?`).run(...values);
        this.events.publish({ type: "plan", course: this.get(item.goal_id).course as string, goalId: item.goal_id, state: "updated", at: Date.now() });
      }
      return this.get(item.goal_id);
    });
  }

  async addTask(input: unknown, requestId?: string) {
    const value = taskInput.parse(input);
    const course = (await this.vault.listCourses()).find((item) => item.code === value.course);
    if (!course) throw new GoalError(`course not found: ${value.course}`);
    if (value.goal_id) {
      const goal = this.db.query("SELECT course FROM goals WHERE id = ?").get(value.goal_id) as { course: string } | null;
      if (!goal || goal.course !== value.course) throw new GoalError("goal does not belong to course");
    }
    if (value.plan_item_id) {
      const item = this.db.query(
        `SELECT plan_items.id, plan_items.goal_id, goals.course
         FROM plan_items JOIN goals ON goals.id = plan_items.goal_id
         WHERE plan_items.id = ?`,
      ).get(value.plan_item_id) as { id: string; goal_id: string; course: string } | null;
      if (!item || item.course !== value.course || (value.goal_id && item.goal_id !== value.goal_id)) {
        throw new GoalError(`plan item does not belong to course: ${value.plan_item_id}`);
      }
    }
    const targetConcept = value.target_json?.concept_id;
    if (typeof targetConcept === "string") {
      const concept = this.db.query(
        "SELECT id FROM concepts WHERE id = ? AND course = ?",
      ).get(targetConcept, value.course);
      if (!concept) throw new GoalError(`concept not found in course: ${targetConcept}`);
    }
    return this.idempotent("task", requestId, () => {
      const id = `task-${crypto.randomUUID().slice(0, 8)}`;
      const now = Date.now();
      this.db.query(
        `INSERT INTO tasks (id, course, goal_id, plan_item_id, title, kind, target_json, due_date, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, value.course, value.goal_id ?? null, value.plan_item_id ?? null, value.title, value.kind, value.target_json ? JSON.stringify(value.target_json) : null, value.due_date ?? null, value.source, now);
      this.events.publish({ type: "task", course: value.course, taskId: id, state: "created", at: now });
      return this.db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    });
  }

  updateTask(id: string, input: unknown, requestId?: string) {
    const patch = taskPatch.parse(input);
    const task = row(this.db.query("SELECT * FROM tasks WHERE id = ?").get(id) as { course: string } | null, `task not found: ${id}`);
    return this.idempotent("task-update", requestId, () => {
      if (!patch.status) return this.db.query("SELECT * FROM tasks WHERE id = ?").get(id);
      this.db.query("UPDATE tasks SET status = ?, done_at = ? WHERE id = ?").run(patch.status, patch.status === "done" ? Date.now() : null, id);
      this.events.publish({ type: "task", course: task.course, taskId: id, state: patch.status, at: Date.now() });
      return this.db.query("SELECT * FROM tasks WHERE id = ?").get(id);
    });
  }

  autoCompleteTasks(course: string, sessionId: string): void {
    const tasks = this.db.query(
      `SELECT id, kind, target_json, goal_id, plan_item_id, created_at
       FROM tasks WHERE course = ? AND status = 'open' AND kind IN ('practice', 'review', 'revisit')`,
    ).all(course) as {
      id: string;
      kind: "practice" | "review" | "revisit";
      target_json: string | null;
      goal_id: string | null;
      plan_item_id: string | null;
      created_at: number;
    }[];
    for (const task of tasks) {
      let target: { questions?: number; concept_id?: string } = {};
      try {
        target = task.target_json ? JSON.parse(task.target_json) as typeof target : {};
      } catch {
        continue;
      }
      const conceptId = target.concept_id ?? null;
      const evidence = this.db.query(
        `SELECT COUNT(DISTINCT e.activity_id) AS activities,
                COALESCE(SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END), 0) AS correct
         FROM evidence e
         JOIN sessions s ON s.id = e.session_id
         WHERE s.course = ? AND e.created_at >= ? ${conceptId ? "AND e.concept_id = ?" : ""}`,
      ).get(...(conceptId ? [course, task.created_at, conceptId] : [course, task.created_at])) as {
        activities: number;
        correct: number;
      };
      let complete = false;
      if (task.kind === "practice") {
        complete = evidence.activities >= Math.max(1, target.questions ?? 1);
      } else if (conceptId) {
        const mastery = this.concepts
          ? this.concepts.get(conceptId).mastery
          : this.db.query("SELECT state FROM mastery WHERE concept_id = ?").get(conceptId) as { state: string } | null;
        complete = task.kind === "revisit"
          ? mastery?.state === "understood" || mastery?.state === "mastered"
          : Boolean(mastery && mastery.state !== "decayed" && mastery.state !== "unseen");
      } else {
        complete = evidence.correct > 0;
      }
      if (complete) {
        const now = Date.now();
        this.db.query("UPDATE tasks SET status = 'done', done_at = ? WHERE id = ? AND status = 'open'").run(now, task.id);
        this.events.publish({ type: "task", course, taskId: task.id, state: "done", at: now });
      }
    }
  }

  listTasks(course: string, status?: "open" | "done" | "dropped") {
    return this.db.query(
      `SELECT * FROM tasks WHERE course = ? ${status ? "AND status = ?" : ""} ORDER BY status, due_date, created_at`,
    ).all(...(status ? [course, status] : [course]));
  }
}

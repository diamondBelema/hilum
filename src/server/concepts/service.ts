import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import { parseNote, stringList, stringValue } from "../vault/frontmatter.ts";
import { slug } from "../vault/paths.ts";
import { validateCites, type Cite } from "../questions/citations.ts";
import {
  conceptInputSchema,
  conceptPatchSchema,
  EDGE_TYPES,
  type ConceptInput,
  type ConceptPatch,
  type ConceptStatus,
  type EdgeType,
} from "./validation.ts";

export class ConceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptError";
  }
}

type ConceptRow = {
  id: string;
  course: string;
  title: string;
  aliases: string;
  parent_id: string | null;
  status: string;
  exam_weight: number;
  lecturer_flag: number;
  cites_json: string;
  unverified: number;
  path: string;
  updated_at: number;
};

type EvidenceRow = {
  id: number;
  session_id: string | null;
  activity_id: string | null;
  answer_id: number | null;
  concept_id: string;
  kind: string;
  correct: number | null;
  confidence: string | null;
  time_sec: number;
  excerpt: string | null;
  created_at: number;
};

export type MasteryState = "unseen" | "familiar" | "understood" | "mastered" | "decayed";
export type BaseMasteryState = Exclude<MasteryState, "decayed">;
export type MasteryView = {
  conceptId: string;
  state: MasteryState;
  baseState: BaseMasteryState;
  score: number;
  evidenceCount: number;
  lastEvidenceAt: number | null;
  decayDueAt: number | null;
  overdue: boolean;
};

export type ConceptSummary = {
  id: string;
  course: string;
  title: string;
  aliases: string[];
  parentId: string | null;
  status: ConceptStatus;
  examWeight: number;
  lecturerFlag: boolean;
  unverified: boolean;
  cites: Cite[];
  path: string;
  mastery: MasteryView;
};

export type ConceptNode = ConceptSummary & {
  depth: number;
  childCount: number;
  rollup: Rollup;
};

export type Rollup = {
  total: number;
  mastered: number;
  understood: number;
  familiar: number;
  unseen: number;
  due: number;
  weightedMastery: number;
};

export type FrontierItem = {
  concept: ConceptSummary;
  rank: number;
  reason: string;
  recentErrors: number;
  daysUntilExam: number | null;
};

export type CourseProgress = {
  code: string;
  title: string;
  examDate: string | null;
  total: number;
  mastered: number;
  understood: number;
  due: number;
  highWeightTotal: number;
  highWeightMastered: number;
  percent: number;
};

export type Dashboard = {
  next: FrontierItem[];
  due: ConceptSummary[];
  courses: CourseProgress[];
  exams: { course: string; title: string; examDate: string; days: number }[];
  counts: Record<MasteryState, number> & { total: number };
};

export type ConceptDetail = ConceptSummary & {
  definition: string;
  prerequisites: ConceptSummary[];
  related: ConceptSummary[];
  contrasts: ConceptSummary[];
  children: ConceptSummary[];
  linkedFrom: ConceptSummary[];
  timeline: {
    id: number;
    kind: string;
    correct: boolean | null;
    confidence: string | null;
    timeSec: number;
    excerpt: string | null;
    createdAt: number;
    sessionId: string | null;
    sessionNotePath: string | null;
    activityTitle: string | null;
    attemptId: string | null;
    questionType: string | null;
  }[];
  practice: { id: string; type: string; prompt: string; marks: number; verified: boolean }[];
};

const DAY = 86_400_000;
const EMPTY_ROLLUP: Rollup = {
  total: 0,
  mastered: 0,
  understood: 0,
  familiar: 0,
  unseen: 0,
  due: 0,
  weightedMastery: 0,
};

const STATE_LABELS: Record<MasteryState, string> = {
  unseen: "Not seen",
  familiar: "Familiar",
  understood: "Understood",
  mastered: "Mastered",
  decayed: "Due for review",
};

export function masteryLabel(state: MasteryState): string {
  return STATE_LABELS[state];
}

export class ConceptService {
  private readonly dir: string;
  private syncKey: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly vault: VaultService,
  ) {
    this.dir = join(vault.root, "concepts");
    mkdirSync(this.dir, { recursive: true });
  }

  sync(): void {
    let files: string[];
    try {
      files = readdirSync(this.dir).filter((name) => name.endsWith(".md") && !name.startsWith("."));
    } catch {
      files = [];
    }
    const key = files
      .map((file) => {
        try {
          const stat = statSync(join(this.dir, file));
          return `${file}:${stat.mtimeMs}:${stat.size}`;
        } catch {
          return file;
        }
      })
      .join("|");
    if (key === this.syncKey) return;
    const seen = new Set<string>();
    for (const file of files) {
      const path = `concepts/${file}`;
      let parsed;
      try {
        parsed = parseNote(readFileSync(join(this.dir, file), "utf8"));
      } catch {
        continue;
      }
      const fm = parsed.frontmatter;
      const id = stringValue(fm.id) ?? file.replace(/\.md$/, "");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) continue;
      const course = stringValue(fm.course);
      const title = stringValue(fm.title);
      if (!course || !title) continue;
      const alias = stringList(fm.aliases);
      const parent = stringValue(fm.parent ?? fm.parent_id);
      const status = normalizeStatus(stringValue(fm.status));
      const weight = numberValue(fm.exam_weight, 0.05);
      const cites = citeList(fm.cites);
      const now = Date.now();
      seen.add(id);
      this.db
        .query(
          `INSERT INTO concepts (id, course, title, aliases, parent_id, status, exam_weight, lecturer_flag, cites_json, unverified, path, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             course = excluded.course, title = excluded.title, aliases = excluded.aliases,
             parent_id = excluded.parent_id, status = excluded.status, exam_weight = excluded.exam_weight,
             lecturer_flag = excluded.lecturer_flag, cites_json = excluded.cites_json,
             unverified = excluded.unverified, path = excluded.path, updated_at = excluded.updated_at`,
        )
        .run(
          id,
          course,
          title,
          JSON.stringify(alias),
          parent,
          status,
          weight,
          fm.lecturer_flag === true ? 1 : 0,
          JSON.stringify(cites),
          fm.unverified === true ? 1 : 0,
          path,
          now,
        );
      this.db.query("DELETE FROM edges WHERE from_id = ?").run(id);
      const edge = this.db.query("INSERT OR IGNORE INTO edges (from_id, to_id, type) VALUES (?, ?, ?)");
      if (parent) edge.run(id, parent, "parent");
      for (const to of stringList(fm.prerequisites)) edge.run(id, to, "prerequisite");
      for (const to of stringList(fm.related)) edge.run(id, to, "related");
      for (const to of stringList(fm.contrasts)) edge.run(id, to, "contrasts_with");
      this.db.query("INSERT OR IGNORE INTO mastery (concept_id) VALUES (?)").run(id);
    }

    const known = this.db.query("SELECT id FROM concepts").all() as { id: string }[];
    for (const row of known) {
      if (seen.has(row.id)) continue;
      this.db.query("DELETE FROM concepts WHERE id = ?").run(row.id);
      this.db.query("DELETE FROM edges WHERE from_id = ? OR to_id = ?").run(row.id, row.id);
      this.db.query("DELETE FROM mastery WHERE concept_id = ?").run(row.id);
    }
    this.syncKey = key;
  }

  find(query: string, course?: string | null, limit = 10): ConceptSummary[] {
    this.sync();
    const q = normalizeName(query);
    const rows = (
      course
        ? this.db.query("SELECT * FROM concepts WHERE course = ? ORDER BY title").all(course)
        : this.db.query("SELECT * FROM concepts ORDER BY course, title").all()
    ) as ConceptRow[];
    if (!q) return rows.slice(0, limit).map((row) => this.summary(row));
    const scored = rows
      .map((row) => ({ row, score: nameScore(q, [row.title, ...(JSON.parse(row.aliases) as string[])]) }))
      .filter((item) => item.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.row.exam_weight - a.row.exam_weight ||
          a.row.title.localeCompare(b.row.title),
      );
    return scored.slice(0, limit).map((item) => this.summary(item.row));
  }

  list(course?: string | null, status?: ConceptStatus): ConceptSummary[] {
    this.sync();
    const clauses: string[] = [];
    const params: string[] = [];
    if (course) {
      clauses.push("course = ?");
      params.push(course);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .query(`SELECT * FROM concepts ${where} ORDER BY course, title`)
      .all(...params) as ConceptRow[];
    return rows.map((row) => this.summary(row));
  }

  get(id: string): ConceptDetail {
    this.sync();
    const row = this.row(id);
    const base = this.summary(row);
    const body = this.definition(row);
    const parents = this.relatedRows(id, "parent");
    const prerequisites = this.relatedRows(id, "prerequisite");
    const related = this.relatedRows(id, "related");
    const contrasts = this.relatedRows(id, "contrasts_with");
    const children = this.db
      .query("SELECT * FROM concepts WHERE parent_id = ? ORDER BY title")
      .all(id) as ConceptRow[];
    const linkedFrom = this.db
      .query(
        `SELECT c.* FROM concepts c JOIN edges e ON e.from_id = c.id
         WHERE e.to_id = ? AND e.type IN ('related', 'contrasts_with') ORDER BY c.title`,
      )
      .all(id) as ConceptRow[];
    const timelineRows = this.db
      .query(
        `SELECT e.*, s.note_path AS session_note_path,
           (SELECT spec_json FROM activities a WHERE a.id = e.activity_id) AS activity_spec,
           (SELECT ans.attempt_id FROM answers ans WHERE ans.id = e.answer_id) AS attempt_id,
           (SELECT q.type FROM answers ans JOIN questions q ON q.id = ans.question_id WHERE ans.id = e.answer_id) AS question_type
         FROM evidence e LEFT JOIN sessions s ON s.id = e.session_id
         WHERE e.concept_id = ? ORDER BY e.created_at DESC LIMIT 50`,
      )
      .all(id) as (EvidenceRow & {
      session_note_path: string | null;
      activity_spec: string | null;
      attempt_id: string | null;
      question_type: string | null;
    })[];
    const practiceRows = this.db
      .query("SELECT id, type, body_json, marks, verified FROM questions WHERE concept_ids LIKE ? ORDER BY created_at DESC LIMIT 20")
      .all(`%${JSON.stringify(id)}%`) as {
      id: string;
      type: string;
      body_json: string;
      marks: number;
      verified: number;
    }[];
    return {
      ...base,
      definition: body,
      prerequisites: prerequisites.map((item) => this.summary(item)),
      related: related.map((item) => this.summary(item)),
      contrasts: contrasts.map((item) => this.summary(item)),
      children: children.map((item) => this.summary(item)),
      linkedFrom: linkedFrom.map((item) => this.summary(item)),
      timeline: timelineRows.map((item) => {
        let activityTitle: string | null = null;
        if (item.activity_spec) {
          try {
            activityTitle = stringValue(JSON.parse(item.activity_spec).title);
          } catch {
            activityTitle = null;
          }
        }
        return {
          id: item.id,
          kind: item.kind,
          correct: item.correct === null ? null : item.correct === 1,
          confidence: item.confidence,
          timeSec: item.time_sec,
          excerpt: item.excerpt,
          createdAt: item.created_at,
          sessionId: item.session_id,
          sessionNotePath: item.session_note_path,
          activityTitle,
          attemptId: item.attempt_id,
          questionType: item.question_type,
        };
      }),
      practice: practiceRows.map((item) => {
        let prompt = item.type;
        try {
          const body = JSON.parse(item.body_json) as { stem?: string; prompt?: string };
          prompt = body.stem ?? body.prompt ?? prompt;
        } catch {
          /* keep the type as a fallback */
        }
        return { id: item.id, type: item.type, prompt, marks: item.marks, verified: item.verified === 1 };
      }),
    };
  }

  async add(input: ConceptInput, requestId?: string): Promise<ConceptDetail> {
    const parsed = conceptInputSchema.parse(input);
    const courses = await this.vault.listCourses();
    if (!courses.some((course) => course.code === parsed.course)) {
      throw new ConceptError(`course not found: ${parsed.course}`);
    }
    if (requestId) {
      const cached = this.db
        .query("SELECT result FROM idempotency WHERE key = ?")
        .get(`add_concept:${requestId}`) as { result: string } | null;
      if (cached) return this.get((JSON.parse(cached.result) as { id: string }).id);
    }
    this.sync();
    const id = parsed.id ?? `${parsed.course}-${slug(parsed.title).slice(0, 48)}`;
    if (!id) throw new ConceptError("concept id is required");
    if (this.db.query("SELECT 1 FROM concepts WHERE id = ?").get(id)) {
      throw new ConceptError(`concept already exists: ${id}. Use find_concepts and update it instead.`);
    }
    const cites = validateCites(this.vault, parsed.cites);
    this.assertRefs(
      parsed.course,
      [parsed.parent, ...parsed.prerequisites, ...parsed.related, ...parsed.contrasts].filter(isString),
    );
    if (parsed.parent) this.assertNoParentCycle(id, parsed.parent);
    await this.writeFile(id, {
      id,
      course: parsed.course,
      title: parsed.title,
      aliases: parsed.aliases,
      parent: parsed.parent ?? null,
      prerequisites: parsed.prerequisites,
      related: parsed.related,
      contrasts: parsed.contrasts,
      topics: parsed.topics,
      exam_weight: parsed.exam_weight,
      lecturer_flag: parsed.lecturer_flag,
      status: parsed.status,
      unverified: parsed.unverified,
      cites,
      definition: parsed.definition,
    }, "create");
    this.sync();
    if (requestId) {
      this.db
        .query("INSERT OR REPLACE INTO idempotency (key, result, created_at) VALUES (?, ?, ?)")
        .run(`add_concept:${requestId}`, JSON.stringify({ id }), Date.now());
    }
    return this.get(id);
  }

  async update(id: string, patch: ConceptPatch): Promise<ConceptDetail> {
    const parsed = conceptPatchSchema.parse(patch);
    this.sync();
    const row = this.row(id);
    const current = this.fileParts(row);
    const next = {
      ...current,
      ...(parsed.title !== undefined ? { title: parsed.title } : {}),
      ...(parsed.aliases !== undefined ? { aliases: parsed.aliases } : {}),
      ...(parsed.parent !== undefined ? { parent: parsed.parent ?? null } : {}),
      ...(parsed.prerequisites !== undefined ? { prerequisites: parsed.prerequisites } : {}),
      ...(parsed.related !== undefined ? { related: parsed.related } : {}),
      ...(parsed.contrasts !== undefined ? { contrasts: parsed.contrasts } : {}),
      ...(parsed.topics !== undefined ? { topics: parsed.topics } : {}),
      ...(parsed.exam_weight !== undefined ? { exam_weight: parsed.exam_weight } : {}),
      ...(parsed.lecturer_flag !== undefined ? { lecturer_flag: parsed.lecturer_flag } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.unverified !== undefined ? { unverified: parsed.unverified } : {}),
      ...(parsed.definition !== undefined ? { definition: parsed.definition } : {}),
    };
    const cites = parsed.cites ? validateCites(this.vault, parsed.cites) : current.cites;
    if (cites.length === 0) throw new ConceptError("at least one citation is required");
    this.assertRefs(
      row.course,
      [next.parent, ...next.prerequisites, ...next.related, ...next.contrasts].filter(isString),
    );
    if (next.parent) this.assertNoParentCycle(id, next.parent);
    await this.writeFile(id, { ...next, cites }, "replace");
    this.sync();
    return this.get(id);
  }

  async link(fromId: string, toId: string, type: EdgeType): Promise<ConceptDetail> {
    if (!EDGE_TYPES.includes(type)) throw new ConceptError(`unknown edge type: ${type}`);
    if (fromId === toId) throw new ConceptError("a concept cannot link to itself");
    this.sync();
    const from = this.row(fromId);
    const to = this.row(toId);
    if (from.course !== to.course) {
      throw new ConceptError("linked concepts must belong to the same course");
    }
    const parts = this.fileParts(from);
    if (type === "parent") {
      this.assertNoParentCycle(fromId, toId);
      parts.parent = toId;
    } else {
      const key = type === "prerequisite" ? "prerequisites" : type === "related" ? "related" : "contrasts";
      const list = parts[key];
      if (!list.includes(toId)) list.push(toId);
    }
    await this.writeFile(fromId, parts, "replace");
    this.sync();
    return this.get(fromId);
  }

  graph(course?: string | null, filter?: string): {
    nodes: ConceptSummary[];
    edges: { from: string; to: string; type: EdgeType }[];
  } {
    this.sync();
    let nodes = this.list(course);
    if (filter === "proposed") nodes = nodes.filter((node) => node.status === "proposed");
    if (filter === "due") nodes = nodes.filter((node) => node.mastery.overdue);
    const ids = new Set(nodes.map((node) => node.id));
    const rows = this.db.query("SELECT * FROM edges ORDER BY from_id, type, to_id").all() as {
      from_id: string;
      to_id: string;
      type: EdgeType;
    }[];
    return {
      nodes,
      edges: rows
        .filter((row) => ids.has(row.from_id) && ids.has(row.to_id))
        .map((row) => ({ from: row.from_id, to: row.to_id, type: row.type })),
    };
  }

  tree(course: string): ConceptNode[] {
    this.sync();
    const rows = this.list(course);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const children = new Map<string, ConceptSummary[]>();
    const roots: ConceptSummary[] = [];
    for (const row of rows) {
      if (row.parentId && byId.has(row.parentId)) {
        const list = children.get(row.parentId) ?? [];
        list.push(row);
        children.set(row.parentId, list);
      } else {
        roots.push(row);
      }
    }
    for (const list of children.values()) list.sort((a, b) => b.examWeight - a.examWeight || a.title.localeCompare(b.title));
    roots.sort((a, b) => b.examWeight - a.examWeight || a.title.localeCompare(b.title));
    const rollups = new Map<string, Rollup>();
    const rollupFor = (concept: ConceptSummary, seen: Set<string>): Rollup => {
      const cached = rollups.get(concept.id);
      if (cached) return cached;
      if (seen.has(concept.id)) return { ...EMPTY_ROLLUP };
      seen.add(concept.id);
      const rollup = rollupOf(concept, concept.mastery);
      for (const child of children.get(concept.id) ?? []) {
        const childRollup = rollupFor(child, seen);
        rollup.total += childRollup.total;
        rollup.mastered += childRollup.mastered;
        rollup.understood += childRollup.understood;
        rollup.familiar += childRollup.familiar;
        rollup.unseen += childRollup.unseen;
        rollup.due += childRollup.due;
        rollup.weightedMastery += childRollup.weightedMastery;
      }
      rollups.set(concept.id, rollup);
      return rollup;
    };
    for (const root of roots) rollupFor(root, new Set());
    const out: ConceptNode[] = [];
    const visit = (concept: ConceptSummary, depth: number) => {
      const kids = children.get(concept.id) ?? [];
      out.push({
        ...concept,
        depth,
        childCount: kids.length,
        rollup: rollups.get(concept.id) ?? { ...EMPTY_ROLLUP },
      });
      for (const child of kids) visit(child, depth + 1);
    };
    for (const root of roots) visit(root, 0);
    return out;
  }

  snapshot(course?: string | null): {
    counts: Record<MasteryState, number> & { total: number };
    concepts: ConceptSummary[];
  } {
    const concepts = this.list(course);
    return { counts: countStates(concepts), concepts };
  }

  due(course?: string | null, limit = 20): ConceptSummary[] {
    return this.list(course)
      .filter((concept) => concept.mastery.overdue)
      .sort(
        (a, b) =>
          (b.mastery.decayDueAt ?? 0) - (a.mastery.decayDueAt ?? 0) ||
          b.examWeight - a.examWeight,
      )
      .slice(0, limit);
  }

  next(course: string, n = 5, examDate?: string | null): FrontierItem[] {
    this.sync();
    const rows = this.list(course);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const prereqs = new Map<string, string[]>();
    const edgeRows = this.db
      .query("SELECT from_id, to_id FROM edges WHERE type = 'prerequisite'")
      .all() as { from_id: string; to_id: string }[];
    for (const edge of edgeRows) {
      const list = prereqs.get(edge.from_id) ?? [];
      list.push(edge.to_id);
      prereqs.set(edge.from_id, list);
    }
    const examDays = daysUntil(examDate);
    const errors = new Map<string, number>();
    const since = Date.now() - 7 * DAY;
    const errorRows = this.db
      .query(
        "SELECT concept_id, COUNT(*) AS n FROM evidence WHERE correct = 0 AND created_at >= ? GROUP BY concept_id",
      )
      .all(since) as { concept_id: string; n: number }[];
    for (const row of errorRows) errors.set(row.concept_id, row.n);

    const candidates: FrontierItem[] = [];
    for (const concept of rows) {
      if (concept.status === "rejected") continue;
      const base = concept.mastery.baseState;
      if (base === "mastered" && !concept.mastery.overdue) continue;
      const prereqIds = prereqs.get(concept.id) ?? [];
      const prereqReady = prereqIds.every((id) => {
        const prereq = byId.get(id);
        if (!prereq) {
          console.warn(`Ignoring missing prerequisite ${id} for concept ${concept.id}`);
          return true;
        }
        return prereq
          ? prereq.mastery.state === "understood" || prereq.mastery.state === "mastered"
          : false;
      });
      if (!prereqReady) continue;
      const recentErrors = errors.get(concept.id) ?? 0;
      let rank = concept.examWeight * 100;
      if (concept.mastery.overdue) {
        const overdueDays = concept.mastery.decayDueAt
          ? Math.max(0, (Date.now() - concept.mastery.decayDueAt) / DAY)
          : 0;
        rank += 30 + Math.min(25, overdueDays);
      }
      if (concept.lecturerFlag) rank += 18;
      if (recentErrors > 0) rank += 8 + Math.min(15, recentErrors * 3);
      if (prereqIds.length === 0) rank += 4;
      if (examDays !== null && examDays <= 42) rank += Math.max(0, (42 - examDays) / 3);
      let reason = "Prerequisites done";
      if (concept.status === "proposed") {
        reason = "Unreviewed concept";
      } else if (concept.mastery.overdue) {
        reason = `Review due${concept.mastery.decayDueAt ? `, ${Math.max(1, Math.round((Date.now() - concept.mastery.decayDueAt) / DAY))} days overdue` : ""}`;
      } else if (recentErrors > 0) {
        reason = `${recentErrors} ${recentErrors === 1 ? "miss" : "misses"} in the last week`;
      } else if (concept.lecturerFlag) {
        reason = "Lecturer flagged";
      } else if (prereqIds.length === 0) {
        reason = "Start here, no prerequisites";
      } else if (concept.examWeight >= 0.1) {
        reason = "Prerequisites done, high exam weight";
      }
      candidates.push({ concept, rank, reason, recentErrors, daysUntilExam: examDays });
    }
    return candidates
      .sort(
        (a, b) =>
          b.rank - a.rank ||
          b.concept.examWeight - a.concept.examWeight ||
          a.concept.title.localeCompare(b.concept.title),
      )
      .slice(0, n);
  }

  weak(course: string, limit = 10): ConceptSummary[] {
    return this.list(course)
      .filter((concept) => concept.mastery.evidenceCount > 0)
      .sort(
        (a, b) =>
          stateOrder(a.mastery.state) - stateOrder(b.mastery.state) ||
          a.mastery.score - b.mastery.score ||
          b.examWeight - a.examWeight,
      )
      .slice(0, limit);
  }

  async dashboard(): Promise<Dashboard> {
    this.sync();
    const courses = await this.vault.listCourses();
    const all = this.list();
    const next: FrontierItem[] = [];
    for (const course of courses) {
      next.push(...this.next(course.code, 3, course.examDate));
    }
    next.sort((a, b) => b.rank - a.rank || a.concept.title.localeCompare(b.concept.title));
    const due = this.due(null, 12);
    const progress = courses.map((course) => {
      const concepts = all.filter((concept) => concept.course === course.code);
      const weights = concepts.map((concept) => concept.examWeight);
      const max = Math.max(0, ...weights);
      const cutoff = Math.max(0.05, max * 0.6);
      const high = concepts.filter((concept) => concept.examWeight >= cutoff);
      const highWeightMastered = high.filter((concept) => concept.mastery.state === "mastered").length;
      return {
        code: course.code,
        title: course.title,
        examDate: course.examDate,
        total: concepts.length,
        mastered: concepts.filter((concept) => concept.mastery.state === "mastered").length,
        understood: concepts.filter((concept) => concept.mastery.state === "understood").length,
        due: concepts.filter((concept) => concept.mastery.overdue).length,
        highWeightTotal: high.length,
        highWeightMastered,
        percent: high.length > 0 ? Math.round((highWeightMastered / high.length) * 100) : 0,
      };
    });
    const exams = courses
      .filter((course) => course.examDate)
      .map((course) => ({
        course: course.code,
        title: course.title,
        examDate: course.examDate!,
        days: daysUntil(course.examDate) ?? 0,
      }))
      .sort((a, b) => a.days - b.days);
    return {
      next: next.slice(0, 3),
      due,
      courses: progress,
      exams,
      counts: countStates(all),
    };
  }

  recordRealResult(input: {
    conceptId: string;
    correct?: boolean | null;
    kind?: string;
    confidence?: string | null;
    excerpt?: string;
  }): { id: number; conceptId: string } {
    this.sync();
    const concept = this.row(input.conceptId);
    const result = this.db
      .query(
        `INSERT INTO real_results (concept_id, course, kind, correct, confidence, excerpt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.conceptId,
        concept.course,
        input.kind?.trim() || "real_result",
        input.correct === undefined || input.correct === null ? null : input.correct ? 1 : 0,
        input.confidence ?? null,
        input.excerpt ?? null,
        Date.now(),
      );
    return { id: Number(result.lastInsertRowid), conceptId: input.conceptId };
  }

  private summary(row: ConceptRow): ConceptSummary {
    return {
      id: row.id,
      course: row.course,
      title: row.title,
      aliases: JSON.parse(row.aliases) as string[],
      parentId: row.parent_id,
      status: row.status as ConceptStatus,
      examWeight: row.exam_weight,
      lecturerFlag: row.lecturer_flag === 1,
      unverified: row.unverified === 1,
      cites: JSON.parse(row.cites_json) as Cite[],
      path: row.path,
      mastery: this.masteryFor(row.id),
    };
  }

  private masteryFor(conceptId: string): MasteryView {
    const rows = this.db
      .query("SELECT * FROM evidence WHERE concept_id = ? ORDER BY created_at DESC, id DESC")
      .all(conceptId) as EvidenceRow[];
    const view = computeMastery(conceptId, rows);
    this.db
      .query(
        `INSERT INTO mastery (concept_id, state, score, last_evidence_at, decay_due_at, evidence_count)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(concept_id) DO UPDATE SET
           state = excluded.state, score = excluded.score, last_evidence_at = excluded.last_evidence_at,
           decay_due_at = excluded.decay_due_at, evidence_count = excluded.evidence_count`,
      )
      .run(
        conceptId,
        view.baseState,
        view.score,
        view.lastEvidenceAt,
        view.decayDueAt,
        view.evidenceCount,
      );
    return view;
  }

  private row(id: string): ConceptRow {
    const row = this.db.query("SELECT * FROM concepts WHERE id = ?").get(id) as ConceptRow | null;
    if (!row) throw new ConceptError(`concept not found: ${id}`);
    return row;
  }

  private relatedRows(id: string, type: EdgeType): ConceptRow[] {
    return this.db
      .query(
        `SELECT c.* FROM concepts c JOIN edges e ON e.to_id = c.id
         WHERE e.from_id = ? AND e.type = ? ORDER BY c.title`,
      )
      .all(id, type) as ConceptRow[];
  }

  private definition(row: ConceptRow): string {
    try {
      const raw = readFileSync(join(this.vault.root, row.path), "utf8");
      return parseNote(raw).body.replace(/^\s*#\s+.+\n+/, "").trim();
    } catch {
      return "";
    }
  }

  private fileParts(row: ConceptRow): {
    id: string;
    course: string;
    title: string;
    aliases: string[];
    parent: string | null;
    prerequisites: string[];
    related: string[];
    contrasts: string[];
    topics: string[];
    exam_weight: number;
    lecturer_flag: boolean;
    status: ConceptStatus;
    unverified: boolean;
    cites: Cite[];
    definition: string;
  } {
    const raw = readFileSync(join(this.vault.root, row.path), "utf8");
    const parsed = parseNote(raw);
    const fm = parsed.frontmatter;
    return {
      id: row.id,
      course: row.course,
      title: stringValue(fm.title) ?? row.title,
      aliases: stringList(fm.aliases),
      parent: stringValue(fm.parent ?? fm.parent_id),
      prerequisites: stringList(fm.prerequisites),
      related: stringList(fm.related),
      contrasts: stringList(fm.contrasts),
      topics: stringList(fm.topics),
      exam_weight: numberValue(fm.exam_weight, row.exam_weight),
      lecturer_flag: fm.lecturer_flag === true,
      status: normalizeStatus(stringValue(fm.status)),
      unverified: fm.unverified === true,
      cites: citeList(fm.cites),
      definition: parsed.body.replace(/^\s*#\s+.+\n+/, "").trim(),
    };
  }

  private async writeFile(
    id: string,
    parts: {
      id: string;
      course: string;
      title: string;
      aliases: string[];
      parent: string | null;
      prerequisites: string[];
      related: string[];
      contrasts: string[];
      topics: string[];
      exam_weight: number;
      lecturer_flag: boolean;
      status: ConceptStatus;
      unverified: boolean;
      cites: Cite[];
      definition: string;
    },
    mode: "create" | "replace",
  ): Promise<void> {
    const frontmatter: Record<string, unknown> = {
      id,
      course: parts.course,
      title: parts.title,
    };
    if (parts.aliases.length) frontmatter.aliases = parts.aliases;
    if (parts.parent) frontmatter.parent = parts.parent;
    if (parts.prerequisites.length) frontmatter.prerequisites = parts.prerequisites;
    if (parts.related.length) frontmatter.related = parts.related;
    if (parts.contrasts.length) frontmatter.contrasts = parts.contrasts;
    if (parts.topics.length) frontmatter.topics = parts.topics;
    frontmatter.exam_weight = parts.exam_weight;
    if (parts.lecturer_flag) frontmatter.lecturer_flag = true;
    frontmatter.status = parts.status;
    if (parts.unverified) frontmatter.unverified = true;
    frontmatter.cites = parts.cites;
    const body = [`# ${parts.title}`, "", parts.definition.trim(), ""].join("\n");
    const content = `---\n${stringifyYaml(frontmatter, { lineWidth: 0 })}---\n\n${body}`;
    await this.vault.writeNote({ path: `concepts/${id}.md`, content, mode });
  }

  private assertRefs(course: string, ids: string[]): void {
    for (const id of ids) {
      const row = this.db
        .query("SELECT course FROM concepts WHERE id = ?")
        .get(id) as { course: string } | null;
      if (!row) {
        throw new ConceptError(`linked concept not found: ${id}`);
      }
      if (row.course !== course) {
        throw new ConceptError(`linked concept must belong to the same course: ${id}`);
      }
    }
  }

  private assertNoParentCycle(id: string, parentId: string): void {
    let current: string | null = parentId;
    const seen = new Set<string>();
    while (current) {
      if (current === id) throw new ConceptError("parent relation would create a cycle");
      if (seen.has(current)) throw new ConceptError("parent relation contains an existing cycle");
      seen.add(current);
      const row = this.db.query("SELECT parent_id FROM concepts WHERE id = ?").get(current) as {
        parent_id: string | null;
      } | null;
      current = row?.parent_id ?? null;
    }
  }
}

function computeMastery(conceptId: string, rows: EvidenceRow[]): MasteryView {
  const now = Date.now();
  const judged = rows.filter((row) => row.correct !== null);
  const correct = judged.filter((row) => row.correct === 1).length;
  const wrong = judged.length - correct;
  const accuracy = judged.length > 0 ? correct / judged.length : 0;
  const last5 = judged.slice(0, 5);
  const last5Correct = last5.filter((row) => row.correct === 1).length;
  const last5Accuracy = last5.length > 0 ? last5Correct / last5.length : 1;
  const kinds = new Set(judged.filter((row) => row.correct === 1).map((row) => row.kind));
  const overconfident = rows
    .slice(0, 5)
    .some((row) => row.confidence === "sure" && row.correct === 0);
  const timedCorrect = rows.some((row) => row.correct === 1 && row.answer_id !== null);
  let baseState: BaseMasteryState = "unseen";
  if (rows.length > 0) baseState = "familiar";
  if (correct >= 2 && kinds.size >= 2 && accuracy >= 0.6 && !overconfident) baseState = "understood";
  if (baseState === "understood" && timedCorrect && last5Accuracy >= 0.8) baseState = "mastered";
  const score =
    baseState === "mastered"
      ? 0.9 + 0.1 * accuracy
      : baseState === "understood"
        ? 0.55 + 0.25 * accuracy
        : baseState === "familiar"
          ? 0.15 + 0.3 * accuracy
          : 0;
  const lastEvidenceAt = rows[0]?.created_at ?? null;
  const intervalDays =
    baseState === "mastered" ? 21 : baseState === "understood" ? 10 : baseState === "familiar" ? 4 : 0;
  const decayDueAt = lastEvidenceAt && intervalDays > 0 ? lastEvidenceAt + intervalDays * DAY : null;
  const overdue = Boolean(decayDueAt && decayDueAt < now && baseState !== "unseen");
  return {
    conceptId,
    state: overdue ? "decayed" : baseState,
    baseState,
    score: Math.min(1, Math.round(score * 1000) / 1000),
    evidenceCount: rows.length,
    lastEvidenceAt,
    decayDueAt,
    overdue,
  };
}

function rollupOf(concept: ConceptSummary, mastery: MasteryView): Rollup {
  const base = { ...EMPTY_ROLLUP, total: 1, weightedMastery: mastery.score * concept.examWeight };
  if (mastery.state === "mastered") base.mastered = 1;
  else if (mastery.state === "understood") base.understood = 1;
  else if (mastery.state === "familiar") base.familiar = 1;
  else if (mastery.state === "unseen") base.unseen = 1;
  if (mastery.overdue) base.due = 1;
  return base;
}

function countStates(concepts: ConceptSummary[]): Dashboard["counts"] {
  const counts = { total: concepts.length, unseen: 0, familiar: 0, understood: 0, mastered: 0, decayed: 0 };
  for (const concept of concepts) counts[concept.mastery.state]++;
  return counts;
}

function stateOrder(state: MasteryState): number {
  return { unseen: 0, familiar: 1, decayed: 2, understood: 3, mastered: 4 }[state];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

function nameScore(query: string, names: string[]): number {
  let best = 0;
  for (const name of names) {
    const normalized = normalizeName(name);
    if (!normalized) continue;
    if (normalized === query) best = Math.max(best, 100);
    else if (normalized.startsWith(query)) best = Math.max(best, 80);
    else if (normalized.includes(query)) best = Math.max(best, 65);
    else {
      const queryTokens = new Set(query.split(" "));
      const tokens = normalized.split(" ");
      const overlap = tokens.filter((token) => queryTokens.has(token)).length;
      if (overlap > 0) best = Math.max(best, 20 + (overlap / Math.max(queryTokens.size, tokens.length)) * 35);
    }
  }
  return best;
}

function citeList(value: unknown): Cite[] {
  if (!Array.isArray(value)) return [];
  const out: Cite[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const cite = item as Record<string, unknown>;
    const note = stringValue(cite.note);
    if (!note) continue;
    out.push({
      note,
      anchor: stringValue(cite.anchor) ?? undefined,
      quote: stringValue(cite.quote) ?? undefined,
    });
  }
  return out;
}

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
}

function normalizeStatus(value: string | null): ConceptStatus {
  return value === "accepted" || value === "rejected" ? value : "proposed";
}

function daysUntil(examDate?: string | null): number | null {
  if (!examDate) return null;
  const time = new Date(examDate).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - Date.now()) / DAY);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

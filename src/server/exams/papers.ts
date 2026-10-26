import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import { QUESTION_TYPES, rowToQuestion, type Question, type QuestionRow, type QuestionType } from "../questions/validation.ts";

export const MODES = ["strict", "sectioned", "practice"] as const;
export type Mode = (typeof MODES)[number];

export type BlueprintSection = {
  section: string;
  type: QuestionType;
  count: number;
  minutes?: number;
  marks_each?: number;
  topics?: string[];
  negative_marks?: number;
  scoring?: "per_statement" | "all_or_nothing";
  seconds_each?: number;
};

export type PaperRow = {
  id: string;
  course: string;
  title: string;
  blueprint_json: string;
  mode: string;
  duration_sec: number;
  created_at: number;
};

export type PaperItemRow = {
  paper_id: string;
  question_id: string;
  section: string;
  position: number;
};

export type PaperItem = {
  question: Question;
  section: string;
  position: number;
};

export type Paper = {
  id: string;
  course: string;
  title: string;
  blueprint: BlueprintSection[];
  mode: Mode;
  durationSec: number;
  createdAt: number;
  items: PaperItem[];
};

export class PaperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaperError";
  }
}

export class PaperService {
  constructor(
    private readonly db: Db,
    private readonly vault: VaultService,
  ) {}

  async create(input: {
    course: string;
    title?: string;
    blueprint: BlueprintSection[];
    mode?: Mode;
    durationSec?: number;
  }): Promise<Paper> {
    const course = input.course.trim();
    if (!/^[A-Za-z0-9._-]+$/.test(course)) throw new PaperError(`invalid course code: ${course}`);
    if (!existsSync(join(this.vault.root, "courses", course))) {
      throw new PaperError(`course does not exist: ${course}`);
    }

    const blueprint = validateBlueprint(input.blueprint);
    const mode = input.mode ?? "strict";
    if (!MODES.includes(mode)) throw new PaperError(`unknown mode: ${mode}`);

    const minutes = blueprint.reduce((sum, section) => sum + (section.minutes ?? 0), 0);
    const durationSec = input.durationSec ?? minutes * 60;
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new PaperError("paper duration must be positive: set minutes per section or duration_sec");
    }

    const used = new Set<string>();
    const picks: { questionId: string; section: string; position: number }[] = [];
    let position = 0;

    for (const section of blueprint) {
      const rows = this.selectQuestions(course, section, [...used]);
      if (rows.length < section.count) {
        throw new PaperError(
          `not enough verified ${section.type} questions for ${section.section}: need ${section.count}, found ${rows.length}`,
        );
      }
      for (const row of rows) {
        used.add(row.id);
        picks.push({ questionId: row.id, section: section.section, position: position++ });
      }
    }

    const id = `paper-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    const title = input.title?.trim() || `${course} practice paper`;
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO papers (id, course, title, blueprint_json, mode, duration_sec, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(id, course, title, JSON.stringify(blueprint), mode, durationSec, now);
      const insert = this.db.query(
        "INSERT INTO paper_items (paper_id, question_id, section, position) VALUES (?, ?, ?, ?)",
      );
      for (const pick of picks) insert.run(id, pick.questionId, pick.section, pick.position);
    })();

    return this.get(id);
  }

  list(course?: string | null): Paper[] {
    const rows = (
      course
        ? this.db.query("SELECT * FROM papers WHERE course = ? ORDER BY created_at DESC").all(course)
        : this.db.query("SELECT * FROM papers ORDER BY created_at DESC").all()
    ) as PaperRow[];
    return rows.map((row) => this.hydrate(row));
  }

  get(id: string): Paper {
    const row = this.db.query("SELECT * FROM papers WHERE id = ?").get(id) as PaperRow | null;
    if (!row) throw new PaperError(`paper not found: ${id}`);
    return this.hydrate(row);
  }

  private hydrate(row: PaperRow): Paper {
    const items = this.db
      .query("SELECT * FROM paper_items WHERE paper_id = ? ORDER BY position")
      .all(row.id) as PaperItemRow[];
    const questionRows = new Map<string, QuestionRow>();
    for (const item of items) {
      if (questionRows.has(item.question_id)) continue;
      const question = this.db
        .query("SELECT * FROM questions WHERE id = ?")
        .get(item.question_id) as QuestionRow | null;
      if (question) questionRows.set(item.question_id, question);
    }
    return {
      id: row.id,
      course: row.course,
      title: row.title,
      blueprint: JSON.parse(row.blueprint_json) as BlueprintSection[],
      mode: row.mode as Mode,
      durationSec: row.duration_sec,
      createdAt: row.created_at,
      items: items.flatMap((item) => {
        const question = questionRows.get(item.question_id);
        if (!question) return [];
        return [
          {
            question: rowToQuestion(question),
            section: item.section,
            position: item.position,
          },
        ];
      }),
    };
  }

  private selectQuestions(
    course: string,
    section: BlueprintSection,
    used: string[],
  ): { id: string }[] {
    const where = ["course = ?", "type = ?", "verified = 1", "unverified = 0"];
    const params: (string | number)[] = [course, section.type];

    if (used.length > 0) {
      where.push(`id NOT IN (${used.map(() => "?").join(", ")})`);
      params.push(...used);
    }
    if (section.topics && section.topics.length > 0) {
      where.push(`(${section.topics.map(() => "topic_tags LIKE ?").join(" OR ")})`);
      for (const topic of section.topics) params.push(`%${topic}%`);
    }

    params.push(section.count);
    const rows = this.db
      .query(`SELECT id FROM questions WHERE ${where.join(" AND ")} ORDER BY RANDOM() LIMIT ?`)
      .all(...params) as { id: string }[];
    if (rows.length === 0 && section.scoring) {
      throw new PaperError(`no verified questions for section ${section.section}`);
    }
    return rows;
  }
}

export function validateBlueprint(value: unknown): BlueprintSection[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PaperError("blueprint needs at least one section");
  }
  const sections: BlueprintSection[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new PaperError("invalid blueprint section");
    const item = raw as Record<string, unknown>;
    const section = typeof item.section === "string" ? item.section.trim() : "";
    if (!section) throw new PaperError("blueprint section needs a name");
    const type = item.type;
    if (typeof type !== "string" || !QUESTION_TYPES.includes(type as QuestionType)) {
      throw new PaperError(`unknown question type in ${section}: ${String(type)}`);
    }
    const count = Number(item.count);
    if (!Number.isInteger(count) || count <= 0) {
      throw new PaperError(`section ${section} needs a positive count`);
    }
    const minutes = item.minutes === undefined ? undefined : Number(item.minutes);
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes <= 0)) {
      throw new PaperError(`section ${section} has invalid minutes`);
    }
    const marksEach = item.marks_each === undefined ? undefined : Number(item.marks_each);
    if (marksEach !== undefined && (!Number.isFinite(marksEach) || marksEach <= 0)) {
      throw new PaperError(`section ${section} has invalid marks_each`);
    }
    const negative = item.negative_marks === undefined ? undefined : Number(item.negative_marks);
    if (negative !== undefined && (!Number.isFinite(negative) || negative < 0)) {
      throw new PaperError(`section ${section} has invalid negative_marks`);
    }
    if (item.scoring !== undefined && item.scoring !== "per_statement" && item.scoring !== "all_or_nothing") {
      throw new PaperError(`section ${section} has invalid scoring`);
    }
    const secondsEach = item.seconds_each === undefined ? undefined : Number(item.seconds_each);
    if (secondsEach !== undefined && (!Number.isFinite(secondsEach) || secondsEach <= 0)) {
      throw new PaperError(`section ${section} has invalid seconds_each`);
    }
    if (secondsEach !== undefined && type !== "spotter") {
      throw new PaperError(`section ${section} sets seconds_each but is not a spotter section`);
    }
    const topics = Array.isArray(item.topics)
      ? item.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim() !== "")
      : undefined;

    sections.push({
      section,
      type: type as QuestionType,
      count,
      minutes,
      marks_each: marksEach,
      topics,
      negative_marks: negative,
      scoring: item.scoring as BlueprintSection["scoring"],
      seconds_each: secondsEach,
    });
  }
  return sections;
}

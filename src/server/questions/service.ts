import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import { resolveInside } from "../vault/paths.ts";
import { slug } from "../vault/paths.ts";
import { validateCites } from "./citations.ts";
import {
  questionBody,
  questionInputSchema,
  rowToQuestion,
  type Question,
  type QuestionInput,
  type QuestionRow,
} from "./validation.ts";

export type QuestionFilter = {
  course?: string | null;
  type?: string | null;
  topic?: string | null;
  verified?: boolean | null;
  search?: string | null;
  limit?: number;
};

export type ImportPaperInput = {
  course: string;
  source: string;
  title?: string;
  questions: unknown[];
  requestId?: string;
  createdBy?: string;
};

export class QuestionBank {
  constructor(
    private readonly db: Db,
    private readonly vault: VaultService,
  ) {}

  async list(filter: QuestionFilter = {}): Promise<Question[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter.course) {
      where.push("course = ?");
      params.push(filter.course);
    }
    if (filter.type) {
      where.push("type = ?");
      params.push(filter.type);
    }
    if (filter.verified !== undefined && filter.verified !== null) {
      where.push("verified = ?");
      params.push(filter.verified ? 1 : 0);
    }
    if (filter.topic) {
      where.push("topic_tags LIKE ?");
      params.push(`%${JSON.stringify(filter.topic).slice(1, -1)}%`);
    }
    if (filter.search) {
      where.push("(body_json LIKE ? OR id LIKE ?)");
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }

    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);
    const rows = this.db
      .query(
        `SELECT * FROM questions ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
         ORDER BY updated_at DESC, id LIMIT ?`,
      )
      .all(...params, limit) as QuestionRow[];
    return rows.map(rowToQuestion);
  }

  get(id: string): Question {
    const row = this.db.query("SELECT * FROM questions WHERE id = ?").get(id) as QuestionRow | null;
    if (!row) throw new QuestionError(`question not found: ${id}`);
    return rowToQuestion(row);
  }

  async addMany(
    course: string,
    inputs: unknown[],
    options: { createdBy?: string } = {},
  ): Promise<Question[]> {
    this.assertCourse(course);
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new QuestionError("add_questions needs at least one question");
    }

    const prepared: Question[] = [];
    for (const raw of inputs) {
      const parsed = questionInputSchema.parse(raw);
      const question = await this.prepare(course, parsed, {
        createdBy: options.createdBy ?? "agent",
        forceUnverified: false,
      });
      if (this.exists(question.id) || prepared.some((item) => item.id === question.id)) {
        throw new QuestionError(`question already exists: ${question.id}`);
      }
      prepared.push(question);
    }

    this.db.transaction(() => {
      for (const question of prepared) this.insert(question);
    })();
    return prepared;
  }

  async update(id: string, raw: unknown): Promise<Question> {
    const existing = this.get(id);
    const parsed = questionInputSchema.parse(raw);
    const question = await this.prepare(existing.course, parsed, {
      createdBy: existing.createdBy,
      forceUnverified: false,
    });
    question.id = id;
    question.createdAt = existing.createdAt;
    question.updatedAt = Date.now();
    question.verified = existing.verified;
    question.unverified = existing.unverified;

    this.db
      .query(
        `UPDATE questions SET type = ?, question_kind = ?, topic_tags = ?, concept_ids = ?,
           difficulty = ?, marks = ?, body_json = ?, cites_json = ?, source_paper = ?,
           verified = ?, unverified = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        question.type,
        question.questionKind,
        JSON.stringify(question.topics),
        JSON.stringify(question.conceptIds),
        question.difficulty,
        question.marks,
        JSON.stringify(question.body),
        JSON.stringify(question.cites),
        question.sourcePaper,
        question.verified ? 1 : 0,
        question.unverified ? 1 : 0,
        question.updatedAt,
        id,
      );
    return this.get(id);
  }

  verify(id: string, verified = true, by = "agent"): Question {
    this.get(id);
    this.db
      .query(
        "UPDATE questions SET verified = ?, unverified = ?, verified_by = ?, verified_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        verified ? 1 : 0,
        verified ? 0 : 1,
        verified ? by : null,
        verified ? Date.now() : null,
        Date.now(),
        id,
      );
    return this.get(id);
  }

  async importPastPaper(input: ImportPaperInput): Promise<{
    source: string;
    imported: number;
    questions: Question[];
  }> {
    this.assertCourse(input.course);
    const source = this.resolveSource(input.course, input.source);

    if (input.requestId) {
      const row = this.db
        .query("SELECT result FROM idempotency WHERE key = ?")
        .get(`import_past_paper:${input.requestId}`) as { result: string } | null;
      if (row) {
        return JSON.parse(row.result) as {
          source: string;
          imported: number;
          questions: Question[];
        };
      }
    }

    if (!Array.isArray(input.questions) || input.questions.length === 0) {
      throw new QuestionError("import_past_paper needs at least one question");
    }

    const base = slug((input.title ?? source.split("/").pop() ?? "paper").replace(/\.md$/i, ""));
    const prepared: Question[] = [];
    for (const [index, raw] of input.questions.entries()) {
      const payload =
        raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : raw;
      if (payload && typeof payload === "object" && !(payload as { id?: string }).id) {
        (payload as Record<string, unknown>).id = `${input.course}-${base}-${String(index + 1).padStart(2, "0")}`;
      }
      const parsed = questionInputSchema.parse({
        ...(payload as Record<string, unknown>),
        verified: false,
        unverified: true,
        source_paper: source,
      });
      const question = await this.prepare(input.course, parsed, {
        createdBy: input.createdBy ?? "agent",
        forceUnverified: true,
      });
      if (this.exists(question.id) || prepared.some((item) => item.id === question.id)) {
        throw new QuestionError(`question already exists: ${question.id}`);
      }
      prepared.push(question);
    }

    this.db.transaction(() => {
      for (const question of prepared) this.insert(question);
    })();

    const result = { source, imported: prepared.length, questions: prepared };
    if (input.requestId) {
      this.db
        .query("INSERT OR REPLACE INTO idempotency (key, result, created_at) VALUES (?, ?, ?)")
        .run(`import_past_paper:${input.requestId}`, JSON.stringify(result), Date.now());
    }
    return result;
  }

  private async prepare(
    course: string,
    parsed: QuestionInput,
    options: { createdBy: string; forceUnverified: boolean },
  ): Promise<Question> {
    const cites = validateCites(this.vault, parsed.cites, { requireQuote: true });
    if (parsed.type === "spotter") this.validateSpotterImage(cites, parsed.image ?? "");
    const now = Date.now();
    const verified = options.forceUnverified ? false : parsed.verified;
    return {
      id: parsed.id ?? `${course}-${randomUUID().slice(0, 8)}`,
      course,
      type: parsed.type,
      questionKind: parsed.question_kind ?? null,
      topics: parsed.topics,
      conceptIds: parsed.concept_ids,
      difficulty: parsed.difficulty ?? null,
      marks: parsed.marks,
      body: questionBody(parsed),
      cites,
      sourcePaper: parsed.source_paper ? this.resolveSource(course, parsed.source_paper) : null,
      verified,
      unverified: verified ? false : (parsed.unverified ?? true),
      verifiedBy: verified ? options.createdBy : null,
      verifiedAt: verified ? now : null,
      createdBy: options.createdBy,
      createdAt: now,
      updatedAt: now,
    };
  }

  private insert(question: Question): void {
    this.db
      .query(
        `INSERT INTO questions (id, course, type, question_kind, topic_tags, concept_ids,
           difficulty, marks, body_json, cites_json, source_paper, verified, unverified,
           verified_by, verified_at, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        question.id,
        question.course,
        question.type,
        question.questionKind,
        JSON.stringify(question.topics),
        JSON.stringify(question.conceptIds),
        question.difficulty,
        question.marks,
        JSON.stringify(question.body),
        JSON.stringify(question.cites),
        question.sourcePaper,
        question.verified ? 1 : 0,
        question.unverified ? 1 : 0,
        question.verifiedBy,
        question.verifiedAt,
        question.createdBy,
        question.createdAt,
        question.updatedAt,
      );
  }

  private exists(id: string): boolean {
    return this.db.query("SELECT 1 FROM questions WHERE id = ?").get(id) !== null;
  }

  private assertCourse(course: string): void {
    if (!/^[A-Za-z0-9._-]+$/.test(course)) {
      throw new QuestionError(`invalid course code: ${course}`);
    }
    if (!existsSync(join(this.vault.root, "courses", course))) {
      throw new QuestionError(`course does not exist: ${course}`);
    }
  }

  private validateSpotterImage(cites: { note: string }[], image: string): void {
    const clean = image.trim();
    if (/^(https?:|data:)/i.test(clean)) {
      throw new QuestionError("spotter image must be a local vault asset");
    }
    if (clean.startsWith("/")) {
      throw new QuestionError("spotter image must be a vault-relative path");
    }
    const relative = clean.startsWith("courses/")
      ? clean
      : join(dirname(cites[0]?.note ?? ""), clean).split("\\").join("/");
    if (!/\.(png|jpe?g|webp|svg|gif)$/i.test(relative)) {
      throw new QuestionError(`spotter image must be an image file: ${relative}`);
    }
    let absolute: string;
    try {
      absolute = resolveInside(this.vault.root, relative);
    } catch {
      throw new QuestionError(`spotter image escapes the vault: ${clean}`);
    }
    if (!existsSync(absolute)) {
      throw new QuestionError(`spotter image not found: ${relative}`);
    }
  }

  private resolveSource(course: string, source: string): string {
    const clean = source.trim();
    if (!clean) throw new QuestionError("source paper path is empty");
    const candidates = clean.startsWith("courses/")
      ? [clean]
      : [clean, `courses/${clean}`, `courses/${course}/${clean}`];
    for (const candidate of candidates) {
      try {
        resolveInside(this.vault.root, candidate);
      } catch {
        continue;
      }
      if (existsSync(join(this.vault.root, candidate))) return candidate;
    }
    throw new QuestionError(`source paper not found: ${clean}`);
  }
}

export class QuestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionError";
  }
}

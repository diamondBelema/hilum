import { z } from "zod";
import type { Db } from "../db.ts";
import type { Question } from "../questions/validation.ts";
import type { EventBus } from "../events.ts";
import type { PaperService } from "./papers.ts";
import { replaceAnswerEvidence, responseExcerpt } from "./evidence.ts";

export const MISTAKE_TAGS = [
  "knowledge_gap",
  "misread_question",
  "wrong_structure",
  "ran_out_of_time",
  "careless",
] as const;

export type MistakeTag = (typeof MISTAKE_TAGS)[number];

export const rubricScoreSchema = z.object({
  heading: z.string().min(1),
  awarded: z.number().min(0),
  max: z.number().positive(),
  comment: z.string().optional(),
});

export const submitGradeSchema = z.object({
  answer_id: z.number().int().positive(),
  rubric_scores: z.array(rubricScoreSchema).min(1),
  feedback: z.string().default(""),
  mistake_tags: z.array(z.enum(MISTAKE_TAGS)).default([]),
  graded_by: z.string().min(1).default("agent"),
});

export type SubmitGradeInput = z.infer<typeof submitGradeSchema>;
export type RubricScore = z.infer<typeof rubricScoreSchema>;

export type Grade = {
  answerId: number;
  rubricScores: RubricScore[];
  total: number;
  feedback: string;
  mistakeTags: MistakeTag[];
  gradedBy: string;
  gradedAt: number;
};

export type PendingItem = {
  answerId: number;
  attemptId: string;
  paperId: string;
  paperTitle: string;
  course: string;
  questionId: string;
  section: string;
  type: Question["type"];
  questionKind: string | null;
  marks: number;
  topics: string[];
  conceptIds: string[];
  body: Question["body"];
  cites: Question["cites"];
  response: unknown;
  timeSpentSec: number;
  flagged: boolean;
  submittedAt: number;
};

export class GradingError extends Error {}

type PendingRow = {
  answer_id: number;
  attempt_id: string;
  question_id: string;
  response_json: string | null;
  time_spent_sec: number;
  flagged: number;
  paper_id: string;
  paper_title: string;
  course: string;
  submitted_at: number;
  status: string;
};

type GradeRow = {
  answer_id: number;
  rubric_scores_json: string;
  total: number;
  feedback_md: string;
  mistake_tags: string;
  graded_by: string;
  graded_at: number;
};

export class GradingService {
  constructor(
    private readonly db: Db,
    private readonly papers: PaperService,
    private readonly events?: EventBus,
    private readonly baseUrl = "http://127.0.0.1:4747",
  ) {}

  pending(options: { course?: string; limit?: number } = {}): PendingItem[] {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const rows = (
      options.course
        ? this.db
            .query(
              `SELECT a.id AS answer_id, a.attempt_id, a.question_id, a.response_json, a.time_spent_sec, a.flagged,
                      att.paper_id, p.title AS paper_title, p.course, att.submitted_at, a.status
               FROM answers a
               JOIN attempts att ON att.id = a.attempt_id
               JOIN papers p ON p.id = att.paper_id
               WHERE a.status = 'pending_grading' AND att.status = 'submitted' AND p.course = ?
               ORDER BY att.submitted_at ASC, a.id ASC
               LIMIT ?`,
            )
            .all(options.course, limit)
        : this.db
            .query(
              `SELECT a.id AS answer_id, a.attempt_id, a.question_id, a.response_json, a.time_spent_sec, a.flagged,
                      att.paper_id, p.title AS paper_title, p.course, att.submitted_at, a.status
               FROM answers a
               JOIN attempts att ON att.id = a.attempt_id
               JOIN papers p ON p.id = att.paper_id
               WHERE a.status = 'pending_grading' AND att.status = 'submitted'
               ORDER BY att.submitted_at ASC, a.id ASC
               LIMIT ?`,
            )
            .all(limit)
    ) as PendingRow[];
    return rows.flatMap((row) => {
      const item = this.pendingItem(row);
      return item ? [item] : [];
    });
  }

  getPending(answerId: number): PendingItem | null {
    const row = this.db
      .query(
        `SELECT a.id AS answer_id, a.attempt_id, a.question_id, a.response_json, a.time_spent_sec, a.flagged,
                att.paper_id, p.title AS paper_title, p.course, att.submitted_at, a.status
         FROM answers a
         JOIN attempts att ON att.id = a.attempt_id
         JOIN papers p ON p.id = att.paper_id
         WHERE a.id = ?`,
      )
      .get(answerId) as PendingRow | null;
    return row ? this.pendingItem(row) : null;
  }

  grade(input: SubmitGradeInput): Grade {
    const parsed = submitGradeSchema.parse(input);
    const row = this.db
      .query(
        `SELECT a.id AS answer_id, a.attempt_id, a.question_id, a.response_json, a.time_spent_sec, a.flagged,
                att.paper_id, p.title AS paper_title, p.course, att.submitted_at, a.status
         FROM answers a
         JOIN attempts att ON att.id = a.attempt_id
         JOIN papers p ON p.id = att.paper_id
         WHERE a.id = ?`,
      )
      .get(parsed.answer_id) as PendingRow | null;
    if (!row) throw new GradingError(`answer not found: ${parsed.answer_id}`);
    const item = this.pendingItem(row);
    if (!item) throw new GradingError(`answer ${parsed.answer_id} has no question`);
    if (item.type !== "theory") {
      throw new GradingError("only theory answers enter the grading queue");
    }
    if (row.status !== "pending_grading" && row.status !== "graded") {
      throw new GradingError(`answer ${parsed.answer_id} is not awaiting grading`);
    }

    let total = 0;
    for (const score of parsed.rubric_scores) {
      if (score.awarded > score.max) {
        throw new GradingError(
          `rubric score "${score.heading}" awards ${score.awarded} from a maximum of ${score.max}`,
        );
      }
      total += score.awarded;
    }
    total = Number(total.toFixed(2));
    if (total > item.marks + 0.001) {
      throw new GradingError(`total ${total} exceeds the ${item.marks} marks available`);
    }

    const gradedAt = Date.now();
    this.db
      .query(
        `INSERT INTO grades (answer_id, rubric_scores_json, total, feedback_md, mistake_tags, graded_by, graded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(answer_id) DO UPDATE SET
           rubric_scores_json = excluded.rubric_scores_json,
           total = excluded.total,
           feedback_md = excluded.feedback_md,
           mistake_tags = excluded.mistake_tags,
           graded_by = excluded.graded_by,
           graded_at = excluded.graded_at`,
      )
      .run(
        parsed.answer_id,
        JSON.stringify(parsed.rubric_scores),
        total,
        parsed.feedback,
        JSON.stringify(parsed.mistake_tags),
        parsed.graded_by,
        gradedAt,
      );
    this.db
      .query("UPDATE answers SET status = 'graded', auto_score = ? WHERE id = ?")
      .run(total, parsed.answer_id);

    const question = this.papers
      .get(item.paperId)
      .items.find((entry) => entry.question.id === item.questionId)?.question;
    if (question) {
      replaceAnswerEvidence(this.db, {
        answerId: parsed.answer_id,
        question,
        correct: total >= question.marks / 2,
        timeSec: item.timeSpentSec,
        excerpt: responseExcerpt(question, item.response),
      });
    }

    this.events?.publish({
      type: "graded",
      course: item.course,
      attemptId: item.attemptId,
      answerId: parsed.answer_id,
      at: gradedAt,
    });

    return {
      answerId: parsed.answer_id,
      rubricScores: parsed.rubric_scores,
      total,
      feedback: parsed.feedback,
      mistakeTags: parsed.mistake_tags,
      gradedBy: parsed.graded_by,
      gradedAt,
    };
  }

  gradeFor(answerId: number): Grade | null {
    const row = this.db
      .query("SELECT * FROM grades WHERE answer_id = ?")
      .get(answerId) as GradeRow | null;
    return row ? rowToGrade(row) : null;
  }

  gradesFor(attemptId: string): Map<number, Grade> {
    const rows = this.db
      .query(
        `SELECT g.* FROM grades g JOIN answers a ON a.id = g.answer_id
         WHERE a.attempt_id = ?`,
      )
      .all(attemptId) as GradeRow[];
    return new Map(rows.map((row) => [row.answer_id, rowToGrade(row)]));
  }

  prompt(answerId: number): string {
    const item = this.getPending(answerId);
    if (!item) throw new GradingError(`answer not found: ${answerId}`);
    return gradingPrompt(item, this.baseUrl);
  }

  private pendingItem(row: PendingRow): PendingItem | null {
    const paper = this.papers.get(row.paper_id);
    const entry = paper.items.find((item) => item.question.id === row.question_id);
    if (!entry) return null;
    const question = entry.question;
    return {
      answerId: row.answer_id,
      attemptId: row.attempt_id,
      paperId: row.paper_id,
      paperTitle: row.paper_title,
      course: row.course,
      questionId: question.id,
      section: entry.section,
      type: question.type,
      questionKind: question.questionKind,
      marks: question.marks,
      topics: question.topics,
      conceptIds: question.conceptIds,
      body: question.body,
      cites: question.cites,
      response: row.response_json ? (JSON.parse(row.response_json) as unknown) : null,
      timeSpentSec: row.time_spent_sec,
      flagged: Boolean(row.flagged),
      submittedAt: row.submitted_at,
    };
  }
}

export function gradingPrompt(item: PendingItem, baseUrl = ""): string {
  const body = item.body as {
    prompt?: string;
    model_answer?: string;
    rubric?: string;
  };
  const photo =
    item.response && typeof item.response === "object"
      ? (item.response as { photo?: unknown }).photo
      : undefined;
  const photoLine =
    typeof photo === "string"
      ? `The student uploaded a photo of a handwritten answer. View it at: ${baseUrl}/api/attempts/${item.attemptId}/photo/${item.questionId}?file=${encodeURIComponent(photo)}`
      : "";
  const cites = item.cites
    .map((cite) => `- ${cite.note}${cite.anchor ? `#${cite.anchor}` : ""}${cite.quote ? `: "${cite.quote}"` : ""}`)
    .join("\n");
  return `Grade one theory answer for a medical student. Be a strict but fair examiner.

Paper: ${item.paperTitle} (${item.course}), section ${item.section}
Question id: ${item.questionId}
Type: ${item.type}${item.questionKind ? ` (${item.questionKind})` : ""}
Marks available: ${item.marks}
Topics: ${item.topics.join(", ") || "none"}

Question:
${body.prompt ?? ""}

Model answer:
${body.model_answer || "(none supplied - grade against the citation and standard anatomy)"}

Rubric:
${body.rubric || "(none supplied - use one Overall heading with max equal to the marks available)"}

Citations:
${cites || "(none)"}

Student answer:
${JSON.stringify(item.response, null, 2)}
${photoLine ? `\n${photoLine}` : ""}

Return ONLY this JSON shape, with no markdown fence and no extra text:
{"answer_id": ${item.answerId}, "rubric_scores": [{"heading": "Overall", "awarded": 0, "max": ${item.marks}, "comment": "why"}], "feedback": "specific, exam-style feedback", "mistake_tags": []}

Rules:
- rubric_scores must have at least one row and the awarded values must sum to no more than ${item.marks}.
- Use the headings in the rubric when it gives them; otherwise create concise headings that add up to ${item.marks}.
- mistake_tags may only use: knowledge_gap, misread_question, wrong_structure, ran_out_of_time, careless. Use [] when the answer has no clear mistake.
- Grade content and structure separately when the rubric allows it. Say when a rubric or model answer is still draft.`;
}

function rowToGrade(row: GradeRow): Grade {
  return {
    answerId: row.answer_id,
    rubricScores: JSON.parse(row.rubric_scores_json) as RubricScore[],
    total: row.total,
    feedback: row.feedback_md,
    mistakeTags: JSON.parse(row.mistake_tags) as MistakeTag[],
    gradedBy: row.graded_by,
    gradedAt: row.graded_at,
  };
}

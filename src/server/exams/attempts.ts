import { randomUUID } from "node:crypto";
import type { Db } from "../db.ts";
import type { Question } from "../questions/validation.ts";
import type { Paper, PaperService } from "./papers.ts";

export type AttemptRow = {
  id: string;
  paper_id: string;
  started_at: number;
  submitted_at: number | null;
  status: string;
  duration_used_sec: number | null;
};

export type AnswerRow = {
  id: number;
  attempt_id: string;
  question_id: string;
  response_json: string | null;
  time_spent_sec: number;
  flagged: number;
  auto_score: number | null;
  status: string;
};

export type Attempt = {
  id: string;
  paperId: string;
  startedAt: number;
  submittedAt: number | null;
  status: "in_progress" | "submitted";
  durationUsedSec: number | null;
};

export type AnswerState = {
  questionId: string;
  response: unknown;
  timeSpentSec: number;
  flagged: boolean;
  autoScore: number | null;
  status: string;
};

export type AttemptSession = {
  attempt: Attempt;
  paper: Paper;
  answers: AnswerState[];
  remainingSec: number;
  expired: boolean;
};

export type ResultItem = {
  questionId: string;
  section: string;
  position: number;
  type: Question["type"];
  topics: string[];
  marks: number;
  response: unknown;
  autoScore: number | null;
  status: string;
  correct: boolean | null;
  flagged: boolean;
  timeSpentSec: number;
};

export type SectionResult = {
  section: string;
  awarded: number;
  max: number;
  pending: number;
};

export type AttemptResults = {
  attempt: Attempt;
  paper: { id: string; course: string; title: string; mode: string };
  items: ResultItem[];
  score: { awarded: number; max: number; pending: number };
  bySection: SectionResult[];
  flaggedAccuracy: { flagged: number; correct: number } | null;
  mistakes: { questionId: string; section: string; topics: string[]; tags: string[] }[];
  durationUsedSec: number;
};

export class ExamRunner {
  constructor(
    private readonly db: Db,
    private readonly papers: PaperService,
  ) {}

  start(paperId: string): AttemptSession {
    const paper = this.papers.get(paperId);
    const id = `att-${randomUUID().slice(0, 8)}`;
    const now = Date.now();
    this.db
      .query(
        `INSERT INTO attempts (id, paper_id, started_at, submitted_at, status, duration_used_sec)
         VALUES (?, ?, ?, NULL, 'in_progress', NULL)`,
      )
      .run(id, paper.id, now);
    return this.session(this.attemptRow(id), paper);
  }

  get(id: string): AttemptSession {
    const attempt = this.attemptRow(id);
    const paper = this.papers.get(attempt.paper_id);
    return this.session(attempt, paper);
  }

  save(
    attemptId: string,
    input: {
      questionId: string;
      response: unknown;
      timeSpentSec?: number;
      flagged?: boolean;
    },
  ): AnswerState {
    const attempt = this.attemptRow(attemptId);
    if (attempt.status !== "in_progress") {
      throw new ExamError(`attempt already submitted: ${attemptId}`);
    }
    const paper = this.papers.get(attempt.paper_id);
    if (!paper.items.some((item) => item.question.id === input.questionId)) {
      throw new ExamError(`question ${input.questionId} is not in this paper`);
    }

    const response = input.response === undefined ? null : JSON.stringify(input.response);
    const timeSpent = Math.max(0, Math.round(input.timeSpentSec ?? 0));
    this.db
      .query(
        `INSERT INTO answers (attempt_id, question_id, response_json, time_spent_sec, flagged, auto_score, status)
         VALUES (?, ?, ?, ?, ?, NULL, 'unanswered')
         ON CONFLICT(attempt_id, question_id) DO UPDATE SET
           response_json = excluded.response_json,
           time_spent_sec = excluded.time_spent_sec,
           flagged = excluded.flagged`,
      )
      .run(attemptId, input.questionId, response, timeSpent, input.flagged ? 1 : 0);

    const row = this.db
      .query("SELECT * FROM answers WHERE attempt_id = ? AND question_id = ?")
      .get(attemptId, input.questionId) as AnswerRow;
    return this.answerState(row);
  }

  submit(attemptId: string, _options: { auto?: boolean } = {}): AttemptResults {
    const attempt = this.attemptRow(attemptId);
    if (attempt.status === "submitted") return this.results(attemptId);

    const paper = this.papers.get(attempt.paper_id);
    const answers = this.answerRows(attemptId);
    const byQuestion = new Map(answers.map((answer) => [answer.question_id, answer]));

    const now = Date.now();
    const durationUsed = Math.min(
      Math.round((now - attempt.started_at) / 1000),
      paper.durationSec,
    );

    const sections = new Map(paper.blueprint.map((section) => [section.section, section]));

    for (const item of paper.items) {
      const question = item.question;
      const answer = byQuestion.get(question.id);
      let response = parseResponse(answer?.response_json ?? null);
      let score: number | null = null;
      let status = "unanswered";

      if (question.type === "tf_multi") {
        const body = question.body as {
          statements: { text: string; answer: boolean }[];
          scoring?: "per_statement" | "all_or_nothing";
        };
        const statements = body.statements;
        const given = tfResponse(response);
        const correctCount = statements.reduce(
          (sum, statement, index) => sum + (given[index] === statement.answer ? 1 : 0),
          0,
        );
        const all = correctCount === statements.length;
        const rule = body.scoring ?? sections.get(item.section)?.scoring ?? "per_statement";
        score = all ? question.marks : rule === "all_or_nothing" ? 0 : (question.marks * correctCount) / statements.length;
        status = "auto_graded";
      } else if (question.type === "mcq_single") {
        const body = question.body as { answer: string };
        const given = mcqResponse(response);
        const isRight = given !== null && given.toUpperCase() === body.answer.toUpperCase();
        const negative = sections.get(item.section)?.negative_marks ?? 0;
        score = isRight ? question.marks : -Math.min(negative, question.marks);
        status = "auto_graded";
      } else if (question.type === "spotter") {
        const body = question.body as { answer: string; accepted?: string[] };
        const given = textResponse(response);
        const isRight = given !== null && spotterMatches(body, given);
        score = isRight ? question.marks : 0;
        status = "auto_graded";
      } else {
        score = null;
        status = "pending_grading";
      }

      this.db
        .query(
          `INSERT INTO answers (attempt_id, question_id, response_json, time_spent_sec, flagged, auto_score, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(attempt_id, question_id) DO UPDATE SET
             auto_score = excluded.auto_score,
             status = excluded.status,
             response_json = COALESCE(answers.response_json, excluded.response_json)`,
        )
        .run(
          attemptId,
          question.id,
          answer?.response_json ?? null,
          answer?.time_spent_sec ?? 0,
          answer?.flagged ?? 0,
          score,
          status,
        );
    }

    this.db
      .query(
        "UPDATE attempts SET status = 'submitted', submitted_at = ?, duration_used_sec = ? WHERE id = ?",
      )
      .run(now, durationUsed, attemptId);

    return this.results(attemptId);
  }

  results(attemptId: string): AttemptResults {
    const attempt = this.attemptRow(attemptId);
    const paper = this.papers.get(attempt.paper_id);
    const answers = new Map(
      this.answerRows(attemptId).map((answer) => [answer.question_id, answer]),
    );
    const sections = new Map<string, SectionResult>();
    const items: ResultItem[] = [];
    const mistakes: AttemptResults["mistakes"] = [];
    let flagged = 0;
    let flaggedCorrect = 0;

    for (const item of paper.items) {
      const question = item.question;
      const answer = answers.get(question.id);
      const response = parseResponse(answer?.response_json ?? null);
      const score = answer?.auto_score ?? null;
      const status = answer?.status ?? "unanswered";
      const correct = status === "auto_graded" ? isCorrect(question, response) : null;

      const section = sections.get(item.section) ?? {
        section: item.section,
        awarded: 0,
        max: 0,
        pending: 0,
      };
      section.max += question.marks;
      if (status === "pending_grading") section.pending += 1;
      else section.awarded += score ?? 0;
      sections.set(item.section, section);

      if (correct === false) {
        mistakes.push({
          questionId: question.id,
          section: item.section,
          topics: question.topics,
          tags: [status === "unanswered" ? "ran_out_of_time" : "knowledge_gap"],
        });
      }
      if (answer?.flagged && status === "auto_graded") {
        flagged += 1;
        if (correct) flaggedCorrect += 1;
      }

      items.push({
        questionId: question.id,
        section: item.section,
        position: item.position,
        type: question.type,
        topics: question.topics,
        marks: question.marks,
        response,
        autoScore: score,
        status,
        correct,
        flagged: Boolean(answer?.flagged),
        timeSpentSec: answer?.time_spent_sec ?? 0,
      });
    }

    const score = {
      awarded: Number(
        [...sections.values()].reduce((sum, section) => sum + section.awarded, 0).toFixed(2),
      ),
      max: Number([...sections.values()].reduce((sum, section) => sum + section.max, 0).toFixed(2)),
      pending: [...sections.values()].reduce((sum, section) => sum + section.pending, 0),
    };

    return {
      attempt: {
        id: attempt.id,
        paperId: attempt.paper_id,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        status: attempt.status as Attempt["status"],
        durationUsedSec: attempt.duration_used_sec,
      },
      paper: {
        id: paper.id,
        course: paper.course,
        title: paper.title,
        mode: paper.mode,
      },
      items,
      score,
      bySection: [...sections.values()],
      flaggedAccuracy: flagged > 0 ? { flagged, correct: flaggedCorrect } : null,
      mistakes,
      durationUsedSec: attempt.duration_used_sec ?? 0,
    };
  }

  private session(attempt: AttemptRow, paper: Paper): AttemptSession {
    const elapsed = Math.round((Date.now() - attempt.started_at) / 1000);
    const remainingSec =
      attempt.status === "in_progress" ? Math.max(0, paper.durationSec - elapsed) : 0;
    return {
      attempt: {
        id: attempt.id,
        paperId: attempt.paper_id,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        status: attempt.status as Attempt["status"],
        durationUsedSec: attempt.duration_used_sec,
      },
      paper,
      answers: this.answerRows(attempt.id).map((row) => this.answerState(row)),
      remainingSec,
      expired: attempt.status === "in_progress" && remainingSec === 0,
    };
  }

  private attemptRow(id: string): AttemptRow {
    const row = this.db.query("SELECT * FROM attempts WHERE id = ?").get(id) as AttemptRow | null;
    if (!row) throw new ExamError(`attempt not found: ${id}`);
    return row;
  }

  private answerRows(attemptId: string): AnswerRow[] {
    return this.db
      .query("SELECT * FROM answers WHERE attempt_id = ? ORDER BY id")
      .all(attemptId) as AnswerRow[];
  }

  private answerState(row: AnswerRow): AnswerState {
    return {
      questionId: row.question_id,
      response: parseResponse(row.response_json),
      timeSpentSec: row.time_spent_sec,
      flagged: row.flagged === 1,
      autoScore: row.auto_score,
      status: row.status,
    };
  }
}

export class ExamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExamError";
  }
}

function parseResponse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function tfResponse(response: unknown): (boolean | null)[] {
  if (!response || typeof response !== "object") return [];
  const value = (response as { statements?: unknown }).statements;
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "boolean" ? item : null))
    : [];
}

function mcqResponse(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as { answer?: unknown }).answer;
  return typeof value === "string" ? value : null;
}

function textResponse(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as { text?: unknown }).text;
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function spotterMatches(body: { answer: string; accepted?: string[] }, given: string): boolean {
  const normalized = normalizeAnswer(given);
  if (!normalized) return false;
  return [body.answer, ...(body.accepted ?? [])].some(
    (answer) => normalizeAnswer(answer) === normalized,
  );
}

function isCorrect(question: Question, response: unknown): boolean {
  if (question.type === "tf_multi") {
    const body = question.body as { statements: { text: string; answer: boolean }[] };
    const given = tfResponse(response);
    return (
      given.length === body.statements.length &&
      body.statements.every((statement, index) => given[index] === statement.answer)
    );
  }
  if (question.type === "mcq_single") {
    const body = question.body as { answer: string };
    const given = mcqResponse(response);
    return given !== null && given.toUpperCase() === body.answer.toUpperCase();
  }
  if (question.type === "spotter") {
    const body = question.body as { answer: string; accepted?: string[] };
    const given = textResponse(response);
    return given !== null && spotterMatches(body, given);
  }
  return false;
}

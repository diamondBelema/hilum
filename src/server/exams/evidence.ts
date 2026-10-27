import type { Db } from "../db.ts";
import type { Question } from "../questions/validation.ts";

export function responseExcerpt(question: Question, response: unknown): string | null {
  if (response === null || response === undefined) return null;
  if (!response || typeof response !== "object") return null;
  const value = response as Record<string, unknown>;
  if (typeof value.text === "string" && value.text.trim()) return clip(value.text);
  if (typeof value.answer === "string" && value.answer.trim()) return clip(value.answer);
  if (Array.isArray(value.statements)) {
    const answered = value.statements.filter((item) => typeof item === "boolean").length;
    return answered > 0 ? `${answered} statements answered` : null;
  }
  if (typeof value.photo === "string") return "Photo of a handwritten answer";
  return null;
}

export function replaceAnswerEvidence(
  db: Db,
  input: {
    answerId: number;
    question: Question;
    correct: boolean | null;
    timeSec: number;
    excerpt: string | null;
  },
): void {
  db.query("DELETE FROM evidence WHERE answer_id = ?").run(input.answerId);
  if (input.excerpt === null && input.question.type !== "theory") return;
  const concepts = input.question.conceptIds.length > 0 ? input.question.conceptIds : [null];
  const now = Date.now();
  const insert = db.query(
    `INSERT INTO evidence (answer_id, concept_id, kind, correct, time_sec, excerpt, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const concept of concepts) {
    insert.run(
      input.answerId,
      concept,
      input.question.type,
      input.correct === null ? null : input.correct ? 1 : 0,
      input.timeSec,
      input.excerpt,
      now,
    );
  }
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 400 ? `${clean.slice(0, 397)}...` : clean;
}

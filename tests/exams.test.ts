import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "../src/server/db.ts";
import { VaultService } from "../src/server/vault/service.ts";
import { QuestionBank } from "../src/server/questions/service.ts";
import { PaperService } from "../src/server/exams/papers.ts";
import { ExamRunner } from "../src/server/exams/attempts.ts";

let root: string;
let db: Db;
let bank: QuestionBank;
let papers: PaperService;
let runner: ExamRunner;

const cite = {
  note: "ana-211/notes/thorax.md",
  anchor: "thorax",
  quote: "The thoracic wall protects the heart and lungs",
};

async function seedQuestion(overrides: Record<string, unknown>) {
  const [question] = await bank.addMany("ana-211", [
    {
      type: "tf_multi",
      topics: ["thorax"],
      marks: 5,
      stem: "Concerning the thoracic wall:",
      statements: [
        { text: "It protects the heart and lungs.", answer: true },
        { text: "It is made only of bone.", answer: false },
        { text: "It moves during ventilation.", answer: true },
        { text: "It contains the diaphragm.", answer: false },
      ],
      cites: [cite],
      ...overrides,
    },
  ]);
  if (!question) throw new Error("question not created");
  bank.verify(question.id, true);
  return question;
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-exams-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await mkdir(join(root, "courses/ana-211/assets"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/notes/thorax.md"),
    "## Thorax {#thorax}\n\nThe thoracic wall protects the heart and lungs and moves during ventilation.\n",
    "utf8",
  );
  await writeFile(
    join(root, "courses/ana-211/assets/thorax.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>\n',
    "utf8",
  );
  db = openDb(":memory:");
  const vault = new VaultService(db, root);
  bank = new QuestionBank(db, vault);
  papers = new PaperService(db, vault);
  runner = new ExamRunner(db, papers);
});

afterEach(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});

describe("paper builder", () => {
  test("draws only verified questions and fails on a shortfall", async () => {
    await seedQuestion({ id: "ana-211-tf-01" });
    const paper = await papers.create({
      course: "ana-211",
      title: "Mid paper",
      blueprint: [{ section: "A", type: "tf_multi", count: 1, minutes: 10 }],
    });
    expect(paper.items).toHaveLength(1);
    expect(paper.items[0]?.question.id).toBe("ana-211-tf-01");
    expect(paper.durationSec).toBe(600);

    await expect(
      papers.create({
        course: "ana-211",
        blueprint: [{ section: "A", type: "tf_multi", count: 2, minutes: 10 }],
      }),
    ).rejects.toThrow("not enough verified");
  });

  test("rejects an invalid blueprint", async () => {
    await expect(
      papers.create({
        course: "ana-211",
        blueprint: [{ section: "A", type: "mcq_single", count: 0 }],
      }),
    ).rejects.toThrow("positive count");
    await expect(
      papers.create({
        course: "ana-211",
        blueprint: [{ section: "A", type: "tf_multi", count: 1 }],
      }),
    ).rejects.toThrow("duration must be positive");
  });
});

describe("exam runner", () => {
  test("autosaves, submits, scores objective types and queues theory", async () => {
    await seedQuestion({ id: "ana-211-tf-01" });
    await seedQuestion({
      id: "ana-211-mcq-01",
      type: "mcq_single",
      topics: ["thorax"],
      marks: 2,
      stem: "Which structure protects the heart?",
      options: { A: "Liver", B: "Thoracic wall" },
      answer: "B",
      statements: undefined,
    });
    await seedQuestion({
      id: "ana-211-th-01",
      type: "theory",
      question_kind: "region",
      topics: ["thorax"],
      marks: 10,
      prompt: "Describe the thoracic wall.",
      statements: undefined,
      model_answer: "It protects the heart and lungs.",
    });

    const paper = await papers.create({
      course: "ana-211",
      mode: "strict",
      blueprint: [
        { section: "A", type: "tf_multi", count: 1, minutes: 10 },
        { section: "B", type: "mcq_single", count: 1, minutes: 5, negative_marks: 0.5 },
        { section: "C", type: "theory", count: 1, minutes: 30 },
      ],
    });
    const session = runner.start(paper.id);
    expect(session.remainingSec).toBeGreaterThan(0);

    const tf = paper.items.find((item) => item.question.type === "tf_multi")!;
    const mcq = paper.items.find((item) => item.question.type === "mcq_single")!;
    const theory = paper.items.find((item) => item.question.type === "theory")!;

    runner.save(session.attempt.id, {
      questionId: tf.question.id,
      response: { statements: [true, true, false, false] },
      timeSpentSec: 40,
      flagged: true,
    });
    runner.save(session.attempt.id, {
      questionId: mcq.question.id,
      response: { answer: "A" },
      timeSpentSec: 20,
    });
    runner.save(session.attempt.id, {
      questionId: theory.question.id,
      response: { text: "It is a cage." },
      timeSpentSec: 100,
    });

    const resumed = runner.get(session.attempt.id);
    expect(resumed.answers).toHaveLength(3);
    expect(resumed.answers.find((answer) => answer.questionId === tf.question.id)?.flagged).toBe(
      true,
    );

    const results = runner.submit(session.attempt.id);
    expect(results.attempt.status).toBe("submitted");
    expect(results.items.find((item) => item.questionId === tf.question.id)?.autoScore).toBe(2.5);
    expect(results.items.find((item) => item.questionId === mcq.question.id)?.autoScore).toBe(-0.5);
    expect(results.items.find((item) => item.questionId === theory.question.id)?.status).toBe(
      "pending_grading",
    );
    expect(results.score).toEqual({ awarded: 2, max: 17, pending: 1 });
    expect(results.bySection.find((section) => section.section === "C")).toEqual({
      section: "C",
      awarded: 0,
      max: 10,
      pending: 1,
    });
    expect(results.flaggedAccuracy).toEqual({ flagged: 1, correct: 0 });
    expect(results.mistakes).toHaveLength(2);
    expect(results.durationUsedSec).toBeGreaterThanOrEqual(0);

    expect(runner.submit(session.attempt.id)).toEqual(results);
    expect(() =>
      runner.save(session.attempt.id, { questionId: tf.question.id, response: null }),
    ).toThrow("already submitted");

    const history = runner.attempts("ana-211");
    expect(history[0]?.id).toBe(session.attempt.id);
    expect(history[0]?.paperTitle).toBe(paper.title);
    expect(history[0]?.status).toBe("submitted");
  });

  test("applies all_or_nothing scoring", async () => {
    await seedQuestion({
      id: "ana-211-tf-all",
      topics: ["renal"],
      scoring: "all_or_nothing",
    });
    const paper = await papers.create({
      course: "ana-211",
      blueprint: [{ section: "A", type: "tf_multi", count: 1, minutes: 10, topics: ["renal"] }],
    });
    const session = runner.start(paper.id);
    runner.save(session.attempt.id, {
      questionId: paper.items[0]!.question.id,
      response: { statements: [true, true, false, false] },
    });
    const results = runner.submit(session.attempt.id);
    expect(results.items[0]?.autoScore).toBe(0);
  });

  test("auto-grades spotter answers after normalising text", async () => {
    await seedQuestion({
      id: "ana-211-spot-01",
      type: "spotter",
      question_kind: "histology",
      topics: ["thorax"],
      marks: 2,
      prompt: "Identify the structure indicated by the arrow.",
      image: "../assets/thorax.svg",
      answer: "Thoracic wall",
      accepted: ["chest wall"],
      stem: undefined,
      statements: undefined,
    });
    const paper = await papers.create({
      course: "ana-211",
      blueprint: [{ section: "D", type: "spotter", count: 1, minutes: 2, seconds_each: 75 }],
    });
    expect(paper.blueprint[0]?.seconds_each).toBe(75);
    const session = runner.start(paper.id);
    runner.save(session.attempt.id, {
      questionId: paper.items[0]!.question.id,
      response: { text: "  chest   wall. " },
    });
    const results = runner.submit(session.attempt.id);
    expect(results.items[0]?.status).toBe("auto_graded");
    expect(results.items[0]?.correct).toBe(true);
    expect(results.items[0]?.autoScore).toBe(2);
    expect(results.score).toEqual({ awarded: 2, max: 2, pending: 0 });
  });

  test("rejects a spotter image that does not exist", async () => {
    await expect(
      bank.addMany("ana-211", [
        {
          type: "spotter",
          marks: 1,
          prompt: "Identify this.",
          image: "../assets/missing.png",
          answer: "x",
          cites: [cite],
        },
      ]),
    ).rejects.toThrow("spotter image not found");
  });

  test("rejects a station timer on a non-spotter section", async () => {
    await seedQuestion({ id: "ana-211-tf-timer" });
    await expect(
      papers.create({
        course: "ana-211",
        blueprint: [
          { section: "A", type: "tf_multi", count: 1, minutes: 10, seconds_each: 75 },
        ],
      }),
    ).rejects.toThrow("not a spotter section");
  });
});

describe("grading queue", () => {
  test("grades theory, updates the score and writes evidence", async () => {
    const { GradingService } = await import("../src/server/exams/grading.ts");
    const { EventBus } = await import("../src/server/events.ts");
    const theory = await seedQuestion({
      id: "ana-211-th-grade",
      type: "theory",
      question_kind: "mechanism",
      topics: ["thorax"],
      concept_ids: ["thoracic-wall"],
      marks: 10,
      prompt: "Describe the thoracic wall.",
      statements: undefined,
      model_answer: "It protects the heart and lungs.",
      rubric: "Structure 4, function 6",
    });
    const tf = await seedQuestion({
      id: "ana-211-tf-grade",
      concept_ids: ["thoracic-wall"],
      marks: 5,
    });
    const paper = await papers.create({
      course: "ana-211",
      title: "Grading paper",
      blueprint: [
        { section: "A", type: "tf_multi", count: 1, minutes: 5 },
        { section: "C", type: "theory", count: 1, minutes: 20 },
      ],
    });
    const session = runner.start(paper.id);
    runner.save(session.attempt.id, {
      questionId: tf.id,
      response: { statements: [true, false, true, false] },
    });
    runner.save(session.attempt.id, {
      questionId: theory.id,
      response: { text: "A cage of ribs that protects the heart and lungs." },
      timeSpentSec: 90,
    });
    const submitted = runner.submit(session.attempt.id);
    expect(submitted.score).toEqual({ awarded: 5, max: 15, pending: 1 });
    expect(submitted.items.find((item) => item.questionId === theory.id)?.grade).toBeNull();

    const events = new EventBus();
    const seen: string[] = [];
    events.subscribe((event) => seen.push(event.type));
    const grading = new GradingService(db, papers, events);
    const pending = grading.pending({ course: "ana-211" });
    expect(pending).toHaveLength(1);
    const queued = pending[0]!;
    expect(queued.questionId).toBe(theory.id);
    expect(queued.body).toMatchObject({ model_answer: "It protects the heart and lungs." });
    expect(grading.prompt(queued.answerId)).toContain("rubric_scores");

    expect(() =>
      grading.grade({
        answer_id: queued.answerId,
        rubric_scores: [{ heading: "Overall", awarded: 11, max: 10 }],
        feedback: "Too generous",
        mistake_tags: [],
        graded_by: "agent",
      }),
    ).toThrow("awards 11");
    expect(() =>
      grading.grade({
        answer_id: queued.answerId,
        rubric_scores: [],
        feedback: "",
        mistake_tags: [],
        graded_by: "agent",
      }),
    ).toThrow();

    const grade = grading.grade({
      answer_id: queued.answerId,
      rubric_scores: [
        { heading: "Structure", awarded: 3, max: 4, comment: "Missed the diaphragm." },
        { heading: "Function", awarded: 4, max: 6 },
      ],
      feedback: "Good protection, thin on mechanics.",
      mistake_tags: ["wrong_structure"],
      graded_by: "agent",
    });
    expect(grade.total).toBe(7);
    expect(seen).toEqual(["graded"]);
    expect(grading.pending({ course: "ana-211" })).toHaveLength(0);

    const results = runner.results(session.attempt.id);
    expect(results.score).toEqual({ awarded: 12, max: 15, pending: 0 });
    expect(results.bySection.find((section) => section.section === "C")).toEqual({
      section: "C",
      awarded: 7,
      max: 10,
      pending: 0,
    });
    const item = results.items.find((entry) => entry.questionId === theory.id)!;
    expect(item.status).toBe("graded");
    expect(item.correct).toBeNull();
    expect(item.grade?.total).toBe(7);
    expect(item.grade?.feedback).toContain("Good protection");
    expect(results.mistakes.find((entry) => entry.questionId === theory.id)?.tags).toEqual([
      "wrong_structure",
    ]);
    expect(results.mistakes.find((entry) => entry.questionId === theory.id)?.tags).not.toContain(
      "knowledge_gap",
    );

    const evidence = db
      .query("SELECT * FROM evidence WHERE answer_id = ?")
      .all(queued.answerId) as { concept_id: string; correct: number; kind: string }[];
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({ concept_id: "thoracic-wall", correct: 1, kind: "theory" });

    const regrade = grading.grade({
      answer_id: queued.answerId,
      rubric_scores: [{ heading: "Overall", awarded: 8, max: 10 }],
      feedback: "Re-read the mechanics.",
      mistake_tags: [],
      graded_by: "human",
    });
    expect(regrade.total).toBe(8);
    expect(runner.results(session.attempt.id).score).toEqual({ awarded: 13, max: 15, pending: 0 });
    expect(
      db.query("SELECT * FROM evidence WHERE answer_id = ?").all(queued.answerId),
    ).toHaveLength(1);
  });
});

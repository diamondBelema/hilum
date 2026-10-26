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

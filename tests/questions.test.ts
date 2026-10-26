import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "../src/server/db.ts";
import { VaultService } from "../src/server/vault/service.ts";
import { QuestionBank } from "../src/server/questions/service.ts";
import { validateCite } from "../src/server/questions/citations.ts";

let root: string;
let db: Db;
let vault: VaultService;
let bank: QuestionBank;

const cite = {
  note: "ana-211/past-questions/2024-mid.md",
  anchor: "q1",
  quote: "protects the heart and lungs",
};

function tf(id: string) {
  return {
    id,
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
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-questions-"));
  await mkdir(join(root, "courses/ana-211/past-questions"), { recursive: true });
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/past-questions/2024-mid.md"),
    `---\ncourse: ana-211\ntitle: 2024 midsemester\n---\n\n# 2024 midsemester\n\n## Question 1 {#q1}\n\nThe thoracic wall protects the heart and lungs and moves during ventilation.\n\n## Question 2 {#q2}\n\nWhich nerve supplies the diaphragm?\n`,
    "utf8",
  );
  await writeFile(
    join(root, "courses/ana-211/notes/thorax.md"),
    `---\ncourse: ana-211\ntitle: Thorax\n---\n\n## Bones and joints\n\nTwelve thoracic vertebrae lie posteriorly.\n`,
    "utf8",
  );
  db = openDb(":memory:");
  vault = new VaultService(db, root);
  bank = new QuestionBank(db, vault);
});

afterEach(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});

describe("citations", () => {
  test("accepts course-relative paths and anchored quotes", () => {
    expect(validateCite(vault, cite)).toBe("courses/ana-211/past-questions/2024-mid.md");
  });

  test("accepts slug anchors inside a heading's section only", () => {
    expect(
      validateCite(vault, {
        note: "courses/ana-211/notes/thorax.md",
        anchor: "bones-and-joints",
        quote: "Twelve thoracic vertebrae",
      }),
    ).toBe("courses/ana-211/notes/thorax.md");
    expect(() =>
      validateCite(vault, {
        note: "courses/ana-211/notes/thorax.md",
        anchor: "bones-and-joints",
        quote: "Which nerve supplies",
      }),
    ).toThrow("quote not found");
  });

  test("rejects missing sources and anchors", () => {
    expect(() => validateCite(vault, { ...cite, note: "ana-211/nope.md" })).toThrow(
      "source not found",
    );
    expect(() => validateCite(vault, { ...cite, anchor: "q9" })).toThrow("anchor not found");
  });
});

describe("question bank", () => {
  test("adds cited questions and lists them", async () => {
    const [question] = await bank.addMany("ana-211", [tf("ana-211-thorax-01")]);
    expect(question?.verified).toBe(false);
    expect(question?.unverified).toBe(true);

    const list = await bank.list({ course: "ana-211" });
    expect(list.map((item) => item.id)).toContain("ana-211-thorax-01");
    expect(await bank.list({ verified: true })).toHaveLength(0);
  });

  test("rejects uncited questions and writes nothing", async () => {
    await expect(
      bank.addMany("ana-211", [{ ...tf("ana-211-thorax-02"), cites: [] }]),
    ).rejects.toThrow("at least one citation");
    expect(await bank.list()).toHaveLength(0);
  });

  test("requires a quote and valid tf_multi shape", async () => {
    await expect(
      bank.addMany("ana-211", [{ ...tf("ana-211-thorax-03"), cites: [{ note: cite.note }] }]),
    ).rejects.toThrow("quote");
    await expect(
      bank.addMany("ana-211", [
        { ...tf("ana-211-thorax-04"), statements: [{ text: "One", answer: true }] },
      ]),
    ).rejects.toThrow("4 or 5 statements");
  });

  test("updates content, preserves verified state, and verifies", async () => {
    await bank.addMany("ana-211", [tf("ana-211-thorax-05")]);
    bank.verify("ana-211-thorax-05", true);
    expect(bank.get("ana-211-thorax-05").verified).toBe(true);

    const updated = await bank.update("ana-211-thorax-05", {
      ...tf("ignored-id"),
      stem: "Updated stem:",
    });
    expect(updated.id).toBe("ana-211-thorax-05");
    expect((updated.body as { stem: string }).stem).toBe("Updated stem:");
    expect(updated.verified).toBe(true);

    expect(bank.verify("ana-211-thorax-05", false).unverified).toBe(true);
  });

  test("imports past-paper questions as unverified with stable ids", async () => {
    const { id: _ignored, ...withoutId } = tf("ignored");
    const first = await bank.importPastPaper({
      course: "ana-211",
      source: "past-questions/2024-mid.md",
      title: "2024-mid",
      questions: [withoutId, { ...withoutId, stem: "Second:" }],
      requestId: "paper-1",
    });
    expect(first.imported).toBe(2);
    expect(first.questions.map((question) => question.id)).toEqual([
      "ana-211-2024-mid-01",
      "ana-211-2024-mid-02",
    ]);
    expect(first.questions.every((question) => question.unverified && !question.verified)).toBe(
      true,
    );

    const again = await bank.importPastPaper({
      course: "ana-211",
      source: "past-questions/2024-mid.md",
      questions: [withoutId],
      requestId: "paper-1",
    });
    expect(again.imported).toBe(2);
    expect(await bank.list()).toHaveLength(2);
  });

  test("rolls back a whole import when one citation is wrong", async () => {
    const { id: _ignored, ...withoutId } = tf("ignored");
    await expect(
      bank.importPastPaper({
        course: "ana-211",
        source: "past-questions/2024-mid.md",
        questions: [withoutId, { ...withoutId, cites: [{ ...cite, quote: "not there" }] }],
      }),
    ).rejects.toThrow("quote not found");
    expect(await bank.list()).toHaveLength(0);
  });
});

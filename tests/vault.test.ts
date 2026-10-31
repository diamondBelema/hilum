import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-vault-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeNote(path: string, content: string): Promise<void> {
  const abs = join(root, path);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, "utf8");
}

function note(path: string, title: string, summary: string, body: string): string {
  return `---\ntitle: ${title}\nsummary: ${summary}\ntopics: [renal, sodium]\nsource: inbox/test.pdf\npages: 1-2\n---\n\n# ${title}\n\n${body}\n`;
}

describe("vault service", () => {
  test("rejects path traversal and absolute paths", async () => {
    const { vault } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });

    expect(() => vault.readNote("../outside.md")).toThrow(/traversal/);
    expect(() => vault.readNote("/etc/passwd")).toThrow(/absolute/);
    expect(() => vault.readNote("courses/../../x.md")).toThrow(/traversal/);
    await expect(
      vault.writeNote({ path: "../escape.md", content: "x", mode: "create" }),
    ).rejects.toThrow(/traversal/);
  });

  test("writes, reads and searches notes", async () => {
    await writeNote(
      "courses/ana-211/notes/tubules.md",
      note("Tubules", "Tubular sodium", "Sodium handling in the proximal tubule", "Most filtered sodium is reabsorbed in the proximal convoluted tubule."),
    );
    await writeNote(
      "courses/ana-211/notes/loop.md",
      note("Loop", "Countercurrent", "Loop of Henle mechanism", "The countercurrent multiplier concentrates the medullary interstitium."),
    );

    const { vault, indexer } = createApp({
      config: { vaultPath: root, dbPath: ":memory:" },
    });
    await indexer.reindexAll();

    const hits = vault.search("sodium");
    expect(hits.length).toBe(1);
    expect(hits[0]?.path).toBe("courses/ana-211/notes/tubules.md");
    expect(hits[0]?.section).toBe("notes");
    expect(hits[0]?.snippet).toContain("<mark>");

    const read = vault.readNote("courses/ana-211/notes/tubules.md");
    expect(read.title).toBe("Tubular sodium");
    expect(read.body).toContain("proximal convoluted tubule");
    expect(read.tags).toEqual(["renal", "sodium"]);

    const created = await vault.writeNote({
      path: "courses/ana-211/notes/new.md",
      content: note("New", "New note", "Fresh", "A brand new concept about the macula densa."),
      mode: "create",
    });
    expect(created.bytes).toBeGreaterThan(0);
    expect(vault.search("macula").length).toBe(1);

    await writeNote(
      "courses/ana-211/exam-review/short-answer.md",
      note("Short answer", "Exam mechanism", "Exam-focused mechanism note", "Use a structured answer."),
    );
    await indexer.reindexAll();
    const examNote = vault.notesForCourse("ana-211").find((item) => item.title === "Exam mechanism");
    expect(examNote?.section).toBe("exam-review");

    await expect(
      vault.writeNote({ path: created.path, content: note("Dup", "Dup", "", ""), mode: "create" }),
    ).rejects.toThrow(/already exists/);
  });

  test("generates indexes and lists courses", async () => {
    await writeNote(
      "courses/ana-211/course.md",
      "---\ncode: ana-211\ntitle: Anatomy 211\ndepartment: anatomy\n---\n",
    );
    await writeNote(
      "courses/ana-211/notes/one.md",
      note("One", "First", "First summary", "Body one."),
    );
    await writeNote("courses/phy-301/notes/two.md", note("Two", "Second", "Second summary", "Body two."));

    const { vault, indexer } = createApp({
      config: { vaultPath: root, dbPath: ":memory:" },
    });
    await indexer.reindexAll();

    const courses = await vault.listCourses();
    expect(courses.map((c) => c.code)).toEqual(["ana-211", "phy-301"]);
    expect(courses[0]?.title).toBe("Anatomy 211");
    expect(courses[0]?.notes).toBe(1);

    const index = vault.getIndex("ana-211");
    expect(index.generated).toBe(true);
    expect(index.content).toContain("First summary");
    expect(vault.getIndex().content).toContain("phy-301");
  });


  test("watcher reindexes a new note within 2 seconds", async () => {
    const { vault, indexer } = createApp({
      config: { vaultPath: root, dbPath: ":memory:" },
    });
    await indexer.reindexAll();
    indexer.startWatching();

    try {
      await writeNote(
        "courses/ana-211/notes/watched.md",
        note("Watched", "Hepcidin", "Iron regulation", "Hepcidin reduces ferroportin expression."),
      );

      const deadline = Date.now() + 2000;
      while (Date.now() < deadline && vault.search("hepcidin").length === 0) {
        await Bun.sleep(50);
      }
      expect(vault.search("hepcidin").length).toBe(1);
    } finally {
      indexer.close();
    }
  });

  test("index lookup stays under 200 ms for 500 notes", async () => {
    const body = "The countercurrent multiplier and sodium handling in the kidney.";
    await Promise.all(
      Array.from({ length: 500 }).map((_, i) =>
        writeNote(
          `courses/big/notes/note-${i}.md`,
          note(`Note ${i}`, `Note ${i}`, `Summary ${i}`, body),
        ),
      ),
    );

    const { vault, indexer } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await indexer.reindexAll();

    const started = performance.now();
    const index = vault.getIndex("big");
    const elapsed = performance.now() - started;

    expect(index.content).toContain("note-499.md");
    expect(elapsed).toBeLessThan(200);

    const searchStarted = performance.now();
    expect(vault.search("countercurrent").length).toBe(20);
    expect(performance.now() - searchStarted).toBeLessThan(200);
  });
});

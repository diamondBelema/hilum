import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb, type Db } from "../src/server/db.ts";
import { VaultService } from "../src/server/vault/service.ts";
import { ConceptService } from "../src/server/concepts/service.ts";

let root: string;
let db: Db;
let vault: VaultService;
let concepts: ConceptService;

const CITE = {
  note: "ana-211/notes/thorax.md",
  anchor: "thorax",
  quote: "The thoracic wall protects the heart and lungs",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-concepts-"));
  await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
  await writeFile(
    join(root, "courses/ana-211/course.md"),
    "---\ntitle: Anatomy 211\nexam_date: 2026-12-01\n---\n\n# Anatomy 211\n",
    "utf8",
  );
  await writeFile(
    join(root, "courses/ana-211/notes/thorax.md"),
    "# Thorax\n\nThe thoracic wall protects the heart and lungs.\n\n## Ribs {#ribs}\n\nTwelve pairs of ribs form the cage.\n",
    "utf8",
  );
  db = openDb(":memory:");
  vault = new VaultService(db, root);
  concepts = new ConceptService(db, vault);
});

afterEach(async () => {
  db.close();
  await rm(root, { recursive: true, force: true });
});

async function addBase() {
  const thorax = await concepts.add({
    course: "ana-211",
    id: "ana-211-thorax",
    title: "Thorax",
    exam_weight: 0.2,
    cites: [CITE],
    definition: "The region between the neck and abdomen.",
  });
  const wall = await concepts.add({
    course: "ana-211",
    id: "ana-211-thoracic-wall",
    title: "Thoracic wall",
    aliases: ["chest wall"],
    parent: thorax.id,
    prerequisites: [thorax.id],
    exam_weight: 0.15,
    lecturer_flag: true,
    status: "accepted",
    cites: [{ note: "ana-211/notes/thorax.md", anchor: "ribs", quote: "Twelve pairs of ribs" }],
    definition: "Bones, muscles and fascia enclosing the thorax.",
  });
  return { thorax, wall };
}

function addEvidence(
  conceptId: string,
  kind: string,
  correct: boolean,
  answerId: number | null,
  at = Date.now(),
) {
  db.query(
    "INSERT INTO evidence (answer_id, concept_id, kind, correct, time_sec, created_at) VALUES (?, ?, ?, ?, 20, ?)",
  ).run(answerId, conceptId, kind, correct ? 1 : 0, at);
}

describe("concept graph", () => {
  test("writes cited concept files and finds aliases", async () => {
    const { wall } = await addBase();
    expect(wall.path).toBe("concepts/ana-211-thoracic-wall.md");
    const file = await vault.readNote(wall.path);
    expect(file.frontmatter.course).toBe("ana-211");
    expect(file.body).toContain("Bones, muscles");

    const found = concepts.find("chest wall", "ana-211");
    expect(found.map((concept) => concept.id)).toEqual(["ana-211-thoracic-wall"]);
    const henle = concepts.find("henle loop");
    expect(henle).toEqual([]);
  });

  test("requires real citations and existing relation targets", async () => {
    await expect(
      concepts.add({ course: "ana-211", title: "Uncited", cites: [] } as never),
    ).rejects.toThrow();
    await expect(
      concepts.add({
        course: "ana-211",
        title: "Bad cite",
        cites: [{ note: "ana-211/notes/thorax.md", quote: "not in the note" }],
      }),
    ).rejects.toThrow(/quote not found/);
    await expect(
      concepts.add({
        course: "ana-211",
        title: "Orphan",
        parent: "missing",
        cites: [CITE],
      }),
    ).rejects.toThrow(/linked concept not found/);
  });

  test("links concepts and rejects parent cycles", async () => {
    const { thorax, wall } = await addBase();
    const linked = await concepts.link(wall.id, thorax.id, "related");
    expect(linked.related.map((concept) => concept.id)).toContain(thorax.id);
    await expect(concepts.link(thorax.id, wall.id, "parent")).rejects.toThrow(/cycle/);
  });

  test("builds a tree with subtree rollups", async () => {
    await addBase();
    const tree = concepts.tree("ana-211");
    expect(tree.map((node) => [node.id, node.depth])).toEqual([
      ["ana-211-thorax", 0],
      ["ana-211-thoracic-wall", 1],
    ]);
    expect(tree[0]?.rollup.total).toBe(2);
  });
});

describe("mastery", () => {
  test("moves from unseen to understood, mastered, then decayed", async () => {
    const { wall } = await addBase();
    expect(concepts.get(wall.id).mastery.state).toBe("unseen");

    addEvidence(wall.id, "exam:mcq_single", true, null);
    addEvidence(wall.id, "exam:theory", true, null);
    expect(concepts.get(wall.id).mastery.state).toBe("understood");

    db.query(
      "INSERT INTO evidence (answer_id, concept_id, kind, correct, time_sec, created_at) VALUES (?, ?, ?, 1, 20, ?)",
    ).run(99, wall.id, "exam:mcq_single", Date.now());
    expect(concepts.get(wall.id).mastery.state).toBe("mastered");

    const old = Date.now() - 40 * 86_400_000;
    db.query("UPDATE evidence SET created_at = ? WHERE concept_id = ?").run(old, wall.id);
    const decayed = concepts.get(wall.id).mastery;
    expect(decayed.state).toBe("decayed");
    expect(decayed.overdue).toBe(true);
    expect(concepts.due("ana-211").map((concept) => concept.id)).toContain(wall.id);
  });

  test("keeps real exam results out of mastery evidence", async () => {
    const { wall } = await addBase();
    concepts.recordRealResult({ conceptId: wall.id, correct: true, kind: "final" });

    expect(concepts.get(wall.id).mastery.state).toBe("unseen");
    expect(concepts.get(wall.id).mastery.evidenceCount).toBe(0);
    expect(db.query("SELECT COUNT(*) AS n FROM evidence").get()).toEqual({ n: 0 });
    expect(
      db.query("SELECT concept_id, course, kind, correct FROM real_results").all(),
    ).toEqual([{ concept_id: wall.id, course: "ana-211", kind: "final", correct: 1 }]);
  });

  test("frontier honours prerequisites and ranks lecturer flags", async () => {
    const { thorax, wall } = await addBase();
    const next = concepts.next("ana-211", 5, "2026-12-01");
    expect(next.map((item) => item.concept.id)).toEqual([thorax.id]);
    addEvidence(thorax.id, "exam:mcq_single", true, null);
    addEvidence(thorax.id, "exam:theory", true, null);
    const opened = concepts.next("ana-211", 5, "2026-12-01");
    expect(opened[0]?.concept.id).toBe(wall.id);
    expect(opened.map((item) => item.concept.id)).toContain(thorax.id);
    expect(opened[0]?.reason).toMatch(/Lecturer flagged|high exam weight/);
  });

  test("dashboard reports course progress and the review queue", async () => {
    await addBase();
    const dashboard = await concepts.dashboard();
    expect(dashboard.courses[0]?.code).toBe("ana-211");
    expect(dashboard.courses[0]?.total).toBe(2);
    expect(dashboard.exams[0]?.days).toBeGreaterThan(0);
    expect(dashboard.counts.total).toBe(2);
  });
});

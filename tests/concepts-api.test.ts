import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-concepts-api-"));
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
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("concept and mastery api", () => {
  test("adds cited concepts, builds the tree and returns the dashboard", async () => {
    const { app, indexer } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
    await indexer.reindexAll();
    const cite = {
      note: "ana-211/notes/thorax.md",
      anchor: "thorax",
      quote: "The thoracic wall protects",
    };
    const parent = await app.request("/api/concepts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        id: "ana-211-thorax",
        title: "Thorax",
        exam_weight: 0.2,
        cites: [cite],
        definition: "The region between neck and abdomen.",
      }),
    });
    expect(parent.status).toBe(201);

    const child = await app.request("/api/concepts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        course: "ana-211",
        id: "ana-211-thoracic-wall",
        title: "Thoracic wall",
        aliases: ["chest wall"],
        parent: "ana-211-thorax",
        prerequisites: ["ana-211-thorax"],
        exam_weight: 0.15,
        cites: [{ note: "ana-211/notes/thorax.md", anchor: "ribs", quote: "Twelve pairs of ribs" }],
      }),
    });
    expect(child.status).toBe(201);

    const tree = (await (await app.request("/api/mastery/tree?course=ana-211")).json()) as {
      id: string;
      depth: number;
      rollup: { total: number };
    }[];
    expect(tree.map((node) => [node.id, node.depth])).toEqual([
      ["ana-211-thorax", 0],
      ["ana-211-thoracic-wall", 1],
    ]);
    expect(tree[0]?.rollup.total).toBe(2);

    const graph = (await (await app.request("/api/graph?course=ana-211")).json()) as {
      nodes: { id: string }[];
      edges: { from: string; to: string; type: string }[];
    };
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "ana-211-thorax",
      "ana-211-thoracic-wall",
    ]);
    expect(graph.edges).toEqual([
      { from: "ana-211-thoracic-wall", to: "ana-211-thorax", type: "parent" },
      { from: "ana-211-thoracic-wall", to: "ana-211-thorax", type: "prerequisite" },
    ]);

    const snapshot = (await (await app.request("/api/mastery?course=ana-211")).json()) as {
      counts: { total: number; unseen: number };
    };
    expect(snapshot.counts.total).toBe(2);
    expect(snapshot.counts.unseen).toBe(2);

    const frontier = (await (
      await app.request("/api/mastery/next?course=ana-211")
    ).json()) as { concept: { id: string }; reason: string }[];
    expect(frontier[0]?.concept.id).toBe("ana-211-thorax");

    const dashboard = (await (await app.request("/api/dashboard")).json()) as {
      courses: { code: string; total: number }[];
      exams: { days: number }[];
    };
    expect(dashboard.courses[0]?.code).toBe("ana-211");
    expect(dashboard.courses[0]?.total).toBe(2);
    expect(dashboard.exams[0]?.days).toBeGreaterThan(0);

    const detail = (await (
      await app.request("/api/concepts/ana-211-thoracic-wall")
    ).json()) as {
      title: string;
      prerequisites: { id: string }[];
      status: string;
    };
    expect(detail.title).toBe("Thoracic wall");
    expect(detail.prerequisites[0]?.id).toBe("ana-211-thorax");
    expect(detail.status).toBe("proposed");

    const accepted = await app.request("/api/concepts/ana-211-thoracic-wall", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "accepted" }),
    });
    expect(accepted.status).toBe(200);
    expect(((await accepted.json()) as { status: string }).status).toBe("accepted");

    const invalid = await app.request("/api/concepts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ course: "ana-211", title: "No citation" }),
    });
    expect(invalid.status).toBe(400);
  });
});

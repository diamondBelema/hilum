import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

describe("http api", () => {
  test("health reports ok, version, mcp and vault", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.status).toBe("ok");
    expect(body.mcp).toBe("/mcp");
    expect(body.vault).toBe("/tmp/vault");
  });

  test("meta exposes the schema version", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:" } });
    const res = await app.request("/api/meta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { key: string; value: string }[] };
    expect(body.meta).toEqual([{ key: "schema_version", value: "4" }]);
  });

  test("serves questions, updates content and verifies", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-api-"));
    await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
    await writeFile(
      join(root, "courses/ana-211/notes/thorax.md"),
      "## Bones {#bones}\n\nTwelve thoracic vertebrae lie posteriorly.\n",
      "utf8",
    );
    const { app, questions } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
    const question = {
      id: "ana-211-api-01",
      type: "mcq_single" as const,
      marks: 1,
      stem: "How many thoracic vertebrae?",
      options: { A: "10", B: "12" },
      answer: "B",
      cites: [{ note: "ana-211/notes/thorax.md", anchor: "bones", quote: "Twelve thoracic" }],
    };
    await questions.addMany("ana-211", [question]);

    const list = await app.request("/api/questions?course=ana-211&verified=false");
    expect(list.status).toBe(200);
    const rows = (await list.json()) as { id: string }[];
    expect(rows.map((row) => row.id)).toEqual(["ana-211-api-01"]);

    const patch = await app.request("/api/questions/ana-211-api-01", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...question, stem: "Updated?" }),
    });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as { body: { stem: string } }).body.stem).toBe("Updated?");

    const verify = await app.request("/api/questions/ana-211-api-01/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ verified: true }),
    });
    expect(((await verify.json()) as { verified: boolean }).verified).toBe(true);

    const missing = await app.request("/api/questions/nope");
    expect(missing.status).toBe(400);
    await rm(root, { recursive: true, force: true });
  });
});

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
    expect(body.meta).toEqual([{ key: "schema_version", value: "5" }]);
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

describe("grading and photo api", () => {
  test("uploads a photo, queues theory, grades it and streams events", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-grade-api-"));
    await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
    await writeFile(
      join(root, "courses/ana-211/notes/thorax.md"),
      "## Thorax {#thorax}\n\nThe thoracic wall protects the heart and lungs.\n",
      "utf8",
    );
    const { app, questions, papers, runner } = createApp({
      config: {
        dbPath: join(root, "app.db"),
        vaultPath: root,
        uploadPath: join(root, "uploads"),
      },
    });
    const [question] = await questions.addMany("ana-211", [
      {
        id: "ana-211-photo-01",
        type: "theory",
        question_kind: "region",
        topics: ["thorax"],
        concept_ids: ["thoracic-wall"],
        marks: 10,
        prompt: "Describe the thoracic wall.",
        model_answer: "It protects the heart and lungs.",
        answer_input: "photo",
        cites: [{ note: "ana-211/notes/thorax.md", anchor: "thorax", quote: "thoracic wall" }],
      },
    ]);
    questions.verify(question!.id, true);
    const paper = await papers.create({
      course: "ana-211",
      blueprint: [{ section: "C", type: "theory", count: 1, minutes: 20 }],
    });
    const started = runner.start(paper.id);

    const form = new FormData();
    form.set("question_id", question!.id);
    form.set("file", new File([new Uint8Array([137, 80, 78, 71])], "answer.png", { type: "image/png" }));
    const uploaded = await app.request(`/api/attempts/${started.attempt.id}/photo`, {
      method: "POST",
      body: form,
    });
    expect(uploaded.status).toBe(200);
    const saved = (await uploaded.json()) as { response: { photo: string } };
    expect(saved.response.photo).toMatch(/\.png$/);

    const image = await app.request(
      `/api/attempts/${started.attempt.id}/photo/${question!.id}?file=${encodeURIComponent(saved.response.photo)}`,
    );
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");

    const submitted = await app.request(`/api/attempts/${started.attempt.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(submitted.status).toBe(200);

    const pending = await app.request("/api/grading?course=ana-211");
    const items = (await pending.json()) as { answerId: number; response: { photo: string } }[];
    expect(items).toHaveLength(1);
    expect(items[0]?.response.photo).toBe(saved.response.photo);
    expect(items[0]?.answerId).toBeGreaterThan(0);

    const prompt = await app.request(`/api/grading/${items[0]!.answerId}/prompt`);
    expect(((await prompt.json()) as { prompt: string }).prompt).toContain("photo");

    const graded = await app.request(`/api/answers/${items[0]!.answerId}/grade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        answer_id: items[0]!.answerId,
        rubric_scores: [{ heading: "Overall", awarded: 6, max: 10 }],
        feedback: "Add the mechanics.",
        mistake_tags: ["wrong_structure"],
      }),
    });
    expect(graded.status).toBe(200);
    expect(((await graded.json()) as { total: number }).total).toBe(6);

    const results = (await (
      await app.request(`/api/attempts/${started.attempt.id}/results`)
    ).json()) as { score: { awarded: number }; items: { grade: { total: number } | null }[] };
    expect(results.score.awarded).toBe(6);
    expect(results.items[0]?.grade?.total).toBe(6);

    const events = await app.request("/api/events");
    expect(events.headers.get("content-type")).toBe("text/event-stream");
    const reader = events.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"type":"hello"');
    await reader.cancel();
    await rm(root, { recursive: true, force: true });
  });
});

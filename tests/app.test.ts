import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

describe("http api", () => {
  test("allows the packaged Tauri UI to call the sidecar", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
    const res = await app.request("/api/health", {
      headers: { origin: "http://tauri.localhost" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://tauri.localhost");

    const preflight = await app.request("/api/settings", {
      method: "OPTIONS",
      headers: {
        origin: "http://tauri.localhost",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("health reports ok, version, mcp and vault", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown> & {
      readiness?: { vault: boolean; database: boolean; agent: string; setupComplete: boolean };
    };
    expect(body.status).toBe("ok");
    expect(body.mcp).toBe("/mcp");
    expect(body.vault).toBe("/tmp/vault");
    expect(body.readiness).toMatchObject({
      database: true,
      agent: "none",
      setupComplete: false,
    });
  });

  test("meta exposes the schema version", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:" } });
    const res = await app.request("/api/meta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { key: string; value: string }[] };
    expect(body.meta).toEqual([{ key: "schema_version", value: "9" }]);
  });

  test("reads and updates LAN and MCP token settings", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:" } });
    const initial = (await (await app.request("/api/settings")).json()) as {
      lan: boolean;
      mcpToken: string | null;
      bindHost: string;
      mcpUrls: string[];
      agent: { state: string; clientName: string | null };
    };
    expect(initial.lan).toBe(false);
    expect(initial.mcpToken).toBeNull();
    expect(initial.bindHost).toBe("127.0.0.1");
    expect(initial.mcpUrls).toEqual(["http://127.0.0.1:4747/mcp"]);
    expect(initial.agent).toMatchObject({ state: "none", clientName: null });

    const updated = (await (
      await app.request("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lan: true, regenerateToken: true }),
      })
    ).json()) as { lan: boolean; mcpToken: string | null; restartRequired: boolean };
    expect(updated.lan).toBe(true);
    expect(updated.mcpToken).toStartWith("hilum_");
    expect(updated.restartRequired).toBe(true);

    const persisted = (await (await app.request("/api/settings")).json()) as {
      lan: boolean;
      mcpToken: string | null;
    };
    expect(persisted.lan).toBe(true);
    expect(persisted.mcpToken).toBe(updated.mcpToken);
  });

  test("rejects unsafe vault switches and persists valid restart-safe paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-vault-switch-"));
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
    const relative = await app.request("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vaultPath: "." }),
    });
    expect(relative.status).toBe(400);
    const invalid = await app.request("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vaultPath: join(root, "missing") }),
    });
    expect(invalid.status).toBe(400);
    const valid = await app.request("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vaultPath: root }),
    });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      configuredVault: root,
      restartRequired: true,
    });
    await rm(root, { recursive: true, force: true });
  });

  test("rescans the vault and returns fresh index stats", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-rescan-"));
    await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
    await writeFile(
      join(root, "courses/ana-211/notes/intro.md"),
      "# Intro\n\nA cited note.\n",
      "utf8",
    );
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
    const res = await app.request("/api/vault/rescan", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      stats: { notes: number; courses: number };
    };
    expect(body.ok).toBe(true);
    expect(body.stats.notes).toBe(1);
    expect(body.stats.courses).toBe(1);
    await rm(root, { recursive: true, force: true });
  });

  test("creates a vault backup outside the vault", async () => {
    const root = await mkdtemp(join(tmpdir(), "harness-backup-"));
    await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
    await writeFile(join(root, "courses/ana-211/notes/intro.md"), "# Intro\n\nBackup me.\n", "utf8");
    const dbPath = join(root, "state", "app.db");
    const { app } = createApp({ config: { dbPath, vaultPath: root } });
    const res = await app.request("/api/vault/backup", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      destination: string;
      source: string;
      database: string;
    };
    expect(body.ok).toBe(true);
    expect(body.source).toBe(root);
    expect(body.destination).not.toContain(`${root}/backups/`);
    expect(await readFile(join(body.destination, "courses/ana-211/notes/intro.md"), "utf8")).toContain("Backup me.");
    expect((await readFile(body.database)).byteLength).toBeGreaterThan(0);
    expect(JSON.parse(await readFile(join(body.destination, "manifest.json"), "utf8"))).toMatchObject({
      format: 1,
      database: dbPath,
    });
    const listed = await app.request("/api/vault/backups");
    expect(listed.status).toBe(200);
    expect((await listed.json()).backups).toHaveLength(1);
    await rm(root, { recursive: true, force: true });
  });

  test("diagnostics exclude secrets and study content", async () => {
    const { app } = createApp({
      config: { dbPath: ":memory:", vaultPath: "/tmp/hilum-diagnostics-vault", mcpToken: "secret-token" },
    });

    test("creates a deterministic demo course without overwriting it", async () => {
      const root = await mkdtemp(join(tmpdir(), "harness-demo-"));
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
      const first = await app.request("/api/onboarding/demo", { method: "POST" });
      expect(first.status).toBe(201);
      expect((await first.json())).toMatchObject({ ok: true, created: true, course: "demo-101" });
      const second = await app.request("/api/onboarding/demo", { method: "POST" });
      expect(second.status).toBe(409);
      await rm(root, { recursive: true, force: true });
    });
    const res = await app.request("/api/diagnostics");
    expect(res.status).toBe(200);
    const body = JSON.stringify(await res.json());
    expect(body).not.toContain("secret-token");
    expect(body).not.toContain("courses/");
    expect(body).toContain("excludes MCP tokens");
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
      body: JSON.stringify({ verified: true, by: "diamond" }),
    });
    const verified = (await verify.json()) as { verified: boolean; verifiedBy: string | null };
    expect(verified.verified).toBe(true);
    expect(verified.verifiedBy).toBe("diamond");

    const missing = await app.request("/api/questions/nope");
    expect(missing.status).toBe(400);
    await rm(root, { recursive: true, force: true });
  });

  describe("spa fallback", () => {
    test("serves app shell for /library/graph", async () => {
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
      const res = await app.request("/library/graph");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    test("serves app shell for /settings", async () => {
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
      const res = await app.request("/settings");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    test("serves app shell for /sessions/abc", async () => {
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
      const res = await app.request("/sessions/abc");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });

    test("returns JSON 404 for /api/nope", async () => {
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
      const res = await app.request("/api/nope");
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("not found");
      expect(res.headers.get("content-type")).toContain("application/json");
    });

    test("returns 404 for /assets/missing.js", async () => {
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
      const res = await app.request("/assets/missing.js");
      expect(res.status).toBe(404);
    });
  });

  describe("message lifecycle http (A4)", () => {
    test("POST /api/sessions/:id/requests stores sent, idempotent by clientId", async () => {
      const root = await mkdtemp(join(tmpdir(), "harness-a4-"));
      await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
      await writeFile(
        join(root, "courses/ana-211/notes/tubules.md"),
        "---\ntitle: Tubules\n---\n\n# Tubules\n\nFiltered sodium is reabsorbed.\n",
        "utf8",
      );
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
      const created = await app.request("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211", goal: "learn" }),
      });
      expect(created.status).toBe(201);
      const sessionId = (await created.json()) as { id: string };

      const r1 = await app.request(`/api/sessions/${sessionId.id}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "help me", clientId: "c1" }),
      });
      expect(r1.status).toBe(201);
      const r1Json = await r1.json();
      expect(r1Json.status).toBe("sent");
      const r1Id = r1Json.id;

      const r2 = await app.request(`/api/sessions/${sessionId.id}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "help me", clientId: "c1" }),
      });
      expect((await r2.json()).id).toBe(r1Id);

      const r3 = await app.request(`/api/sessions/${sessionId.id}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "other", clientId: "c2" }),
      });
      const r3Json = await r3.json();
      expect(r3Json.status).toBe("sent");
      expect(r3Json.id).not.toBe(r1Id);

      await rm(root, { recursive: true, force: true });
    });
  });

  describe("notes tree (A7)", () => {
    async function setupVault() {
      const root = await mkdtemp(join(tmpdir(), "harness-a7-"));
      await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
      await writeFile(
        join(root, "courses/ana-211/notes/tubules.md"),
        "---\ntitle: Tubules\n---\n\n# Tubules {#tubules}\n\nFiltered sodium is reabsorbed.\n",
        "utf8",
      );
      return root;
    }

    test("GET /api/notes/tree?course= returns notes for the course", async () => {
      const root = await setupVault();
      const { app, vault, indexer } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
      await vault.writeNote({
        path: "courses/ana-211/notes/extra.md",
        content: "---\ntitle: Extra\n---\n\n# Extra\n\nbody.\n",
        mode: "create",
      });
      await indexer.reindexAll();
      const res = await app.request("/api/notes/tree?course=ana-211");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { path: string; course: string; title: string }[];
      expect(body.map((n) => n.path).sort()).toEqual(
        ["courses/ana-211/notes/extra.md", "courses/ana-211/notes/tubules.md"].sort(),
      );
      await rm(root, { recursive: true, force: true });
    });

    test("POST /api/notes creates a note", async () => {
      const root = await setupVault();
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
      const res = await app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211", title: "My Note", folder: "drafts" }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as { path: string; bytes: number };
      expect(body.path).toBe("courses/ana-211/drafts/My-Note.md");
      await rm(root, { recursive: true, force: true });
    });

    test("PUT /api/notes returns 409 on etag mismatch and 200 on match", async () => {
      const root = await setupVault();
      const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });
      const created = await app.request("/api/notes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211", title: "Editable", folder: "drafts" }),
      });
      expect(created.status).toBe(201);
      const { path } = (await created.json()) as { path: string };

      const fs = await import("node:fs/promises");
      const mtime = String((await fs.stat(join(root, path))).mtimeMs);

      const mismatch = await app.request("/api/notes", {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": "wrong" },
        body: JSON.stringify({ path, content: "---\ntitle: Editable\n---\n\n# Editable\n\nchanged\n" }),
      });
      expect(mismatch.status).toBe(409);

      const match = await app.request("/api/notes", {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": mtime },
        body: JSON.stringify({ path, content: "---\ntitle: Editable\n---\n\n# Editable\n\nchanged\n" }),
      });
      expect(match.status).toBe(200);
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

    test("creates, answers, banks and ends a live session over HTTP", async () => {
      const root = await mkdtemp(join(tmpdir(), "harness-live-api-"));
      await mkdir(join(root, "courses/ana-211/notes"), { recursive: true });
      await writeFile(
        join(root, "courses/ana-211/notes/thorax.md"),
        "## Diaphragm {#diaphragm}\n\nThe diaphragm is the primary muscle of inspiration.\n",
        "utf8",
      );
      const { app, sessions } = createApp({ config: { dbPath: ":memory:", vaultPath: root } });

      const created = await app.request("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ course: "ana-211", goal: "review" }),
      });
      expect(created.status).toBe(201);
      const session = (await created.json()) as { id: string; agentConnected: boolean };
      expect(session.agentConnected).toBe(false);

      const activity = await sessions.pushActivity(session.id, {
        title: "Diaphragm probe",
        cites: [
          {
            note: "ana-211/notes/thorax.md",
            anchor: "diaphragm",
            quote: "The diaphragm is the primary muscle of inspiration",
          },
        ],
        concept_ids: ["diaphragm"],
        components: [
          {
            type: "mcq_single",
            stem: "Primary muscle of inspiration?",
            options: ["Diaphragm", "Rectus abdominis"],
            answer: 0,
            concept_ids: ["diaphragm"],
          },
        ],
      });

      const answered = await app.request(`/api/sessions/${session.id}/activities/${activity.id}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: { components: [0] }, time_sec: 7 }),
      });
      expect(answered.status).toBe(200);
      expect(((await answered.json()) as { status: string }).status).toBe("answered");

      const request = await app.request(`/api/sessions/${session.id}/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Explain this" }),
      });
      expect(request.status).toBe(201);

      const banked = await app.request(`/api/activities/${activity.id}/bank`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: ["thorax"] }),
      });
      expect(banked.status).toBe(201);
      const bankPath = ((await banked.json()) as { path: string }).path;
      expect(await readFile(join(root, bankPath), "utf8")).toContain("Diaphragm probe");

      const ended = await app.request(`/api/sessions/${session.id}/end`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary: "Diaphragm first." }),
      });
      expect(ended.status).toBe(200);
      const endedSession = (await ended.json()) as { endedAt: number | null; notePath: string | null };
      expect(endedSession.endedAt).toBeNumber();
      expect(await readFile(join(root, endedSession.notePath ?? ""), "utf8")).toContain("Diaphragm first.");

      const active = await app.request("/api/sessions/active");
      expect(await active.json()).toBeNull();
      await rm(root, { recursive: true, force: true });
    });
  });
});

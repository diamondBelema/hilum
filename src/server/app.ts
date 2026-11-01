import { Hono } from "hono";
import { randomBytes } from "node:crypto";
import { serveStatic } from "hono/bun";
import { loadConfig, paths, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { handleMcpRequest } from "./mcp.ts";
import { QuestionBank, QuestionError } from "./questions/service.ts";
import { CitationError } from "./questions/citations.ts";
import { ExamError, ExamRunner } from "./exams/attempts.ts";
import { PaperError, PaperService } from "./exams/papers.ts";
import { GradingError, GradingService } from "./exams/grading.ts";
import { SessionError, SessionService } from "./sessions/service.ts";
import { ConceptError, ConceptService } from "./concepts/service.ts";
import { EventBus } from "./events.ts";
import { access, cp, mkdir, readFile, readdir, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { NoteIndexer } from "./vault/indexer.ts";
import { VaultService } from "./vault/service.ts";
import { resolveInside, VaultPathError } from "./vault/paths.ts";
import { ZodError } from "zod";
import { GoalError, GoalService } from "./goals/service.ts";

export type AppDeps = {
  config?: Partial<Config>;
};

function lanAddresses(port: number): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      addresses.push(`http://${entry.address}:${port}`);
    }
  }
  return [...new Set(addresses)].sort();
}

function backupRootFor(config: Config): string {
  const dbDirectory = dirname(config.dbPath === ":memory:" ? join(config.vaultPath, "app.db") : config.dbPath);
  const vaultRoot = resolve(config.vaultPath);
  const candidateRoot = resolve(dbDirectory, "backups");
  const relativePath = relative(vaultRoot, candidateRoot);
  return relativePath && !relativePath.startsWith("..")
    ? join(dirname(vaultRoot), "hilum-backups")
    : candidateRoot;
}

export function createApp(deps: AppDeps = {}) {
  const config = loadConfig(deps.config);
  const db = openDb(config.dbPath);
  const storedLan = db.query("SELECT value FROM meta WHERE key = ?").get("setting:lan") as
    | { value: string }
    | null;
  const storedToken = db.query("SELECT value FROM meta WHERE key = ?").get("setting:mcp_token") as
    | { value: string }
    | null;
  const storedVault = db.query("SELECT value FROM meta WHERE key = ?").get("setting:vault_path") as
    | { value: string }
    | null;
  if (storedLan) config.lan = storedLan.value === "1";
  if (storedToken) config.mcpToken = storedToken.value;
  if (storedVault?.value) {
    config.configuredVaultPath = storedVault.value;
    config.vaultPath = storedVault.value;
  }
  const indexer = new NoteIndexer(db, config.vaultPath);
  const vault = new VaultService(db, config.vaultPath, indexer);
  const questions = new QuestionBank(db, vault);
  const papers = new PaperService(db, vault);
  const events = new EventBus();
  const runner = new ExamRunner(db, papers, events);
  const grading = new GradingService(
    db,
    papers,
    events,
    `http://${config.hostname}:${config.port}`,
  );
  const concepts = new ConceptService(db, vault);
  const goals = new GoalService(db, vault, events, concepts);
  const sessions = new SessionService(db, vault, events, goals);
  const app = new Hono();

  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (
      origin === "http://tauri.localhost" ||
      origin === "https://tauri.localhost" ||
      origin === "tauri://localhost" ||
      origin === "http://127.0.0.1:5173"
    ) {
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      c.header("access-control-allow-headers", "content-type,authorization");
      c.header("vary", "Origin");
    }
    if (c.req.method === "OPTIONS") return c.body(null, 204);
    await next();
  });

  const requireToken = async (c: Parameters<Parameters<typeof app.use>[1]>[0], next: () => Promise<void>) => {
    if (config.lan && config.mcpToken) {
      const header = c.req.header("authorization") ?? "";
      if (header !== `Bearer ${config.mcpToken}`) {
        return c.json({ error: "unauthorized" }, 401);
      }
    }
    await next();
  };
  app.use("/mcp", requireToken);
  app.use("/mcp/*", requireToken);

  app.onError((err, c) => {
    if (
      err instanceof VaultPathError ||
      err instanceof QuestionError ||
      err instanceof PaperError ||
      err instanceof ExamError ||
      err instanceof GradingError ||
      err instanceof SessionError ||
      err instanceof ConceptError ||
      err instanceof GoalError
    ) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof CitationError) return c.json({ error: err.message }, 422);
    if (err instanceof ZodError) return c.json({ error: zodMessage(err) }, 400);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return c.json({ error: "not found" }, 404);
    console.error(err);
    return c.json({ error: "internal server error" }, 500);
  });

  app.get("/api/health", async (c) => {
    let disk: { freeBytes: number; totalBytes: number; freePercent: number } | null = null;
    try {
      const stats = await statfs(dirname(config.dbPath));
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      disk = {
        freeBytes,
        totalBytes,
        freePercent: totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 1000) / 10 : 0,
      };
    } catch {
      disk = null;
    }
    const vaultReady = await access(config.vaultPath, fsConstants.R_OK | fsConstants.W_OK)
      .then(() => true)
      .catch(() => false);
    const dbReady =
      config.dbPath === ":memory:" ||
      (await access(config.dbPath, fsConstants.R_OK | fsConstants.W_OK)
        .then(() => true)
        .catch(() => false));
    const agent = sessions.agentState();
    return c.json({
      status: vaultReady && dbReady ? "ok" : "degraded",
      version: config.version,
      mcp: "/mcp",
      vault: config.vaultPath,
      configuredVault: config.configuredVaultPath ?? config.vaultPath,
      db: config.dbPath,
      readiness: {
        vault: vaultReady,
        database: dbReady,
        agent: agent.state,
        setupComplete: vaultReady && dbReady && vault.stats().courses > 0,
      },
      disk,
      stats: vault.stats(),
    });
  });

  app.get("/api/diagnostics", async (c) => {
    let disk: { freeBytes: number; totalBytes: number; freePercent: number } | null = null;
    try {
      const stats = await statfs(dirname(config.dbPath));
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      disk = {
        freeBytes,
        totalBytes,
        freePercent: totalBytes > 0 ? Math.round((freeBytes / totalBytes) * 1000) / 10 : 0,
      };
    } catch {
      disk = null;
    }
    const vaultReadable = await access(config.vaultPath, fsConstants.R_OK).then(() => true).catch(() => false);
    const vaultWritable = await access(config.vaultPath, fsConstants.W_OK).then(() => true).catch(() => false);
    const databaseAccessible =
      config.dbPath === ":memory:" ||
      (await access(config.dbPath, fsConstants.R_OK | fsConstants.W_OK).then(() => true).catch(() => false));
    return c.json({
      generatedAt: Date.now(),
      version: config.version,
      runtime: "bun",
      host: config.hostname,
      port: config.port,
      lan: config.lan,
      vault: {
        path: config.vaultPath,
        readable: vaultReadable,
        writable: vaultWritable,
        stats: vault.stats(),
      },
      database: {
        path: config.dbPath,
        accessible: databaseAccessible,
      },
      disk,
      agent: sessions.agentState(),
      note: "This report excludes MCP tokens and study content.",
    });
  });

  app.get("/api/settings", (c) =>
    c.json({
      lan: config.lan,
      mcpToken: config.mcpToken,
      vault: config.vaultPath,
      db: config.dbPath,
      agent: sessions.agentState(),
      bindHost: config.lan ? "0.0.0.0" : config.hostname,
      webUrls: config.lan
        ? lanAddresses(config.port)
        : [`http://${config.hostname}:${config.port}`],
      mcpUrls: config.lan
        ? lanAddresses(config.port).map((url) => `${url}/mcp`)
        : [`http://${config.hostname}:${config.port}/mcp`],
    }),
  );

  app.post("/api/vault/rescan", async (c) => {
    const stats = await indexer.reindexAll();
    return c.json({
      ok: true,
      vault: config.vaultPath,
      stats,
    });
  });

  app.post("/api/onboarding/demo", async (c) => {
    const course = "demo-101";
    const courseDir = join(config.vaultPath, "courses", course);
    if (await access(courseDir).then(() => true).catch(() => false)) {
      return c.json({ ok: false, created: false, course, message: "Demo course already exists." }, 409);
    }
    await mkdir(join(courseDir, "notes"), { recursive: true });
    await writeFile(
      join(courseDir, "course.md"),
      "---\ncode: demo-101\ntitle: Hilum demo course\ndepartment: Study skills\n---\n\n# Hilum demo course\n\nUse this course to explore notes, sessions, the graph and progress.\n",
      "utf8",
    );
    await writeFile(
      join(courseDir, "INDEX.md"),
      "# Hilum demo course\n\nThis small course is safe sample content for first-run setup.\n",
      "utf8",
    );
    await writeFile(
      join(courseDir, "notes", "getting-started.md"),
      "---\ntitle: Getting started with Hilum\ntopics: [orientation]\n---\n\n# Getting started\n\nHilum connects source notes, teaching sessions, evidence, questions and the knowledge graph.\n",
      "utf8",
    );
    await indexer.reindexAll();
    return c.json({ ok: true, created: true, course, stats: vault.stats() }, 201);
  });

  app.post("/api/vault/backup", async (c) => {
    const timestamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const backupRoot = backupRootFor(config);
    const destination = join(backupRoot, `vault-${timestamp}`);
    await mkdir(backupRoot, { recursive: true });
    await cp(config.vaultPath, destination, { recursive: true, errorOnExist: true });
    const databasePath = join(destination, "hilum.sqlite");
    await writeFile(databasePath, db.serialize());
    await writeFile(
      join(destination, "manifest.json"),
      JSON.stringify(
        {
          format: 1,
          createdAt: Date.now(),
          vault: config.vaultPath,
          database: config.dbPath,
          stats: vault.stats(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    return c.json({
      ok: true,
      source: config.vaultPath,
      destination,
      createdAt: Date.now(),
      database: databasePath,
      stats: vault.stats(),
    });
  });

  app.get("/api/vault/backups", async (c) => {
    const root = backupRootFor(config);
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      return c.json({ root, backups: [] });
    }
    const backups = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("vault-")) continue;
      const path = join(root, entry.name);
      const manifestPath = join(path, "manifest.json");
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
          format?: number;
          createdAt?: number;
          stats?: { notes?: number; courses?: number; tokens?: number };
        };
        const info = await stat(path);
        backups.push({
          name: entry.name,
          path,
          createdAt: manifest.createdAt ?? info.mtimeMs,
          format: manifest.format ?? null,
          stats: manifest.stats ?? null,
          hasDatabase: await access(join(path, "hilum.sqlite")).then(() => true).catch(() => false),
        });
      } catch {
        continue;
      }
    }
    backups.sort((a, b) => b.createdAt - a.createdAt);
    return c.json({ root, backups });
  });

  app.post("/api/settings", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    let restartRequired = false;
    if (typeof body.lan === "boolean" && body.lan !== config.lan) {
      config.lan = body.lan;
      db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
        "setting:lan",
        config.lan ? "1" : "0",
      );
      restartRequired = true;
    }
    if (typeof body.mcpToken === "string" && body.mcpToken.trim()) {
      config.mcpToken = body.mcpToken.trim();
      db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
        "setting:mcp_token",
        config.mcpToken,
      );
    }
    if (body.regenerateToken === true) {
      config.mcpToken = `hilum_${randomBytes(24).toString("base64url")}`;
      db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
        "setting:mcp_token",
        config.mcpToken,
      );
    }
    if (typeof body.vaultPath === "string" && body.vaultPath.trim()) {
      const rawPath = body.vaultPath.trim();
      if (!isAbsolute(rawPath)) {
        return c.json({ error: "vault path must be absolute" }, 400);
      }
      const requested = resolve(rawPath);
      const validDirectory = await stat(requested)
        .then(
          (info) =>
            info.isDirectory() &&
            access(requested, fsConstants.R_OK | fsConstants.W_OK)
              .then(() => true)
              .catch(() => false),
        )
        .catch(() => false);
      if (!validDirectory) {
        return c.json(
          { error: "vault path must be an existing, readable and writable directory" },
          400,
        );
      }
      db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
        "setting:vault_path",
        requested,
      );
      config.configuredVaultPath = requested;
      restartRequired = true;
    }
    return c.json({
      lan: config.lan,
      mcpToken: config.mcpToken,
      vault: config.vaultPath,
      db: config.dbPath,
      configuredVault: config.configuredVaultPath ?? config.vaultPath,
      agent: sessions.agentState(),
      bindHost: config.lan ? "0.0.0.0" : config.hostname,
      webUrls: config.lan
        ? lanAddresses(config.port)
        : [`http://${config.hostname}:${config.port}`],
      mcpUrls: config.lan
        ? lanAddresses(config.port).map((url) => `${url}/mcp`)
        : [`http://${config.hostname}:${config.port}/mcp`],
      restartRequired,
    });
  });

  app.get("/api/meta", (c) => {
    const rows = db.query("SELECT key, value FROM meta ORDER BY key").all();
    return c.json({ meta: rows });
  });

  app.get("/api/courses", async (c) => {
    const courses = await vault.listCourses();
    const questionCounts = new Map(
      (
        db
          .query("SELECT course, COUNT(*) AS n FROM questions GROUP BY course")
          .all() as { course: string; n: number }[]
      ).map((row) => [row.course, row.n]),
    );
    const conceptCounts = new Map(
      (
        db
          .query("SELECT course, COUNT(*) AS n FROM concepts GROUP BY course")
          .all() as { course: string; n: number }[]
      ).map((row) => [row.course, row.n]),
    );
    return c.json(
      courses.map((course) => ({
        ...course,
        questions: questionCounts.get(course.code) ?? 0,
        concepts: conceptCounts.get(course.code) ?? 0,
      })),
    );
  });

  app.get("/api/courses/:code/notes", (c) =>
    c.json(vault.notesForCourse(c.req.param("code"))),
  );

  app.get("/api/notes/tree", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(vault.notesForCourse(course));
  });

  app.post("/api/notes", async (c) => {
    const body = await c.req.json<{ course?: string; title?: string; folder?: string }>();
    if (!body.course || !body.title) return c.json({ error: "course and title are required" }, 400);
    const folder = (body.folder ?? "notes").replace(/[^A-Za-z0-9._-]/g, "");
    const safeTitle = body.title.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "note";
    const path = `courses/${body.course}/${folder}/${safeTitle}.md`;
    const content = `---\ntitle: ${JSON.stringify(body.title)}\ncourse: ${body.course}\n---\n\n# ${body.title}\n\n`;
    const result = await vault.writeNote({ path, content, mode: "create" });
    return c.json(result, 201);
  });

  app.put("/api/notes", async (c) => {
    const body = await c.req.json<{ path?: string; content?: string }>();
    const path = body.path;
    const content = body.content;
    if (!path || !path.endsWith(".md") || content === undefined) {
      return c.json({ error: "path and content are required" }, 400);
    }
    const abs = resolveInside(config.vaultPath, path);
    let info;
    try {
      info = await stat(abs);
    } catch {
      return c.json({ error: "not found" }, 404);
    }
    const currentEtag = String(info.mtimeMs);
    const ifMatch = c.req.header("if-match");
    if (ifMatch !== undefined && ifMatch !== currentEtag) {
      return c.json({ error: "etag mismatch" }, 409);
    }
    const result = await vault.writeNote({ path, content, mode: "replace" });
    return c.json(result);
  });

  app.get("/api/index", (c) => c.json(vault.getIndex(c.req.query("course"))));

  app.get("/api/note", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(vault.readNote(path));
  });

  app.post("/api/note", async (c) => {
    const input = await c.req.json<{ path: string; content: string; requestId?: string }>();
    if (!input.path || !input.content) return c.json({ error: "path and content are required" }, 400);
    const result = await vault.writeNote({ path: input.path, content: input.content, mode: "replace", requestId: input.requestId });
    return c.json(result);
  });

  app.delete("/api/note", async (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    const result = await vault.deleteNote(path);
    return c.json(result);
  });

  app.patch("/api/course/:code", async (c) => {
    const code = c.req.param("code");
    const patch = await c.req.json<{ title?: string | null; department?: string | null; answerStyle?: string | null; examDate?: string | null; examBlueprint?: Record<string, unknown>[] | null }>();
    const result = await vault.updateCourse(code, {
      title: patch.title,
      department: patch.department,
      answerStyle: patch.answerStyle,
      examDate: patch.examDate,
      examBlueprint: patch.examBlueprint,
    });
    return c.json(result);
  });

  app.patch("/api/course/:code/answer-style", async (c) => {
    const code = c.req.param("code");
    const input = await c.req.json<{ content: string; requestId?: string }>();
    if (!input.content) return c.json({ error: "content is required" }, 400);
    const result = await vault.writeAnswerStyle(code, input.content, input.requestId);
    return c.json(result);
  });

  app.patch("/api/rubrics/:name", async (c) => {
    const name = c.req.param("name");
    const input = await c.req.json<{ content: string; requestId?: string }>();
    if (!input.content) return c.json({ error: "content is required" }, 400);
    const result = await vault.writeRubric(name, input.content, input.requestId);
    return c.json(result);
  });

  app.patch("/api/course/:code/mastery", async (c) => {
    const code = c.req.param("code");
    const input = await c.req.json<{ content: string; requestId?: string }>();
    if (!input.content) return c.json({ error: "content is required" }, 400);
    const result = await vault.writeMastery(code, input.content, input.requestId);
    return c.json(result);
  });

  app.get("/api/course/:code/history", async (c) => {
    const code = c.req.param("code");
    const file = c.req.query("file") ?? "course.md";
    return c.json(await vault.listHistory(`courses/${code}/${file}`));
  });

  app.post("/api/course/:code/restore", async (c) => {
    const code = c.req.param("code");
    const input = await c.req.json<{ file: string; stamp: string }>();
    if (!input.file || !input.stamp) return c.json({ error: "file and stamp are required" }, 400);
    const result = await vault.restoreVersion(`courses/${code}/${input.file}`, input.stamp);
    return c.json(result);
  });

  app.get("/api/search", (c) => {
    const query = c.req.query("q") ?? "";
    const limit = Number(c.req.query("limit") ?? 20);
    return c.json(vault.search(query, c.req.query("course"), limit));
  });

  app.get("/api/assets", async (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(await vault.listAssets(course));
  });

  app.get("/api/asset", async (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    const abs = resolveInside(config.vaultPath, path);
    const file = Bun.file(abs);
    if (!(await file.exists())) return c.json({ error: "not found" }, 404);
    return new Response(file, { headers: { "content-type": file.type } });
  });

  app.post("/api/asset", async (c) => {
    const input = await c.req.json<{ course: string; fileName: string; base64: string; contentType: string }>();
    if (!input.course || !input.fileName || !input.base64) return c.json({ error: "course, fileName and base64 are required" }, 400);
    const result = await vault.writeAsset(input.course, input.fileName, input.base64, input.contentType);
    return c.json(result);
  });

  app.get("/api/questions", async (c) => {
    const verified = c.req.query("verified");
    return c.json(
      await questions.list({
        course: c.req.query("course"),
        type: c.req.query("type"),
        topic: c.req.query("topic"),
        search: c.req.query("q"),
        verified: verified === undefined ? undefined : verified === "true",
        limit: Number(c.req.query("limit") ?? 200),
      }),
    );
  });

  app.get("/api/questions/:id", (c) => c.json(questions.get(c.req.param("id"))));

  app.patch("/api/questions/:id", async (c) => {
    const body = await c.req.json();
    return c.json(await questions.update(c.req.param("id"), body));
  });

  app.post("/api/questions/:id/verify", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const by = typeof body.by === "string" && body.by.trim() ? body.by.trim() : "ui";
    return c.json(questions.verify(c.req.param("id"), body.verified !== false, by));
  });

  app.post("/api/papers", async (c) => {
    const body = await c.req.json();
    return c.json(
      await papers.create({
        course: body.course,
        title: body.title,
        blueprint: body.blueprint,
        mode: body.mode,
        durationSec: body.duration_sec,
      }),
      201,
    );
  });

  app.get("/api/papers", (c) => c.json(papers.list(c.req.query("course"))));

  app.get("/api/papers/:id", (c) => c.json(papers.get(c.req.param("id"))));

  app.get("/api/attempts", (c) => c.json(runner.attempts(c.req.query("course") || undefined)));

  app.post("/api/attempts", async (c) => {
    const body = await c.req.json();
    return c.json(runner.start(body.paper_id), 201);
  });

  app.get("/api/attempts/:id", (c) => c.json(runner.get(c.req.param("id"))));

  app.post("/api/attempts/:id/answers", async (c) => {
    const body = await c.req.json();
    return c.json(
      runner.save(c.req.param("id"), {
        questionId: body.question_id,
        response: body.response,
        timeSpentSec: body.time_spent_sec,
        flagged: body.flagged,
      }),
    );
  });

  app.post("/api/attempts/:id/submit", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(runner.submit(c.req.param("id"), { auto: body.auto === true }));
  });

  app.get("/api/attempts/:id/results", (c) => c.json(runner.results(c.req.param("id"))));

  app.get("/api/grading", (c) =>
    c.json(
      grading.pending({
        course: c.req.query("course") || undefined,
        limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
      }),
    ),
  );

  app.get("/api/grading/:id/prompt", (c) =>
    c.json({ prompt: grading.prompt(Number(c.req.param("id"))) }),
  );

  app.post("/api/answers/:id/grade", async (c) => {
    const body = await c.req.json();
    const id = Number(c.req.param("id"));
    if (body.answer_id !== undefined && Number(body.answer_id) !== id) {
      throw new GradingError("answer_id in the payload does not match the URL");
    }
    return c.json(grading.grade({ ...body, answer_id: id }));
  });

  app.post("/api/attempts/:id/photo", async (c) => {
    const attemptId = c.req.param("id");
    const form = await c.req.formData();
    const questionId = String(form.get("question_id") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) throw new ExamError("photo upload needs a file");
    if (!/^[A-Za-z0-9._-]+$/.test(questionId)) throw new ExamError("invalid question id");
    if (file.size === 0) throw new ExamError("the photo is empty");
    if (file.size > 10 * 1024 * 1024) throw new ExamError("the photo must be 10 MB or smaller");
    const extension = PHOTO_TYPES.get(file.type);
    if (!extension) throw new ExamError("the photo must be JPEG, PNG or WebP");

    const session = runner.get(attemptId);
    if (session.attempt.status !== "in_progress") {
      throw new ExamError("attempt already submitted");
    }
    if (!session.paper.items.some((item) => item.question.id === questionId)) {
      throw new ExamError(`question ${questionId} is not in this paper`);
    }

    const name = `${attemptId}-${questionId}-${Date.now()}.${extension}`;
    await mkdir(config.uploadPath, { recursive: true });
    await writeFile(join(config.uploadPath, name), new Uint8Array(await file.arrayBuffer()));
    try {
      const current = session.answers.find((answer) => answer.questionId === questionId)?.response;
      const base =
        current && typeof current === "object" ? (current as Record<string, unknown>) : {};
      const text = form.get("text");
      const response = {
        ...base,
        photo: name,
        ...(typeof text === "string" && text.length > 0 ? { text } : {}),
      };
      const time = Number(form.get("time_spent_sec") ?? 0);
      return c.json(
        runner.save(attemptId, {
          questionId,
          response,
          timeSpentSec: Number.isFinite(time) ? time : 0,
        }),
      );
    } catch (err) {
      await unlink(join(config.uploadPath, name)).catch(() => {});
      throw err;
    }
  });

  app.get("/api/attempts/:id/photo/:questionId", async (c) => {
    const attemptId = c.req.param("id");
    const questionId = c.req.param("questionId");
    const file = c.req.query("file") ?? "";
    if (!new RegExp(`^${escapeRegExp(attemptId)}-${escapeRegExp(questionId)}-[0-9]+\\.(jpg|jpeg|png|webp)$`).test(file)) {
      throw new ExamError("invalid photo file");
    }
    const session = runner.get(attemptId);
    if (!session.paper.items.some((item) => item.question.id === questionId)) {
      throw new ExamError(`question ${questionId} is not in this paper`);
    }
    const path = resolveInside(config.uploadPath, file);
    const bytes = await readFile(path);
    return new Response(bytes, {
      headers: {
        "content-type": PHOTO_MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "private, no-store",
      },
    });
  });

  app.get("/api/dashboard", async (c) => c.json(await concepts.dashboard()));

  app.get("/api/goals", (c) => c.json(goals.list(c.req.query("course"))));
  app.get("/api/goals/:id", (c) => c.json(goals.get(c.req.param("id"))));
  app.get("/api/sessions/:id/pacing", (c) => c.json(goals.getPacing(c.req.param("id"))));
  app.get("/api/coverage", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(goals.getCoverage(course));
  });
  app.post("/api/goals", async (c) => {
    const body = await c.req.json();
    return c.json(await goals.create(body, body.request_id), 201);
  });
  app.patch("/api/goals/:id", async (c) => {
    const body = await c.req.json();
    return c.json(goals.update(c.req.param("id"), body, body.request_id));
  });
  app.post("/api/goals/:id/plan", async (c) => {
    const body = await c.req.json<{ items?: unknown[]; request_id?: string }>();
    return c.json(await goals.proposePlan(c.req.param("id"), body.items ?? [], body.request_id), 201);
  });
  app.post("/api/goals/:id/plan-changes", async (c) => {
    const body = await c.req.json();
    return c.json(goals.proposePlanChange(c.req.param("id"), body, body.request_id), 201);
  });
  app.get("/api/goals/:id/plan-changes", (c) => c.json(goals.listPlanChanges(c.req.param("id"))));
  app.get("/api/plan-changes/:id", (c) => c.json(goals.getPlanChange(c.req.param("id"))));
  app.post("/api/plan-changes/:id/apply", (c) => c.json(goals.applyPlanChange(c.req.param("id"))));
  app.patch("/api/plan-items/:id", async (c) => {
    const body = await c.req.json();
    return c.json(goals.updatePlanItem(c.req.param("id"), body, body.request_id));
  });
  app.post("/api/tasks", async (c) => {
    const body = await c.req.json();
    return c.json(await goals.addTask(body, body.request_id), 201);
  });
  app.patch("/api/tasks/:id", async (c) => {
    const body = await c.req.json();
    return c.json(goals.updateTask(c.req.param("id"), body, body.request_id));
  });
  app.get("/api/tasks", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    const status = c.req.query("status");
    return c.json(goals.listTasks(course, status === "open" || status === "done" || status === "dropped" ? status : undefined));
  });

  app.get("/api/concepts", (c) =>
    c.json(
      concepts.list(
        c.req.query("course"),
        c.req.query("status") === "proposed" || c.req.query("status") === "accepted" || c.req.query("status") === "rejected"
          ? (c.req.query("status") as "proposed" | "accepted" | "rejected")
          : undefined,
      ),
    ),
  );

  app.get("/api/concepts/:id", (c) => c.json(concepts.get(c.req.param("id"))));

  app.post("/api/concepts", async (c) => {
    const body = await c.req.json();
    return c.json(await concepts.add(body, body.request_id), 201);
  });

  app.patch("/api/concepts/:id", async (c) => {
    const body = await c.req.json();
    return c.json(await concepts.update(c.req.param("id"), body));
  });

  app.get("/api/mastery", (c) => c.json(concepts.snapshot(c.req.query("course"))));

  app.get("/api/mastery/tree", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(concepts.tree(course));
  });

  app.get("/api/mastery/next", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(concepts.next(course, Number(c.req.query("n") ?? 5)));
  });

  app.get("/api/mastery/due", (c) =>
    c.json(concepts.due(c.req.query("course"), Number(c.req.query("limit") ?? 20))),
  );

  app.get("/api/mastery/weak", (c) => {
    const course = c.req.query("course");
    if (!course) return c.json({ error: "course is required" }, 400);
    return c.json(concepts.weak(course, Number(c.req.query("limit") ?? 10)));
  });

  app.get("/api/graph", (c) => c.json(concepts.graph(c.req.query("course"), c.req.query("filter"))));

  app.get("/api/concepts/:id/sessions", (c) =>
    c.json(sessions.conceptSessions(c.req.param("id"))),
  );

  app.get("/api/sessions/:id/concepts", (c) => c.json(sessions.sessionConcepts(c.req.param("id"))));

  app.get("/api/sessions/active", (c) => c.json(sessions.focused()));

  app.get("/api/sessions/history", (c) => c.json(sessions.history(c.req.query("course"))));

  app.post("/api/sessions", async (c) => {
    const body = await c.req.json<{ course?: string; goal?: string; goal_id?: string | null; time_box_min?: number | null }>();
    try {
      return c.json(
        await sessions.start(String(body.course ?? ""), body.goal, null, "app", {
          goalId: body.goal_id,
          timeBoxMin: body.time_box_min,
        }),
        201,
      );
    } catch (err) {
      const e = err as { status?: number; sessionId?: string };
      if (e.status === 409) {
        return c.json({ error: "session_already_open", sessionId: e.sessionId }, 409);
      }
      throw err;
    }
  });

  app.get("/api/sessions/:id", (c) => c.json(sessions.detail(c.req.param("id"))));

  app.patch("/api/sessions/:id", async (c) => {
    const body = await c.req.json<{ title?: string | null }>();
    sessions.setSessionTitle(c.req.param("id"), typeof body.title === "string" ? body.title : null);
    return c.json(sessions.detail(c.req.param("id")));
  });

  app.post("/api/activities/:id/bank", async (c) => {
    const body = await c.req.json<{ tags?: string[] }>().catch(() => ({ tags: [] }));
    return c.json(await sessions.bankActivity(c.req.param("id"), body.tags ?? []), 201);
  });

  app.post("/api/sessions/:id/end", async (c) => {
    const body = await c.req.json<{ summary?: string }>().catch(() => ({ summary: "" }));
    return c.json(await sessions.end(c.req.param("id"), body.summary ?? ""));
  });

  app.post("/api/sessions/:id/reopen", async (c) => {
    return c.json(await sessions.reopen(c.req.param("id")));
  });

  app.post("/api/focus", async (c) => {
    const body = await c.req.json<{ sessionId?: string; tabId?: string | null }>();
    return c.json(await sessions.focus(String(body.sessionId ?? ""), body.tabId ?? null));
  });

  app.post("/api/sessions/:id/requests", async (c) => {
    const body = await c.req.json<{ text?: string; clientId?: string | null }>();
    return c.json(sessions.request(c.req.param("id"), String(body.text ?? ""), body.clientId ?? null), 201);
  });

  app.post("/api/sessions/:id/activities/:activityId/respond", async (c) => {
    const body = await c.req.json<{ response?: unknown; time_sec?: number }>();
    return c.json(
      sessions.respond(
        c.req.param("id"),
        c.req.param("activityId"),
        body.response,
        Number(body.time_sec ?? 0),
      ),
    );
  });

  app.post("/api/sessions/:id/activities/:activityId/render-error", async (c) => {
    const body = await c.req.json<{ message?: string }>();
    sessions.renderError(c.req.param("id"), c.req.param("activityId"), String(body.message ?? ""));
    return c.json({ ok: true });
  });

  app.get("/api/events", (c) => {
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            closed = true;
          }
        };
        const close = () => {
          if (closed) return;
          closed = true;
          if (timer) clearInterval(timer);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        };
        write(`data: ${JSON.stringify({ type: "hello", at: Date.now() })}\n\n`);
        unsubscribe = events.subscribe((event) => write(`data: ${JSON.stringify(event)}\n\n`));
        timer = setInterval(() => write(": ping\n\n"), 20000);
        c.req.raw.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        closed = true;
        if (timer) clearInterval(timer);
        unsubscribe();
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  });

  app.all("/mcp", (c) =>
    handleMcpRequest(c.req.raw, config, vault, questions, papers, runner, grading, sessions, concepts, goals),
  );

  app.get("/_design", async (c) => c.html(await Bun.file(paths.uiIndex).text()));

  app.use("/*", serveStatic({ root: paths.uiDist }));
  app.get("*", async (c) => {
    const path = c.req.path;
    if (
      path.startsWith("/api/") ||
      path.startsWith("/mcp") ||
      path.startsWith("/assets/") ||
      /\.\w+$/.test(path)
    ) {
      return c.json({ error: "not found" }, 404);
    }
    return c.html(await Bun.file(paths.uiIndex).text());
  });

  return { app, config, db, vault, indexer, questions, papers, runner, grading, sessions, concepts, goals };
}

function zodMessage(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}

const PHOTO_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const PHOTO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

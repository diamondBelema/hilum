import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, paths, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { handleMcpRequest } from "./mcp.ts";
import { QuestionBank, QuestionError } from "./questions/service.ts";
import { CitationError } from "./questions/citations.ts";
import { NoteIndexer } from "./vault/indexer.ts";
import { VaultService } from "./vault/service.ts";
import { resolveInside, VaultPathError } from "./vault/paths.ts";
import { ZodError } from "zod";

export type AppDeps = {
  config?: Partial<Config>;
};

export function createApp(deps: AppDeps = {}) {
  const config = loadConfig(deps.config);
  const db = openDb(config.dbPath);
  const indexer = new NoteIndexer(db, config.vaultPath);
  const vault = new VaultService(db, config.vaultPath, indexer);
  const questions = new QuestionBank(db, vault);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof VaultPathError || err instanceof QuestionError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof CitationError) return c.json({ error: err.message }, 422);
    if (err instanceof ZodError) return c.json({ error: zodMessage(err) }, 400);
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return c.json({ error: "not found" }, 404);
    console.error(err);
    return c.json({ error: "internal server error" }, 500);
  });

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      version: config.version,
      mcp: "/mcp",
      vault: config.vaultPath,
      db: config.dbPath,
      stats: vault.stats(),
    }),
  );

  app.get("/api/meta", (c) => {
    const rows = db.query("SELECT key, value FROM meta ORDER BY key").all();
    return c.json({ meta: rows });
  });

  app.get("/api/courses", async (c) => c.json(await vault.listCourses()));

  app.get("/api/courses/:code/notes", (c) =>
    c.json(vault.notesForCourse(c.req.param("code"))),
  );

  app.get("/api/index", (c) => c.json(vault.getIndex(c.req.query("course"))));

  app.get("/api/note", (c) => {
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path is required" }, 400);
    return c.json(vault.readNote(path));
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
    return c.json(questions.verify(c.req.param("id"), body.verified !== false));
  });

  app.all("/mcp", (c) => handleMcpRequest(c.req.raw, config, vault, questions));

  app.get("/_design", async (c) => c.html(await Bun.file(paths.uiIndex).text()));

  app.use("/*", serveStatic({ root: paths.uiDist }));
  app.get("*", serveStatic({ path: paths.uiIndex }));

  return { app, config, db, vault, indexer, questions };
}

function zodMessage(err: ZodError): string {
  return err.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
}

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, paths, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { handleMcpRequest } from "./mcp.ts";
import { NoteIndexer } from "./vault/indexer.ts";
import { VaultService } from "./vault/service.ts";
import { resolveInside, VaultPathError } from "./vault/paths.ts";

export type AppDeps = {
  config?: Partial<Config>;
};

export function createApp(deps: AppDeps = {}) {
  const config = loadConfig(deps.config);
  const db = openDb(config.dbPath);
  const indexer = new NoteIndexer(db, config.vaultPath);
  const vault = new VaultService(db, config.vaultPath, indexer);
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof VaultPathError) return c.json({ error: err.message }, 400);
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

  app.all("/mcp", (c) => handleMcpRequest(c.req.raw, config, vault));

  app.get("/_design", async (c) => c.html(await Bun.file(paths.uiIndex).text()));

  app.use("/*", serveStatic({ root: paths.uiDist }));
  app.get("*", serveStatic({ path: paths.uiIndex }));

  return { app, config, db, vault, indexer };
}

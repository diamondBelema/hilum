import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, paths, type Config } from "./config.ts";
import { openDb } from "./db.ts";
import { handleMcpRequest } from "./mcp.ts";

export type AppDeps = {
  config?: Partial<Config>;
};

export function createApp(deps: AppDeps = {}) {
  const config = loadConfig(deps.config);
  const db = openDb(config.dbPath);
  const app = new Hono();

  app.get("/api/health", (c) =>
    c.json({
      status: "ok",
      version: config.version,
      mcp: "/mcp",
      vault: config.vaultPath,
      db: config.dbPath,
    }),
  );

  app.get("/api/meta", (c) => {
    const rows = db.query("SELECT key, value FROM meta ORDER BY key").all();
    return c.json({ meta: rows });
  });

  app.all("/mcp", (c) => handleMcpRequest(c.req.raw, config));

  app.use("/*", serveStatic({ root: paths.uiDist }));
  app.get("*", serveStatic({ path: paths.uiIndex }));

  return { app, config, db };
}

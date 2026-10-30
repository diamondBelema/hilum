import { mkdirSync } from "node:fs";
import { createApp } from "./app.ts";

const { app, config, indexer } = createApp();
mkdirSync(config.vaultPath, { recursive: true });
const stats = await indexer.reindexAll();
indexer.startWatching((err) => console.error("vault watcher:", err));

const server = Bun.serve({
  port: config.port,
  hostname: config.lan ? "0.0.0.0" : config.hostname,
  fetch: app.fetch,
  idleTimeout: 60,
});

console.log(
  `exam-harness ${config.version} listening on http://${server.hostname}:${server.port}`,
);
console.log(`  vault: ${config.vaultPath}`);
console.log(`  index: ${stats.notes} notes, ${stats.courses} courses, ${stats.tokens} tokens`);
console.log(`  mcp:   http://${server.hostname}:${server.port}/mcp`);

function shutdown() {
  indexer.close();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

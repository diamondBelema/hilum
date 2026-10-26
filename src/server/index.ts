import { createApp } from "./app.ts";

const { app, config } = createApp();

const server = Bun.serve({
  port: config.port,
  hostname: config.hostname,
  fetch: app.fetch,
  idleTimeout: 60,
});

console.log(
  `exam-harness ${config.version} listening on http://${server.hostname}:${server.port}`,
);
console.log(`  vault: ${config.vaultPath}`);
console.log(`  mcp:   http://${server.hostname}:${server.port}/mcp`);

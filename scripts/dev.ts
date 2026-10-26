const server = Bun.spawn([process.execPath, "run", "src/server/index.ts"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, HARNESS_SKIP_BUILD: "1", PORT: process.env.PORT ?? "4317" },
});

const vite = Bun.spawn([process.execPath, "x", "vite", "--port", "5173"], {
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env },
});

function shutdown() {
  server.kill();
  vite.kill();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await Promise.race([server.exited, vite.exited]);
shutdown();
export {};

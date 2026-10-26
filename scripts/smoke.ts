import { existsSync } from "node:fs";
import { paths } from "../src/server/config.ts";

const port = 45000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;

if (!existsSync(paths.uiIndex)) {
  const { build } = await import("vite");
  await build({ logLevel: "warn" });
}

const server = Bun.spawn([process.execPath, "run", "src/server/index.ts"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(port), HARNESS_SKIP_BUILD: "1" },
});

let stderr = "";
server.stderr?.pipeTo(
  new WritableStream({ write: (chunk) => void (stderr += new TextDecoder().decode(chunk)) }),
);

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`server did not become healthy\n${stderr}`);
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

try {
  await waitForHealth();

  const health = (await (await fetch(`${base}/api/health`)).json()) as { status: string };
  check(health.status === "ok", "health endpoint not ok");

  const page = await (await fetch(base)).text();
  check(page.includes('id="root"'), "UI shell not served at /");

  const init = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0" },
      },
    }),
  });

  const text = await init.text();
  check(init.ok, `MCP initialize failed: ${init.status} ${text}`);
  check(text.includes("exam-harness"), `unexpected MCP response: ${text.slice(0, 300)}`);

  console.log("smoke ok: ui, api, mcp");
} finally {
  server.kill();
}

import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/server/config.ts";
import { EventBus } from "../src/server/events.ts";
import { LauncherService } from "../src/server/launcher/service.ts";

describe("agent launcher", () => {
  test("only accepts configuration from loopback and stores argv", async () => {
    const root = await mkdtemp(join(tmpdir(), "hilum-launcher-"));
    const config = loadConfig({ dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") });
    const launcher = new LauncherService(config, new EventBus());
    await expect(
      launcher.saveConfig({ argv: ["echo", "{prompt}"] }, "https://192.168.1.4"),
    ).rejects.toThrow("loopback");
    const status = await launcher.saveConfig({ argv: ["echo", "{prompt}"] }, "http://127.0.0.1:4747");
    expect(status.state).toBe("idle");
    expect(JSON.parse(await readFile(join(root, "state", "agent.json"), "utf8")).argv).toEqual(["echo", "{prompt}"]);
  });
});

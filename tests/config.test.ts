import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/server/config.ts";

describe("config", () => {
  test("defaults to the ken vault and a local port", () => {
    const config = loadConfig({ vaultPath: "/tmp/vault" });
    expect(config.port).toBe(4317);
    expect(config.hostname).toBe("127.0.0.1");
    expect(config.vaultPath).toBe("/tmp/vault");
    expect(config.lan).toBe(false);
  });

  test("accepts overrides", () => {
    const config = loadConfig({ port: 5000, lan: true, mcpToken: "t" });
    expect(config.port).toBe(5000);
    expect(config.lan).toBe(true);
    expect(config.mcpToken).toBe("t");
  });
});

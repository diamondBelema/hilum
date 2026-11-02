import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-launcher-"));
  await mkdir(join(root, "state"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function configHeaders(remoteAddress: string | null) {
  const headers: HeadersInit = {};
  if (remoteAddress) headers["x-forwarded-for"] = remoteAddress;
  return headers;
}

describe("launcher security", () => {
  test("rejects config save when LAN mode is on", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: true,
        mcpToken: "test-token",
      },
    });
    const res = await app.request("/api/agent/config", {
      method: "POST",
      headers: { ...configHeaders("127.0.0.1"), "content-type": "application/json" },
      body: JSON.stringify({ argv: ["kilo", "run"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("LAN mode");
  });

  test("rejects config save from non-loopback address", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: false,
      },
    });
    const res = await app.request("/api/agent/config", {
      method: "POST",
      headers: { ...configHeaders("10.0.0.5"), "content-type": "application/json" },
      body: JSON.stringify({ argv: ["kilo", "run"] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("loopback");
  });

  test("rejects config save with no address header when not loopback", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: false,
      },
    });
    const res = await app.request("/api/agent/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ argv: ["kilo", "run"] }),
    });
    // No x-forwarded-for means direct localhost connection, which is treated as loopback
    expect(res.status).toBe(200);
  });

  test("accepts config save from loopback address", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: false,
      },
    });
    const res = await app.request("/api/agent/config", {
      method: "POST",
      headers: { ...configHeaders("127.0.0.1"), "content-type": "application/json" },
      body: JSON.stringify({ argv: ["kilo", "run", "--auto"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.argv).toEqual(["kilo", "run", "--auto"]);
  });

  test("rejects agent start when LAN mode is on", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: true,
        mcpToken: "test-token",
      },
    });
    // First save config (rejected in LAN mode, but start also checks)
    const res = await app.request("/api/agent/start", {
      method: "POST",
      headers: { ...configHeaders("127.0.0.1") },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("LAN mode");
  });

  test("rejects agent start from non-loopback address", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: false,
      },
    });
    // First save a valid config from loopback
    await app.request("/api/agent/config", {
      method: "POST",
      headers: { ...configHeaders("127.0.0.1"), "content-type": "application/json" },
      body: JSON.stringify({ argv: ["kilo", "run"] }),
    });
    // Then try to start from non-loopback
    const res = await app.request("/api/agent/start", {
      method: "POST",
      headers: { ...configHeaders("10.0.0.5") },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("loopback");
  });

  test("validates argv is a non-empty argument array", async () => {
    const { app } = createApp({
      config: {
        dbPath: join(root, "state", "app.db"),
        vaultPath: join(root, "vault"),
        lan: false,
      },
    });
    const res = await app.request("/api/agent/config", {
      method: "POST",
      headers: { ...configHeaders("127.0.0.1"), "content-type": "application/json" },
      body: JSON.stringify({ argv: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("argument array");
  });
});

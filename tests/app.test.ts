import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app.ts";

describe("http api", () => {
  test("health reports ok, version, mcp and vault", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:", vaultPath: "/tmp/vault" } });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(body.status).toBe("ok");
    expect(body.mcp).toBe("/mcp");
    expect(body.vault).toBe("/tmp/vault");
  });

  test("meta exposes the schema version", async () => {
    const { app } = createApp({ config: { dbPath: ":memory:" } });
    const res = await app.request("/api/meta");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { key: string; value: string }[] };
    expect(body.meta).toEqual([{ key: "schema_version", value: "2" }]);
  });
});

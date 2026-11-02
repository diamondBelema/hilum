import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app.ts";

describe("research jobs", () => {
  test("queues deduplicated research and enforces the daily cap", async () => {
    const { app, db } = createApp({ config: { dbPath: ":memory:" } });
    const first = await app.request("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "renal physiology", reason: "fill a gap" }),
    });
    expect(first.status).toBe(201);
    const duplicate = await app.request("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "Renal Physiology" }),
    });
    expect(duplicate.status).toBe(201);
    expect((await duplicate.json()).id).toBe((await first.clone().json()).id);
    for (let index = 0; index < 4; index += 1) {
      await app.request("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: `topic ${index}` }),
      });
    }
    const capped = await app.request("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "topic five" }),
    });
    expect(capped.status).toBe(429);
    expect((db.query("SELECT COUNT(*) AS count FROM jobs WHERE type='research'").get() as { count: number }).count).toBe(5);
  });
});

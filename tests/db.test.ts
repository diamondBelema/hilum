import { describe, expect, test } from "bun:test";
import { openDb } from "../src/server/db.ts";

describe("db", () => {
  test("creates the meta table and stores the schema version", () => {
    const db = openDb(":memory:");
    const row = db.query("SELECT value FROM meta WHERE key = ?").get("schema_version") as {
      value: string;
    };
    expect(row.value).toBe("11");
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((table) => table.name);
    expect(names).toContain("sessions");
    expect(names).toContain("activities");
    expect(names).toContain("agent_requests");
    expect(names).toContain("concepts");
    expect(names).toContain("edges");
    expect(names).toContain("mastery");
    expect(names).toContain("goals");
    expect(names).toContain("plan_items");
    expect(names).toContain("tasks");
    expect(names).toContain("plan_changes");
    db.close();
  });
});

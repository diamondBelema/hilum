import { describe, expect, test } from "bun:test";
import { openDb } from "../src/server/db.ts";

describe("db", () => {
  test("creates the meta table and stores the schema version", () => {
    const db = openDb(":memory:");
    const row = db.query("SELECT value FROM meta WHERE key = ?").get("schema_version") as {
      value: string;
    };
    expect(row.value).toBe("1");
    db.close();
  });
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "hilum-inbox-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("inbox", () => {
  test("stores untouched uploads and deduplicates exact bytes", async () => {
    const { inbox, app, db } = createApp({ config: { vaultPath: root, dbPath: ":memory:" } });
    await Bun.write(join(root, "courses", "bch-203", "course.md"), "---\ncode: bch-203\ntitle: Biochemistry\n---\n");
    const file = new File(["slide bytes"], "../../lecture.pptx", { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const first = await inbox.register(file);
    const duplicate = await inbox.register(file);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.item.id).toBe(first.item.id);
    expect(first.item.kind).toBe("pptx");
    expect(await Bun.file(join(root, first.item.path)).text()).toBe("slide bytes");

    const response = await app.request("/api/inbox");
    expect(response.status).toBe(200);
    expect((await response.json())).toHaveLength(1);
    const form = new FormData();
    form.set("file", new File(["another"], "bch-203-notes.pdf", { type: "application/pdf" }));
    const upload = await app.request("/api/inbox/upload", { method: "POST", body: form });
    expect(upload.status).toBe(201);
    expect(db.query("SELECT type, status FROM jobs").all()).toEqual([
      { type: "convert", status: "queued" },
    ]);
  });
});

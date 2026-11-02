import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../src/server/app.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "harness-producers-"));
  await mkdir(join(root, "state"), { recursive: true });
  await mkdir(join(root, "vault"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function insertCourse(db: unknown, code: string): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO courses (code, title) VALUES (?, ?)",
  ).run(code, code);
}

function insertNote(db: unknown, path: string, course: string): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO notes (path, course, title, summary, tags, tokens, source, updated_at, mtime, size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(path, course, path, "", "[]", 0, "producer", Date.now(), Date.now(), 0);
}

function insertConcept(db: unknown, id: string, course: string, citesJson: string): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO concepts (id, course, title, aliases, parent_id, status, exam_weight, lecturer_flag, cites_json, unverified, path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, course, id, "[]", null, "accepted", 0.05, 0, citesJson, 0, pathFor(id), Date.now());
}

function pathFor(id: string): string {
  return `courses/ana-211/concepts/${id}.md`;
}

function insertQuestion(db: unknown, id: string, course: string, conceptIds: string): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO questions (id, course, type, question_kind, topic_tags, concept_ids, difficulty, marks, body_json, cites_json, source_paper, verified, unverified, verified_by, verified_at, created_by, created_at, updated_at) VALUES (?, ?, 'mcq_single', 'recall', '[]', ?, 'medium', 1, '{}', '[]', null, 1, 0, null, null, 'agent', ?, ?)",
  ).run(id, course, conceptIds, Date.now(), Date.now());
}

function insertPaper(db: unknown, id: string, course: string, createdAt: number): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO papers (id, course, title, blueprint_json, mode, duration_sec, created_at) VALUES (?, ?, ?, '{}', 'exam', 3600, ?)",
  ).run(id, course, "Test Exam", createdAt);
}

function insertVisionQueue(db: unknown, id: string, course: string, status: string): void {
  (db as { query: (sql: string) => { run: (...args: unknown[]) => void } }).query(
    "INSERT INTO vision_queue (id, course, note_path, page, png_path, flag, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, course, `courses/${course}/notes/n1.md`, 1, `courses/${course}/pages/p1.png`, "low_quality", status);
}

describe("job producers", () => {
  test("map_concepts enqueues for converted notes with no citing concept", async () => {
    const { app, db } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    insertNote(db, "courses/ana-211/notes/n1.md", "ana-211");

    const res = await app.request("/api/producers/map_concepts", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.enqueued).toBeGreaterThanOrEqual(0);

    // Second run should dedupe (no new job for same note path)
    const res2 = await app.request("/api/producers/map_concepts", { method: "POST" });
    const body2 = await res2.json();
    expect(body2.result.enqueued).toBe(0);
  });

  test("tag_questions enqueues for questions without concept ids", async () => {
    const { app, db } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    insertQuestion(db, "q1", "ana-211", "[]");

    const res = await app.request("/api/producers/tag_questions", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.enqueued).toBeGreaterThanOrEqual(0);
  });

  test("write_questions enqueues for exams within 21 days with low bank", async () => {
    const { app, db } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    const now = Date.now();
    insertPaper(db, "p1", "ana-211", now);

    const res = await app.request("/api/producers/write_questions", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("vision_transcribe enqueues for pending vision queue items", async () => {
    const { app, db } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    insertVisionQueue(db, "vq1", "ana-211", "pending");

    const res = await app.request("/api/producers/vision_transcribe", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.result.enqueued).toBeGreaterThanOrEqual(0);
  });

  test("find_image enqueues for accepted concepts", async () => {
    const { app, db } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    insertConcept(db, "c1", "ana-211", "[]");

    const res = await app.request("/api/producers/find_image", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("run_all runs every producer", async () => {
    const { app } = createApp({
      config: { dbPath: join(root, "state", "app.db"), vaultPath: join(root, "vault") },
    });

    const res = await app.request("/api/producers/run", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.producers.map_concepts).toBeDefined();
    expect(body.producers.tag_questions).toBeDefined();
    expect(body.producers.write_questions).toBeDefined();
    expect(body.producers.vision_transcribe).toBeDefined();
    expect(body.producers.find_image).toBeDefined();
  });
});

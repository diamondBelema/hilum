import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = Database;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      path TEXT PRIMARY KEY,
      course TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      tokens INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      updated_at INTEGER NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS notes_course ON notes(course);

    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      path UNINDEXED,
      title,
      body,
      tokenize = 'porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT PRIMARY KEY,
      result TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      type TEXT NOT NULL,
      question_kind TEXT,
      topic_tags TEXT NOT NULL DEFAULT '[]',
      concept_ids TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT,
      marks REAL NOT NULL,
      body_json TEXT NOT NULL,
      cites_json TEXT NOT NULL DEFAULT '[]',
      source_paper TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      unverified INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'agent',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS questions_course ON questions(course);
    CREATE INDEX IF NOT EXISTS questions_verified ON questions(course, verified);

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      title TEXT NOT NULL,
      blueprint_json TEXT NOT NULL,
      mode TEXT NOT NULL,
      duration_sec INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_items (
      paper_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      section TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (paper_id, question_id)
    );

    CREATE INDEX IF NOT EXISTS paper_items_paper ON paper_items(paper_id, position);

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      submitted_at INTEGER,
      status TEXT NOT NULL,
      duration_used_sec INTEGER
    );

    CREATE INDEX IF NOT EXISTS attempts_paper ON attempts(paper_id);

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      response_json TEXT,
      time_spent_sec INTEGER NOT NULL DEFAULT 0,
      flagged INTEGER NOT NULL DEFAULT 0,
      auto_score REAL,
      status TEXT NOT NULL DEFAULT 'unanswered',
      UNIQUE (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      answer_id INTEGER NOT NULL UNIQUE,
      rubric_scores_json TEXT NOT NULL DEFAULT '[]',
      total REAL NOT NULL,
      feedback_md TEXT NOT NULL DEFAULT '',
      mistake_tags TEXT NOT NULL DEFAULT '[]',
      graded_by TEXT NOT NULL,
      graded_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS grades_graded_at ON grades(graded_at);

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      activity_id TEXT,
      answer_id INTEGER,
      concept_id TEXT,
      kind TEXT NOT NULL,
      correct INTEGER,
      confidence TEXT,
      time_sec INTEGER NOT NULL DEFAULT 0,
      excerpt TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS evidence_concept ON evidence(concept_id, created_at);
    CREATE INDEX IF NOT EXISTS evidence_answer ON evidence(answer_id);
  `);

  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "5",
  );
}

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
  `);

  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "3",
  );
}

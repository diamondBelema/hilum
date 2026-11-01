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
      verified_by TEXT,
      verified_at INTEGER,
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
    CREATE INDEX IF NOT EXISTS evidence_session ON evidence(session_id, created_at);

    CREATE TABLE IF NOT EXISTS real_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      concept_id TEXT NOT NULL,
      course TEXT NOT NULL,
      kind TEXT NOT NULL,
      correct INTEGER,
      confidence TEXT,
      excerpt TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS real_results_concept ON real_results(concept_id, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      goal TEXT NOT NULL DEFAULT 'learn',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      note_path TEXT,
      agent_seen_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      title TEXT NOT NULL,
      deadline TEXT,
      study_min_per_day INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS plan_items (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      concept_id TEXT,
      note_path TEXT,
      note_anchor TEXT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'learn',
      partial INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL,
      est_min_low INTEGER NOT NULL,
      est_min_high INTEGER NOT NULL,
      actual_sec INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'todo',
      plan_state TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS plan_items_goal ON plan_items(goal_id, position);

    CREATE TABLE IF NOT EXISTS plan_changes (
      id TEXT PRIMARY KEY,
      goal_id TEXT NOT NULL,
      diff_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at INTEGER NOT NULL,
      applied_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      goal_id TEXT,
      plan_item_id TEXT,
      title TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'custom',
      target_json TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      source TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      done_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS tasks_open ON tasks(course, status, due_date);

    CREATE TABLE IF NOT EXISTS session_plan_nudges (
      session_id TEXT NOT NULL,
      plan_item_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (session_id, plan_item_id, kind)
    );

    CREATE INDEX IF NOT EXISTS sessions_course ON sessions(course, started_at);

    CREATE TABLE IF NOT EXISTS session_focus (
      id TEXT PRIMARY KEY DEFAULT 'focused',
      session_id TEXT NOT NULL,
      tab_id TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      course TEXT NOT NULL,
      spec_json TEXT NOT NULL,
      cites_json TEXT NOT NULL DEFAULT '[]',
      concept_ids TEXT NOT NULL DEFAULT '[]',
      response_json TEXT,
      render_error TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      banked INTEGER NOT NULL DEFAULT 0,
      banked_path TEXT,
      response_seen INTEGER NOT NULL DEFAULT 0,
      render_seen INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      answered_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS activities_session ON activities(session_id, created_at);
    CREATE INDEX IF NOT EXISTS activities_pending ON activities(session_id, status);

    CREATE TABLE IF NOT EXISTS agent_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      client_id TEXT,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS agent_requests_session ON agent_requests(session_id, status);

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'say',
      text TEXT NOT NULL,
      cites_json TEXT NOT NULL DEFAULT '[]',
      unverified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS agent_messages_session ON agent_messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      course TEXT NOT NULL,
      title TEXT NOT NULL,
      aliases TEXT NOT NULL DEFAULT '[]',
      parent_id TEXT,
      status TEXT NOT NULL DEFAULT 'proposed',
      exam_weight REAL NOT NULL DEFAULT 0.05,
      lecturer_flag INTEGER NOT NULL DEFAULT 0,
      cites_json TEXT NOT NULL DEFAULT '[]',
      unverified INTEGER NOT NULL DEFAULT 0,
      path TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS concepts_course ON concepts(course, parent_id);

    CREATE TABLE IF NOT EXISTS edges (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id, type)
    );

    CREATE INDEX IF NOT EXISTS edges_to ON edges(to_id, type);

    CREATE TABLE IF NOT EXISTS mastery (
      concept_id TEXT PRIMARY KEY,
      state TEXT NOT NULL DEFAULT 'unseen',
      score REAL NOT NULL DEFAULT 0,
      last_evidence_at INTEGER,
      decay_due_at INTEGER,
      evidence_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  const activityColumns = db.query("PRAGMA table_info(activities)").all() as { name: string }[];
  if (!activityColumns.some((column) => column.name === "render_seen")) {
    db.exec("ALTER TABLE activities ADD COLUMN render_seen INTEGER NOT NULL DEFAULT 0");
  }
  if (!activityColumns.some((column) => column.name === "plan_item_id")) {
    db.exec("ALTER TABLE activities ADD COLUMN plan_item_id TEXT");
  }

  const questionColumns = db.query("PRAGMA table_info(questions)").all() as { name: string }[];
  if (!questionColumns.some((column) => column.name === "verified_by")) {
    db.exec("ALTER TABLE questions ADD COLUMN verified_by TEXT");
  }
  if (!questionColumns.some((column) => column.name === "verified_at")) {
    db.exec("ALTER TABLE questions ADD COLUMN verified_at INTEGER");
  }

  const messageColumns = db.query("PRAGMA table_info(agent_messages)").all() as { name: string }[];
  if (!messageColumns.some((column) => column.name === "cites_json")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN cites_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!messageColumns.some((column) => column.name === "unverified")) {
    db.exec("ALTER TABLE agent_messages ADD COLUMN unverified INTEGER NOT NULL DEFAULT 0");
  }

  const focusColumns = db.query("PRAGMA table_info(session_focus)").all() as { name: string }[];
  if (!focusColumns.some((column) => column.name === "tab_id")) {
    db.exec("ALTER TABLE session_focus ADD COLUMN tab_id TEXT");
  }

  const sessionColumns = db.query("PRAGMA table_info(sessions)").all() as { name: string }[];
  if (!sessionColumns.some((column) => column.name === "title")) {
    db.exec("ALTER TABLE sessions ADD COLUMN title TEXT");
  }
  if (!sessionColumns.some((column) => column.name === "goal_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN goal_id TEXT");
  }
  if (!sessionColumns.some((column) => column.name === "time_box_min")) {
    db.exec("ALTER TABLE sessions ADD COLUMN time_box_min INTEGER");
  }
  if (!sessionColumns.some((column) => column.name === "active_plan_item_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN active_plan_item_id TEXT");
  }

  const requestColumns = db.query("PRAGMA table_info(agent_requests)").all() as { name: string }[];
  if (!requestColumns.some((column) => column.name === "client_id")) {
    db.exec("ALTER TABLE agent_requests ADD COLUMN client_id TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_presence (
      id TEXT PRIMARY KEY DEFAULT 'presence',
      client_name TEXT,
      last_seen_at INTEGER,
      listening_until INTEGER
    );
  `);

  db.query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run(
    "schema_version",
    "11",
  );
}

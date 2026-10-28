import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import type { Db } from "../db.ts";
import { parseNote, stringList, stringValue } from "./frontmatter.ts";
import { normalizeRel, resolveInside, VaultPathError } from "./paths.ts";
import type { NoteIndexer } from "./indexer.ts";

export type CourseSummary = {
  code: string;
  title: string;
  department: string | null;
  answerStyle: string | null;
  examDate: string | null;
  notes: number;
  tokens: number;
};

export type NoteSearchHit = {
  path: string;
  course: string | null;
  title: string;
  summary: string;
  snippet: string;
};

export type CoursePatch = {
  title?: string | null;
  department?: string | null;
  answerStyle?: string | null;
  examDate?: string | null;
  examBlueprint?: Record<string, unknown>[] | null;
};

export class VaultService {
  constructor(
    private readonly db: Db,
    readonly root: string,
    private readonly indexer?: NoteIndexer,
  ) {
    for (const dir of ["courses", "rubrics", "inbox"]) {
      mkdirSync(join(this.root, dir), { recursive: true });
    }
  }

  async listCourses(): Promise<CourseSummary[]> {
    let entries;
    try {
      entries = await readdir(join(this.root, "courses"), { withFileTypes: true });
    } catch {
      return [];
    }

    const courses: CourseSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const code = entry.name;
      const meta = this.readCourseMeta(code);
      const counts = this.db
        .query(
          "SELECT COUNT(*) AS notes, COALESCE(SUM(tokens),0) AS tokens FROM notes WHERE course = ?",
        )
        .get(code) as { notes: number; tokens: number };
      courses.push({
        code,
        title: meta.title ?? code,
        department: meta.department,
        answerStyle: meta.answerStyle,
        examDate: meta.examDate,
        notes: counts.notes,
        tokens: counts.tokens,
      });
    }
    return courses.sort((a, b) => a.code.localeCompare(b.code));
  }

  getIndex(course?: string | null): { path: string; content: string; generated: boolean } {
    const rel = course ? `courses/${course}/INDEX.md` : "INDEX.md";
    const abs = join(this.root, rel);
    if (existsSync(abs)) {
      return { path: rel, content: readFileSync(abs, "utf8"), generated: false };
    }
    return { path: rel, content: this.generateIndex(course), generated: true };
  }

  readNote(path: string): {
    path: string;
    title: string;
    summary: string;
    tags: string[];
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const rel = normalizeRel(path);
    requireMarkdown(rel);
    const abs = resolveInside(this.root, rel);
    const raw = readFileSync(abs, "utf8");
    const parsed = parseNote(raw);
    return {
      path: rel,
      title: stringValue(parsed.frontmatter.title) ?? path,
      summary: stringValue(parsed.frontmatter.summary) ?? "",
      tags: stringList(parsed.frontmatter.topics ?? parsed.frontmatter.tags),
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    };
  }

  async writeNote(input: {
    path: string;
    content: string;
    mode: "create" | "append" | "replace";
    requestId?: string;
  }): Promise<{ path: string; bytes: number; mode: string }> {
    requireMarkdown(input.path);
    const rel = normalizeRel(input.path);
    const abs = resolveInside(this.root, rel);

    const cached = this.cachedWrite(input.requestId);
    if (cached) return cached;

    if (input.mode !== "append") parseNote(input.content);

    let content = input.content;
    if (input.mode === "create") {
      if (existsSync(abs)) throw new VaultPathError(`note already exists: ${rel}`);
    } else if (input.mode === "append") {
      if (existsSync(abs)) {
        const existing = readFileSync(abs, "utf8");
        content = `${existing.replace(/\s*$/, "")}\n\n${input.content}`;
      }
    } else if (!existsSync(abs)) {
      throw new VaultPathError(`note does not exist: ${rel}`);
    }

    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    await this.indexer?.indexFile(abs);

    const result = { path: rel, bytes: Buffer.byteLength(content), mode: input.mode };
    this.rememberWrite(input.requestId, result);
    return result;
  }

  readNoteRaw(path: string): string {
    const rel = normalizeRel(path);
    requireMarkdown(rel);
    return readFileSync(resolveInside(this.root, rel), "utf8");
  }

  allNotes(): { path: string; title: string; summary: string }[] {
    return this.db
      .query("SELECT path, title, summary FROM notes ORDER BY path")
      .all() as { path: string; title: string; summary: string }[];
  }

  async updateCourse(
    code: string,
    patch: CoursePatch,
    requestId?: string,
  ): Promise<CourseSummary> {
    if (!/^[A-Za-z0-9._-]+$/.test(code)) throw new VaultPathError(`invalid course code: ${code}`);
    const dir = join(this.root, "courses", code);
    if (!existsSync(dir)) throw new VaultPathError(`course does not exist: ${code}`);

    if (requestId) {
      const row = this.db
        .query("SELECT result FROM idempotency WHERE key = ?")
        .get(`update_course:${requestId}`) as { result: string } | null;
      if (row) return JSON.parse(row.result) as CourseSummary;
    }

    const rel = `courses/${code}/course.md`;
    const abs = resolveInside(this.root, rel);
    let frontmatter: Record<string, unknown> = {};
    let body = "";
    if (existsSync(abs)) {
      const parsed = parseNote(readFileSync(abs, "utf8"));
      frontmatter = { ...parsed.frontmatter };
      body = parsed.body;
    }

    const set = (key: string, value: string | null | undefined) => {
      if (value === undefined) return;
      const clean = typeof value === "string" ? value.trim() : value;
      if (clean === null || clean === "") delete frontmatter[key];
      else frontmatter[key] = clean;
    };

    frontmatter.code = code;
    set("title", patch.title);
    set("department", patch.department);
    set("answer_style", patch.answerStyle);
    set("exam_date", patch.examDate);
    if (patch.examBlueprint !== undefined) {
      if (patch.examBlueprint === null || patch.examBlueprint.length === 0) {
        delete frontmatter.exam_blueprint;
      } else {
        frontmatter.exam_blueprint = patch.examBlueprint;
      }
    }

    const content = `---\n${stringifyYaml(frontmatter, { lineWidth: 0 })}---\n${body.replace(/^\n/, "")}`;
    const previous = existsSync(abs) ? readFileSync(abs, "utf8") : "";
    const histDir = this.historyDir(rel);
    await mkdir(histDir, { recursive: true });
    await writeFile(join(histDir, `${Date.now()}.md`), previous);
    await this.pruneHistory(rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    await this.indexer?.indexFile(abs);

    const summary = (await this.listCourses()).find((course) => course.code === code);
    if (!summary) throw new VaultPathError(`course does not exist: ${code}`);
    if (requestId) {
      this.db
        .query("INSERT OR REPLACE INTO idempotency (key, result, created_at) VALUES (?, ?, ?)")
        .run(`update_course:${requestId}`, JSON.stringify(summary), Date.now());
    }
    return summary;
  }

  async listAssets(course: string): Promise<{ path: string; bytes: number }[]> {
    const dir = join(this.root, "courses", course, "assets");
    const files = await walkFiles(dir);
    const assets = [];
    for (const abs of files) {
      const info = await stat(abs);
      assets.push({ path: relative(this.root, abs).split("\\").join("/"), bytes: info.size });
    }
    return assets.sort((a, b) => a.path.localeCompare(b.path));
  }

  async writeAsset(course: string, fileName: string, base64: string, contentType: string): Promise<{ path: string; bytes: number }> {
    const safe = normalizeRel(fileName);
    if (!safe.toLowerCase().endsWith(".png") && !safe.toLowerCase().endsWith(".jpg") && !safe.toLowerCase().endsWith(".jpeg") && !safe.toLowerCase().endsWith(".gif") && !safe.toLowerCase().endsWith(".webp")) {
      throw new VaultPathError("only image assets are supported");
    }
    const dir = join(this.root, "courses", course, "assets");
    await mkdir(dir, { recursive: true });
    const abs = join(dir, safe);
    const bytes = Buffer.from(base64, "base64");
    await writeFile(abs, bytes);
    await this.indexer?.indexFile(abs);
    return { path: relative(this.root, abs).split("\\").join("/"), bytes: bytes.byteLength };
  }

  notesForCourse(course: string): NoteSearchHit[] {
    const rows = this.db
      .query(
        "SELECT path, course, title, summary FROM notes WHERE course = ? ORDER BY path",
      )
      .all(course) as Omit<NoteSearchHit, "snippet">[];
    return rows.map((row) => ({ ...row, snippet: "" }));
  }

  search(query: string, course?: string | null, limit = 20): NoteSearchHit[] {
    const tokens = query
      .split(/\s+/)
      .map((token) => token.replace(/["*]/g, "").trim())
      .filter(Boolean);
    if (tokens.length === 0) return [];

    const match = tokens.map((token) => `"${token}"*`).join(" AND ");
    const capped = Math.min(Math.max(limit, 1), 100);

    try {
      const sql = course
        ? `SELECT f.path, n.course, n.title, n.summary,
                  snippet(notes_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet
           FROM notes_fts f JOIN notes n ON n.path = f.path
           WHERE notes_fts MATCH ? AND n.course = ?
           ORDER BY bm25(notes_fts), n.path LIMIT ?`
        : `SELECT f.path, n.course, n.title, n.summary,
                  snippet(notes_fts, 2, '<mark>', '</mark>', '…', 16) AS snippet
           FROM notes_fts f JOIN notes n ON n.path = f.path
           WHERE notes_fts MATCH ?
           ORDER BY bm25(notes_fts), n.path LIMIT ?`;

      const params = course ? [match, course, capped] : [match, capped];
      return this.db.query(sql).all(...params) as NoteSearchHit[];
    } catch {
      return [];
    }
  }

  stats() {
    return this.db
      .query(
        "SELECT COUNT(*) AS notes, COUNT(DISTINCT course) AS courses, COALESCE(SUM(tokens),0) AS tokens FROM notes",
      )
      .get() as { notes: number; courses: number; tokens: number };
  }

  private generateIndex(course?: string | null): string {
    if (!course) {
      const courses = this.db
        .query(
          "SELECT course, COUNT(*) AS notes, COALESCE(SUM(tokens),0) AS tokens FROM notes GROUP BY course ORDER BY course",
        )
        .all() as { course: string; notes: number; tokens: number }[];
      const lines = ["# Courses", "", "| Course | Notes | Tokens |", "| --- | --- | --- |"];
      for (const row of courses) {
        lines.push(`| ${row.course} | ${row.notes} | ${row.tokens} |`);
      }
      return `${lines.join("\n")}\n`;
    }

    const rows = this.db
      .query("SELECT path, summary, tags, tokens FROM notes WHERE course = ? ORDER BY path")
      .all(course) as { path: string; summary: string; tags: string; tokens: number }[];
    const title = this.readCourseMeta(course).title ?? course;
    const lines = [
      `# ${title}`,
      "",
      "| Path | Summary | Tags | Tokens |",
      "| --- | --- | --- | --- |",
    ];
    for (const row of rows) {
      const tags = stringList(JSON.parse(row.tags)).join(", ");
      lines.push(`| ${row.path} | ${escapeCell(row.summary)} | ${tags} | ${row.tokens} |`);
    }
    return `${lines.join("\n")}\n`;
  }

  private readCourseMeta(code: string): {
    title: string | null;
    department: string | null;
    answerStyle: string | null;
    examDate: string | null;
  } {
    const path = join(this.root, "courses", code, "course.md");
    if (!existsSync(path)) {
      return { title: null, department: null, answerStyle: null, examDate: null };
    }
    try {
      const parsed = parseNote(readFileSync(path, "utf8"));
      return {
        title: stringValue(parsed.frontmatter.title),
        department: stringValue(parsed.frontmatter.department),
        answerStyle: stringValue(parsed.frontmatter.answer_style),
        examDate: stringValue(parsed.frontmatter.exam_date),
      };
    } catch {
      return { title: null, department: null, answerStyle: null, examDate: null };
    }
  }

  private cachedWrite(requestId?: string): { path: string; bytes: number; mode: string } | null {
    if (!requestId) return null;
    const row = this.db
      .query("SELECT result FROM idempotency WHERE key = ?")
      .get(`write_note:${requestId}`) as { result: string } | null;
    return row ? (JSON.parse(row.result) as { path: string; bytes: number; mode: string }) : null;
  }

  private rememberWrite(
    requestId: string | undefined,
    result: { path: string; bytes: number; mode: string },
  ): void {
    if (!requestId) return;
    this.db
      .query("INSERT OR REPLACE INTO idempotency (key, result, created_at) VALUES (?, ?, ?)")
      .run(`write_note:${requestId}`, JSON.stringify(result), Date.now());
  }

  private historyDir(rel: string): string {
    return join(this.root, ".history", rel.replaceAll("/", "__"));
  }

  private async pruneHistory(rel: string): Promise<void> {
    const dir = this.historyDir(rel);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const files: { name: string; mtime: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const full = join(dir, entry.name);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      files.push({ name: entry.name, mtime: info.mtimeMs });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const file of files.slice(20)) {
      try {
        await rm(join(dir, file.name));
      } catch {
        /* best effort */
      }
    }
  }

  async writeTextFile(rel: string, content: string, requestId?: string): Promise<{ path: string; bytes: number }> {
    const safe = normalizeRel(rel);
    const abs = resolveInside(this.root, safe);
    await mkdir(dirname(abs), { recursive: true });

    const histDir = this.historyDir(safe);
    await mkdir(histDir, { recursive: true });
    const stamp = Date.now().toString();
    await writeFile(join(histDir, `${stamp}.md`), content);
    await this.pruneHistory(safe);

    await writeFile(abs, content);
    await this.indexer?.indexFile(abs);
    return { path: safe, bytes: Buffer.byteLength(content) };
  }

  async readTextFile(rel: string): Promise<string> {
    const safe = normalizeRel(rel);
    const abs = resolveInside(this.root, safe);
    return readFileSync(abs, "utf8");
  }

  async listHistory(rel: string): Promise<{ stamp: string }[]> {
    const safe = normalizeRel(rel);
    const dir = this.historyDir(safe);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const stamps: { name: string; mtime: number }[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const full = join(dir, entry.name);
      let info;
      try {
        info = await stat(full);
      } catch {
        continue;
      }
      stamps.push({ name: entry.name.replace(/\.md$/, ""), mtime: info.mtimeMs });
    }
    stamps.sort((a, b) => b.mtime - a.mtime);
    return stamps.map((item) => ({ stamp: item.name }));
  }

  async restoreVersion(rel: string, stamp: string): Promise<{ path: string; bytes: number }> {
    const safe = normalizeRel(rel);
    const dir = this.historyDir(safe);
    const abs = resolveInside(this.root, safe);
    const content = readFileSync(join(dir, `${stamp}.md`), "utf8");
    await writeFile(abs, content);
    await this.indexer?.indexFile(abs);
    return { path: safe, bytes: Buffer.byteLength(content) };
  }

  async writeAnswerStyle(code: string, content: string, requestId?: string): Promise<{ path: string; bytes: number }> {
    if (!/^[A-Za-z0-9._-]+$/.test(code)) throw new VaultPathError(`invalid course code: ${code}`);
    return this.writeTextFile(`courses/${code}/answer-style.md`, content, requestId);
  }

  async writeRubric(name: string, content: string, requestId?: string): Promise<{ path: string; bytes: number }> {
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new VaultPathError(`invalid rubric name: ${name}`);
    return this.writeTextFile(`rubrics/${name}.md`, content, requestId);
  }

  async writeMastery(code: string, content: string, requestId?: string): Promise<{ path: string; bytes: number }> {
    if (!/^[A-Za-z0-9._-]+$/.test(code)) throw new VaultPathError(`invalid course code: ${code}`);
    return this.writeTextFile(`courses/${code}/mastery.md`, content, requestId);
  }
}

function requireMarkdown(path: string): void {
  if (!path.endsWith(".md")) throw new VaultPathError("only .md files are supported");
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

async function walkFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

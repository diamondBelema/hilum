import { existsSync, readFileSync, statSync, watch, type FSWatcher } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Db } from "../db.ts";
import { parseNote, stringList, stringValue } from "./frontmatter.ts";
import { courseFromPath } from "./paths.ts";

export type IndexedNote = {
  path: string;
  course: string | null;
  title: string;
  summary: string;
  tags: string[];
  tokens: number;
  source: string | null;
  mtime: number;
  size: number;
};

export type IndexStats = {
  notes: number;
  courses: number;
  tokens: number;
};

export class NoteIndexer {
  private watcher: FSWatcher | null = null;
  private readonly coursesDir: string;

  constructor(
    private readonly db: Db,
    private readonly vaultPath: string,
  ) {
    this.coursesDir = join(vaultPath, "courses");
  }

  async reindexAll(): Promise<IndexStats> {
    const files = await walkMarkdown(this.coursesDir);
    const seen = new Set<string>();

    const upsert = this.db.transaction((items: { abs: string; rel: string }[]) => {
      for (const item of items) seen.add(item.rel);
      for (const item of items) this.indexPathSync(item.abs, item.rel);
    });

    const items = files.map((abs) => ({ abs, rel: toRel(this.vaultPath, abs) }));
    upsert(items);

    const stale = this.db.query("SELECT path FROM notes").all() as { path: string }[];
    const remove = this.db.prepare("DELETE FROM notes WHERE path = ?");
    const removeFts = this.db.prepare("DELETE FROM notes_fts WHERE path = ?");
    for (const row of stale) {
      if (!seen.has(row.path)) {
        remove.run(row.path);
        removeFts.run(row.path);
      }
    }

    return this.stats();
  }

  async indexFile(absPath: string): Promise<void> {
    const rel = toRel(this.vaultPath, absPath);
    if (!rel.startsWith("courses/") || !rel.endsWith(".md") || rel.endsWith("/course.md")) return;
    this.indexPathSync(absPath, rel);
  }

  removeFile(absPath: string): void {
    const rel = toRel(this.vaultPath, absPath);
    this.db.prepare("DELETE FROM notes WHERE path = ?").run(rel);
    this.db.prepare("DELETE FROM notes_fts WHERE path = ?").run(rel);
  }

  startWatching(onError?: (err: unknown) => void): void {
    if (this.watcher) return;
    this.watcher = watch(this.coursesDir, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const name = filename.split(/[\\/]/).pop() ?? filename;
      if (!name.endsWith(".md") || name === "INDEX.md" || name === "course.md") return;
      const abs = `${this.coursesDir}/${filename}`;
      try {
        if (event === "rename" && !existsSync(abs)) this.removeFile(abs);
        else void this.indexFile(abs).catch(onError);
      } catch (err) {
        onError?.(err);
      }
    });
    this.watcher.on("error", (err) => onError?.(err));
  }

  close(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  stats(): IndexStats {
    const row = this.db
      .query(
        "SELECT COUNT(*) AS notes, COUNT(DISTINCT course) AS courses, COALESCE(SUM(tokens),0) AS tokens FROM notes",
      )
      .get() as { notes: number; courses: number; tokens: number };
    return row;
  }

  private indexPathSync(absPath: string, rel: string): void {
    let raw: string;
    try {
      raw = readFileSyncSafe(absPath);
    } catch {
      return;
    }
    const info = statSyncSafe(absPath);
    const parsed = parseNote(raw);
    const title =
      stringValue(parsed.frontmatter.title) ?? firstHeading(parsed.body) ?? basename(rel);
    const summary =
      stringValue(parsed.frontmatter.summary) ?? firstParagraph(parsed.body) ?? "";
    const tags = stringList(parsed.frontmatter.topics ?? parsed.frontmatter.tags);
    const tokens = Math.ceil(raw.length / 4);

    this.db
      .query(
        `INSERT INTO notes (path, course, title, summary, tags, tokens, source, updated_at, mtime, size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           course = excluded.course, title = excluded.title, summary = excluded.summary,
           tags = excluded.tags, tokens = excluded.tokens, source = excluded.source,
           updated_at = excluded.updated_at, mtime = excluded.mtime, size = excluded.size`,
      )
      .run(
        rel,
        courseFromPath(rel),
        title,
        summary,
        JSON.stringify(tags),
        tokens,
        stringValue(parsed.frontmatter.source),
        info?.mtimeMs ?? Date.now(),
        info?.mtimeMs ?? 0,
        info?.size ?? raw.length,
      );

    this.db.prepare("DELETE FROM notes_fts WHERE path = ?").run(rel);
    this.db
      .prepare("INSERT INTO notes_fts (path, title, body) VALUES (?, ?, ?)")
      .run(rel, title, parsed.body);
  }
}

async function walkMarkdown(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "assets") continue;
      files.push(...(await walkMarkdown(path)));
    } else if (entry.name.endsWith(".md") && entry.name !== "INDEX.md" && entry.name !== "course.md") {
      files.push(path);
    }
  }
  return files;
}

function toRel(root: string, abs: string): string {
  return relative(root, abs).split("\\").join("/");
}

function basename(rel: string): string {
  const file = rel.split("/").pop() ?? rel;
  return file.replace(/\.md$/, "").replaceAll("-", " ");
}

function firstHeading(body: string): string | null {
  const match = /^#{1,2}\s+(.+)$/m.exec(body);
  return match?.[1]?.replace(/\{#[\w-]+\}\s*$/, "").trim() ?? null;
}

function firstParagraph(body: string): string | null {
  const lines = body.split("\n");
  for (const line of lines) {
    const text = line.trim();
    if (!text || text.startsWith("#") || text.startsWith("![")) continue;
    const clean = text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`>]/g, "")
      .trim();
    if (clean) return clean.slice(0, 180);
  }
  return null;
}

function readFileSyncSafe(path: string): string {
  return readFileSync(path, "utf8");
}

function statSyncSafe(path: string) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

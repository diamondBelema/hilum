import { createHash } from "node:crypto";
import { access, mkdir, readdir, rename, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { Db } from "../db.ts";
import type { Config } from "../config.ts";

export type InboxItem = {
  id: string;
  path: string;
  sha256: string;
  size: number;
  kind: string;
  course: string | null;
  confidence: number | null;
  status: string;
  note_paths: string[];
  error: string | null;
  created_at: number;
  updated_at: number;
};

export class InboxService {
  constructor(private readonly db: Db, private readonly config: Config) {}

  async register(file: File): Promise<{ item: InboxItem; duplicate: boolean }> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = this.db.query("SELECT * FROM inbox_items WHERE sha256 = ?").get(sha256) as Record<string, unknown> | null;
    if (existing) return { item: this.map(existing), duplicate: true };
    const safeName = sanitizeFileName(file.name || "upload");
    const relativePath = join("inbox", safeName).replaceAll("\\", "/");
    const destination = join(this.config.vaultPath, relativePath);
    await mkdir(join(this.config.vaultPath, "inbox"), { recursive: true });
    await writeFile(destination, bytes, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      const alternate = join("inbox", `${sha256.slice(0, 12)}-${safeName}`).replaceAll("\\", "/");
      await writeFile(join(this.config.vaultPath, alternate), bytes, { flag: "wx" });
    });
    const actualPath = await this.findPath(sha256, safeName);
    const now = Date.now();
    const id = `inbox-${sha256.slice(0, 24)}`;
    this.db.query(
      `INSERT INTO inbox_items
       (id,path,sha256,size,kind,status,note_paths_json,created_at,updated_at)
       VALUES (?,?,?,?,?,'new','[]',?,?)`,
    ).run(id, actualPath, sha256, bytes.byteLength, classify(safeName), now, now);
    return { item: this.get(id), duplicate: false };
  }

  list(status?: string): InboxItem[] {
    const query = status ? "SELECT * FROM inbox_items WHERE status = ? ORDER BY created_at DESC" : "SELECT * FROM inbox_items ORDER BY created_at DESC";
    return (this.db.query(query).all(...(status ? [status] : [])) as Record<string, unknown>[]).map((row) => this.map(row));
  }

  get(id: string): InboxItem {
    const row = this.db.query("SELECT * FROM inbox_items WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!row) throw new Error("inbox item not found");
    return this.map(row);
  }

  async assign(id: string, course: string, confidence: number): Promise<InboxItem> {
    const item = this.get(id);
    const now = Date.now();
    this.db.query("UPDATE inbox_items SET course=?, confidence=?, status='sorted', updated_at=? WHERE id=?")
      .run(course, confidence, now, id);
    return this.get(item.id);
  }

  async moveToUnsorted(id: string): Promise<InboxItem> {
    const item = this.get(id);
    const source = join(this.config.vaultPath, item.path);
    let relative = join("inbox", "_unsorted", item.path.split("/").at(-1) ?? item.id).replaceAll("\\", "/");
    let destination = join(this.config.vaultPath, relative);
    await mkdir(join(this.config.vaultPath, "inbox", "_unsorted"), { recursive: true });
    if (source !== destination) {
      if (await access(destination).then(() => true).catch(() => false)) {
        const name = relative.split("/").at(-1) ?? item.id;
        destination = join(this.config.vaultPath, "inbox", "_unsorted", `${item.sha256.slice(0, 12)}-${name}`);
        relative = destination.slice(this.config.vaultPath.length + 1).replaceAll("\\", "/");
      }
      await rename(source, destination);
    }
    this.db.query("UPDATE inbox_items SET path=?, status='needs_review', updated_at=? WHERE id=?").run(relative, Date.now(), id);
    return this.get(id);
  }

  private async findPath(hash: string, name: string): Promise<string> {
    const rows = (await readdir(join(this.config.vaultPath, "inbox"))).filter((entry) => entry === name || entry.startsWith(`${hash.slice(0, 12)}-`));
    return `inbox/${rows[0] ?? name}`;
  }

  private map(row: Record<string, unknown>): InboxItem {
    return {
      id: String(row.id),
      path: String(row.path),
      sha256: String(row.sha256),
      size: Number(row.size),
      kind: String(row.kind),
      course: row.course == null ? null : String(row.course),
      confidence: row.confidence == null ? null : Number(row.confidence),
      status: String(row.status),
      note_paths: JSON.parse(String(row.note_paths_json)),
      error: row.error == null ? null : String(row.error),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
    };
  }
}

function sanitizeFileName(name: string): string {
  const clean = basename(name).replace(/[^\w.\- ()]+/g, "_").trim();
  return clean || `upload${extname(name) || ".bin"}`;
}

function classify(name: string): string {
  const ext = extname(name).toLowerCase();
  if (ext === ".pptx" || ext === ".ppt") return "pptx";
  if (ext === ".pdf") return "pdf_text";
  if (ext === ".docx") return "docx";
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return "photo";
  return "other";
}

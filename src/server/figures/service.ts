import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Db } from "../db.ts";
import type { Config } from "../config.ts";
import type { EventBus } from "../events.ts";

export type FigureKind = "svg" | "raster";

export type Figure = {
  id: string;
  course: string;
  title: string;
  source: string;
  source_id: string;
  kind: FigureKind;
  width: number | null;
  height: number | null;
  license: string | null;
  author: string | null;
  attribution_required: boolean;
  local_path: string | null;
  local_url: string | null;
  caption: string | null;
  created_at: number;
};

export type FigureCandidate = {
  source: string;
  source_id: string;
  title: string;
  thumbnail_url: string | null;
  file_url: string | null;
  kind: FigureKind;
  width: number | null;
  height: number | null;
  license: string | null;
  author: string | null;
  attribution_required: boolean;
};

const ALLOWED_HOSTS = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
  "pubchem.ncbi.nlm.nih.gov",
  "search.rcsb.org",
  "data.rcsb.org",
  "files.rcsb.org",
]);

const ALLOWED_CONTENT_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const MAX_DOWNLOAD_BYTES = 2_000_000; // 2 MB

export class FiguresService {
  private readonly figuresDir: string;
  private readonly baseUrl: string;

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly events: EventBus,
  ) {
    this.figuresDir = join(dirname(config.dbPath), "figures");
    mkdirSync(this.figuresDir, { recursive: true });
    this.baseUrl = `http://${config.hostname}:${config.port}`;
  }

  register(course: string, candidate: FigureCandidate, caption: string | null): Figure {
    const id = `fig-${createHash("sha256").update(`${candidate.source}:${candidate.source_id}`).digest("hex").slice(0, 16)}`;
    const now = Date.now();
    const existing = this.db.query("SELECT * FROM figures WHERE id = ?").get(id) as Figure | null;
    if (existing) {
      if (caption !== null) {
        this.db.query("UPDATE figures SET caption = ? WHERE id = ?").run(caption, id);
      }
      return { ...existing, caption: caption ?? existing.caption };
    }
    this.db.query(
      `INSERT INTO figures
       (id, course, title, source, source_id, kind, width, height, license, author, attribution_required, local_path, local_url, caption, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      course,
      candidate.title,
      candidate.source,
      candidate.source_id,
      candidate.kind,
      candidate.width ?? null,
      candidate.height ?? null,
      candidate.license ?? null,
      candidate.author ?? null,
      candidate.attribution_required ? 1 : 0,
      null,
      null,
      caption ?? null,
      now,
    );
    this.events.publish({
      type: "session",
      course,
      sessionId: "",
      state: "figure_registered",
      at: now,
    });
    return {
      id,
      course,
      title: candidate.title,
      source: candidate.source,
      source_id: candidate.source_id,
      kind: candidate.kind,
      width: candidate.width,
      height: candidate.height,
      license: candidate.license,
      author: candidate.author,
      attribution_required: candidate.attribution_required,
      local_path: null,
      local_url: null,
      caption: caption ?? null,
      created_at: now,
    };
  }

  list(course: string): Figure[] {
    const rows = this.db.query(
      "SELECT * FROM figures WHERE course = ? ORDER BY created_at DESC",
    ).all(course) as Array<{ attribution_required: number | boolean } & Record<string, unknown>>;
    return rows.map((row) => ({
      ...row,
      attribution_required: Boolean(row.attribution_required),
    })) as Figure[];
  }

  get(id: string): Figure | null {
    const row = this.db.query("SELECT * FROM figures WHERE id = ?").get(id) as
      | ({ attribution_required: number | boolean } & Record<string, unknown>)
      | null;
    if (!row) return null;
    return { ...row, attribution_required: Boolean(row.attribution_required) } as Figure;
  }

  isAllowedHost(host: string): boolean {
    return ALLOWED_HOSTS.has(host);
  }

  isAllowedContentType(contentType: string | null): boolean {
    if (!contentType) return false;
    const type = contentType.split(";")[0].trim().toLowerCase();
    return ALLOWED_CONTENT_TYPES.has(type);
  }

  async download(id: string): Promise<Figure | null> {
    const row = this.db.query(
      "SELECT * FROM figures WHERE id = ?",
    ).get(id) as Figure | null;
    if (!row) return null;

    const fileUrl = row.local_url ?? `https://${this.resolveHost(row.source)}/${row.source_id}`;
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`download failed: ${response.status}`);

    const contentType = response.headers.get("content-type");
    if (!this.isAllowedContentType(contentType)) {
      throw new Error(`content type not allowed: ${contentType}`);
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error(`file too large: ${bytes.byteLength} bytes`);
    }

    const ext = contentType?.includes("svg") ? ".svg" : ".png";
    const localPath = join(this.figuresDir, `${row.id}${ext}`);
    await writeFile(localPath, Buffer.from(bytes));

    const localUrl = `${this.baseUrl}/api/figures/${row.id}/file`;
    this.db.query(
      "UPDATE figures SET local_path = ?, local_url = ? WHERE id = ?",
    ).run(localPath, localUrl, row.id);

    return this.get(row.id);
  }

  serveFile(id: string): { path: string; contentType: string } | null {
    const row = this.get(id);
    if (!row?.local_path) return null;
    const contentType = row.kind === "svg" ? "image/svg+xml" : "image/png";
    return { path: row.local_path, contentType };
  }

  private resolveHost(source: string): string {
    const hostMap: Record<string, string> = {
      commons: "commons.wikimedia.org",
      pubchem: "pubchem.ncbi.nlm.nih.gov",
      rcsb: "files.rcsb.org",
    };
    return hostMap[source] ?? "commons.wikimedia.org";
  }
}

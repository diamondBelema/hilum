import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Db } from "../db.ts";
import type { Config } from "../config.ts";

export class VisionService {
  constructor(private readonly db: Db, private readonly config: Config) {}

  list(course?: string) {
    const sql = course
      ? "SELECT * FROM vision_queue WHERE course = ? ORDER BY id"
      : "SELECT * FROM vision_queue ORDER BY id";
    return this.db.query(sql).all(...(course ? [course] : []));
  }

  async image(id: string): Promise<{ mimeType: string; data: string }> {
    const row = this.db.query("SELECT png_path FROM vision_queue WHERE id = ?").get(id) as { png_path: string } | null;
    if (!row) throw new Error("vision queue item not found");
    const path = join(this.config.vaultPath, row.png_path);
    const bytes = await readFile(path);
    return { mimeType: "image/png", data: Buffer.from(bytes).toString("base64") };
  }

  async resolve(id: string, text: string, doneAs: "done" | "done-image" = "done") {
    const row = this.db.query("SELECT * FROM vision_queue WHERE id = ?").get(id) as { note_path: string; status: string } | null;
    if (!row) throw new Error("vision queue item not found");
    if (row.status === "done" || row.status === "done-image") return row;
    const notePath = join(this.config.vaultPath, row.note_path);
    const note = await readFile(notePath, "utf8");
    const marker = `\n\n> Vision transcription (${id}): ${text.trim()}\n`;
    if (!note.includes(`Vision transcription (${id})`)) await writeFile(notePath, note + marker);
    this.db.query("UPDATE vision_queue SET status = ? WHERE id = ?").run(doneAs, id);
    return this.db.query("SELECT * FROM vision_queue WHERE id = ?").get(id);
  }
}

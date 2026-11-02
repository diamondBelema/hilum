import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Db } from "../db.ts";
import type { VaultService } from "../vault/service.ts";
import type { InboxItem } from "./service.ts";

type Candidate = { course: string; score: number; evidence: string[] };

export type SortResult = {
  item: InboxItem;
  candidates: Candidate[];
  action: "sorted" | "review" | "unsorted";
};

export class InboxSortService {
  constructor(
    private readonly db: Db,
    private readonly vault: VaultService,
    private readonly inbox: {
      get(id: string): InboxItem;
      assign(id: string, course: string, confidence: number): Promise<InboxItem>;
      moveToUnsorted(id: string): Promise<InboxItem>;
    },
  ) {}

  async sort(id: string): Promise<SortResult> {
    const item = this.inbox.get(id);
    const courses = await this.vault.listCourses();
    const text = await this.readHints(item);
    const aliases = this.db.query("SELECT course, alias FROM course_aliases").all() as { course: string; alias: string }[];
    const candidates = courses.map((course) => {
      const haystack = `${item.path} ${text}`.toLowerCase();
      const evidence: string[] = [];
      let score = 0;
      if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(course.code.toLowerCase())}([^a-z0-9]|$)`).test(haystack)) {
        score = 1;
        evidence.push("course code");
      } else if (haystack.includes(course.title.toLowerCase())) {
        score = 0.9;
        evidence.push("course title");
      } else {
        for (const alias of aliases.filter((entry) => entry.course === course.code)) {
          if (haystack.includes(alias.alias.toLowerCase())) {
            score = Math.max(score, 0.75);
            evidence.push(`alias: ${alias.alias}`);
          }
        }
      }
      const folder = dirname(item.path).toLowerCase();
      if (folder.includes(course.code.toLowerCase()) || folder.includes(course.title.toLowerCase())) {
        score = Math.max(score, 0.8);
        evidence.push("folder");
      }
      return { course: course.code, score, evidence };
    }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);

    const top = candidates[0];
    if (!top) return { item: await this.inbox.moveToUnsorted(id), candidates, action: "unsorted" };
    if (top.score >= 0.85) return { item: await this.inbox.assign(id, top.course, top.score), candidates, action: "sorted" };
    return { item: this.patchReview(item, top.score), candidates, action: "review" };
  }

  async correct(id: string, course: string): Promise<InboxItem> {
    const item = this.inbox.get(id);
    const valid = (await this.vault.listCourses()).some((candidate) => candidate.code === course);
    if (!valid) throw new Error(`course not found: ${course}`);
    const label = basename(item.path).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (label) {
      this.db.query("INSERT OR IGNORE INTO course_aliases (course, alias, source) VALUES (?, ?, 'learned')").run(course, label);
    }
    return this.inbox.assign(id, course, 1);
  }

  private patchReview(item: InboxItem, confidence: number): InboxItem {
    const now = Date.now();
    this.db.query("UPDATE inbox_items SET status='needs_review', confidence=?, updated_at=? WHERE id=?")
      .run(confidence, now, item.id);
    return this.inbox.get(item.id);
  }

  private async readHints(item: InboxItem): Promise<string> {
    if (!/\.(txt|md|csv|json)$/i.test(item.path)) return "";
    try {
      return (await readFile(join(this.vault.root, item.path), "utf8")).slice(0, 100_000);
    } catch {
      return "";
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

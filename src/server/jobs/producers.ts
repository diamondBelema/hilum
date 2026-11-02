import type { Db } from "../db.ts";
import type { JobService } from "./service.ts";
import type { InboxService } from "../inbox/service.ts";
import type { Config } from "../config.ts";
import type { VisionService } from "../vision/service.ts";
import type { PaperService } from "../exams/papers.ts";
import type { VaultService } from "../vault/service.ts";

type ProducerResult = { enqueued: number; skipped: number };

const MS_PER_HOUR = 3_600_000;

export class JobProducers {
  private runCounts = new Map<string, number[]>();

  constructor(
    private readonly db: Db,
    private readonly jobs: JobService,
    private readonly inbox: InboxService,
    private readonly config: Config,
    private readonly vision?: VisionService,
    private readonly papers?: PaperService,
    private readonly vault?: VaultService,
  ) {}

  /** Map concepts for converted notes that have zero citing concepts. Cap: 20/hour. */
  mapConcepts(): ProducerResult {
    const notes = this.db.query(
      `SELECT n.path, n.course
       FROM notes n
       LEFT JOIN concepts c ON c.course = n.course AND c.cites_json LIKE '%' || n.path || '%'
       WHERE c.id IS NULL
       ORDER BY n.updated_at DESC
       LIMIT 100`,
    ).all() as { path: string; course: string }[];

    let enqueued = 0;
    let skipped = 0;
    const now = Date.now();

    for (const note of notes) {
      if (!this.canRun(`map_concepts:${note.course}`, 20, now)) {
        skipped += 1;
        continue;
      }
      const existing = this.jobs.enqueue({
        type: "map_concepts",
        executor: "server",
        priority: 40,
        course: note.course,
        payload: { notePath: note.path, source: "producer" },
        dedupeKey: `map_concepts:${note.path}`,
        createdBy: "server",
      });
      if (existing) skipped += 1;
      else enqueued += 1;
    }

    return { enqueued, skipped };
  }

  /** Tag banked questions missing concept ids. Cap: 10/hour. */
  tagQuestions(): ProducerResult {
    const questions = this.db.query(
      "SELECT id, course FROM questions WHERE (concept_ids IS NULL OR concept_ids = '[]') AND verified = 1 ORDER BY created_at DESC LIMIT 100",
    ).all() as { id: string; course: string }[];

    let enqueued = 0;
    let skipped = 0;
    const now = Date.now();

    for (const q of questions) {
      if (!this.canRun(`tag_questions:${q.course}`, 10, now)) {
        skipped += 1;
        continue;
      }
      const existing = this.jobs.enqueue({
        type: "tag_questions",
        executor: "server",
        priority: 50,
        course: q.course,
        payload: { questionId: q.id, source: "producer" },
        dedupeKey: `tag_questions:${q.id}`,
        createdBy: "server",
      });
      if (existing) skipped += 1;
      else enqueued += 1;
    }

    return { enqueued, skipped };
  }

  /** Write questions for exams within 21 days with a low bank. Cap: 5/hour. */
  writeQuestions(): ProducerResult {
    if (!this.papers) return { enqueued: 0, skipped: 0 };

    const now = Date.now();
    const twentyOneDays = 21 * MS_PER_HOUR;
    const exams = this.db.query(
      "SELECT id, course, created_at FROM papers ORDER BY created_at DESC",
    ).all() as { id: string; course: string; created_at: number }[];

    let enqueued = 0;
    let skipped = 0;

    for (const exam of exams) {
      if (now - exam.created_at > twentyOneDays) continue;
      if (!this.canRun(`write_questions:${exam.course}`, 5, now)) {
        skipped += 1;
        continue;
      }
      const bankCount = this.db.query(
        "SELECT COUNT(*) AS c FROM questions WHERE course = ? AND verified = 1",
      ).get(exam.course) as { c: number };
      if (bankCount.c >= 20) continue; // bank is sufficient

      const existing = this.jobs.enqueue({
        type: "write_questions",
        executor: "server",
        priority: 45,
        course: exam.course,
        payload: { examId: exam.id, source: "producer" },
        dedupeKey: `write_questions:${exam.course}:${Math.floor(now / MS_PER_HOUR)}`,
        createdBy: "server",
      });
      if (existing) skipped += 1;
      else enqueued += 1;
    }

    return { enqueued, skipped };
  }

  /** Transcribe flagged pages from the converter. Cap: 30/hour. */
  visionTranscribe(): ProducerResult {
    const flagged = this.db.query(
      "SELECT id, course, page, png_path, flag FROM vision_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 100",
    ).all() as { id: string; course: string; page: number; png_path: string; flag: string }[];

    let enqueued = 0;
    let skipped = 0;
    const now = Date.now();

    for (const item of flagged) {
      if (!this.canRun(`vision_transcribe:${item.course}`, 30, now)) {
        skipped += 1;
        continue;
      }
      const existing = this.jobs.enqueue({
        type: "vision_transcribe",
        executor: "server",
        priority: 50,
        course: item.course,
        payload: { queueId: item.id, page: item.page, pngPath: item.png_path, flag: item.flag, source: "producer" },
        dedupeKey: `vision_transcribe:${item.id}`,
        createdBy: "server",
      });
      if (existing) skipped += 1;
      else enqueued += 1;
    }

    return { enqueued, skipped };
  }

  /** Find an image for a concept that has no figure. Cap: 10/hour. */
  findImage(): ProducerResult {
    const concepts = this.db.query(
      "SELECT id, course, title FROM concepts WHERE status = 'accepted' ORDER BY updated_at DESC LIMIT 100",
    ).all() as { id: string; course: string; title: string }[];

    let enqueued = 0;
    let skipped = 0;
    const now = Date.now();

    for (const concept of concepts) {
      if (!this.canRun(`find_image:${concept.course}`, 10, now)) {
        skipped += 1;
        continue;
      }
      const existing = this.jobs.enqueue({
        type: "find_image",
        executor: "server",
        priority: 60,
        course: concept.course,
        payload: { conceptId: concept.id, conceptTitle: concept.title, source: "producer" },
        dedupeKey: `find_image:${concept.id}`,
        createdBy: "server",
      });
      if (existing) skipped += 1;
      else enqueued += 1;
    }

    return { enqueued, skipped };
  }

  /** Run all producers, returning per-producer results. */
  runAll() {
    return {
      map_concepts: this.mapConcepts(),
      tag_questions: this.tagQuestions(),
      write_questions: this.writeQuestions(),
      vision_transcribe: this.visionTranscribe(),
      find_image: this.findImage(),
    };
  }

  private canRun(dedupePrefix: string, cap: number, now: number): boolean {
    const windowStart = now - MS_PER_HOUR;
    const timestamps = (this.runCounts.get(dedupePrefix) ?? []).filter((ts) => ts > windowStart);
    if (timestamps.length >= cap) return false;
    timestamps.push(now);
    this.runCounts.set(dedupePrefix, timestamps);
    return true;
  }
}

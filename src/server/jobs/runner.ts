import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Db } from "../db.ts";
import type { JobService } from "./service.ts";
import type { InboxService } from "../inbox/service.ts";
import type { Config } from "../config.ts";
import type { EventBus } from "../events.ts";
import type { LauncherService } from "../launcher/service.ts";

export type ConvertEvent =
  | { event: "note"; path: string; tokens: number }
  | { event: "complete"; source: string; course: string; notes: number; tokens: number[]; meta: unknown; vision_queue: number }
  | { event: "error"; message: string; source: string };

type CompleteEvent = Extract<ConvertEvent, { event: "complete" }>;

export class JobRunner {
  private running = false;
  private current: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly jobs: JobService,
    private readonly inbox: InboxService,
    private readonly config: Config,
    private readonly events?: EventBus,
    private readonly launcher?: LauncherService,
  ) {}

  start(pollMs = 2000): void {
    if (this.running) return;
    this.running = true;
    this.current = this.loop(pollMs);
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private async loop(pollMs: number): Promise<void> {
    while (this.running) {
      try {
        const job = this.jobs.leaseServer("runner", ["convert"]);
        if (!job) {
          await new Promise((resolve) => setTimeout(resolve, pollMs));
          continue;
        }
        try {
          await this.runJob(job);
          this.jobs.complete(job.id, "runner", null);
          this.launcher?.recordJobCompleted();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.jobs.fail(job.id, "runner", message, true);
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    }
  }

  private async runJob(job: { id: string; type: string; payload: unknown }): Promise<void> {
    if (job.type === "convert") {
      await this.runConvert(job as { id: string; payload: { inboxItemId: string; path: string; course: string } });
    } else {
      throw new Error(`unknown server job type: ${job.type}`);
    }
  }

  private async runConvert(job: { id: string; payload: { inboxItemId: string; path: string; course: string } }): Promise<void> {
    const { inboxItemId, path, course } = job.payload as { inboxItemId: string; path: string; course: string };
    const item = this.inbox.get(inboxItemId);
    const source = join(this.config.vaultPath, path);

    const notePaths: string[] = [];
    let complete: CompleteEvent | null = null;
    let error: string | null = null;

    const root = join(import.meta.dirname, "../../..");
    const script = join(root, "tools", "convert.py");

    const child = spawn("python3", [script, source, "--vault", this.config.vaultPath, "--course", course], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr?.on("data", () => {});

    let exitCode: number | null = null;
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        exitCode = code;
        resolve();
      });
    });

    const output = Buffer.concat(chunks).toString("utf8");
    for (const line of output.split("\n")) {
      if (!line.trim()) continue;
      let event: ConvertEvent;
      try {
        event = JSON.parse(line) as ConvertEvent;
      } catch {
        continue;
      }
      if (event.event === "note") notePaths.push(event.path);
      else if (event.event === "complete") complete = event;
      else if (event.event === "error") error = event.message;
    }

    const now = Date.now();
    if (exitCode !== 0 || error || !complete) {
      const message = error ?? `convert.py exited with code ${exitCode}`;
      this.inbox.updateStatusAndNotes(inboxItemId, "unreadable", []);
      this.db.query("UPDATE inbox_items SET error=?, updated_at=? WHERE id=?").run(message, now, inboxItemId);
      throw new Error(message);
    }

    this.inbox.updateStatusAndNotes(inboxItemId, "converted", notePaths);

    for (const notePath of notePaths) {
      const hasCiting = this.db
        .query("SELECT 1 FROM concepts WHERE course = ? AND cites_json LIKE ? LIMIT 1")
        .get(course, `%${notePath}%`) as { 1: number } | null;
      if (!hasCiting) {
        this.jobs.enqueue({
          type: "map_concepts",
          executor: "server",
          priority: 40,
          course,
          payload: { notePath, source: "convert" },
          dedupeKey: `map_concepts:${notePath}`,
          createdBy: "server",
        });
      }
    }

    if (complete.vision_queue > 0) {
      this.jobs.enqueue({
        type: "vision_transcribe",
        executor: "server",
        priority: 50,
        course,
        payload: { inboxItemId, source: path, count: complete.vision_queue },
        dedupeKey: `vision_transcribe:${inboxItemId}`,
        createdBy: "server",
      });
    }

    this.events?.publish({ type: "job", jobId: job.id, state: "done", at: now });
  }
}

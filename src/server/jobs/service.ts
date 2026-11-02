import { randomUUID } from "node:crypto";
import type { Db } from "../db.ts";
import type { EventBus } from "../events.ts";

export type JobExecutor = "agent" | "server";
export type JobStatus = "queued" | "leased" | "done" | "failed" | "cancelled";

export type Job = {
  id: string;
  type: string;
  executor: JobExecutor;
  priority: number;
  course: string | null;
  payload: unknown;
  status: JobStatus;
  lease_owner: string | null;
  lease_expires_at: number | null;
  attempts: number;
  max_attempts: number;
  result: unknown;
  error: string | null;
  dedupe_key: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  done_at: number | null;
};

const LEASE_MS = 10 * 60 * 1000;

export class JobError extends Error {}

export class JobService {
  constructor(private readonly db: Db, private readonly events?: EventBus) {}

  enqueue(input: {
    type: string;
    executor?: JobExecutor;
    priority?: number;
    course?: string | null;
    payload?: unknown;
    dedupeKey?: string | null;
    createdBy?: string;
    maxAttempts?: number;
  }): Job {
    const now = Date.now();
    const id = randomUUID();
    const executor = input.executor ?? "agent";
    const dedupeKey = input.dedupeKey ?? null;
    if (dedupeKey) {
      const existing = this.db.query(
        "SELECT id FROM jobs WHERE dedupe_key = ? AND status IN ('queued','leased')",
      ).get(dedupeKey) as { id: string } | null;
      if (existing) return this.get(existing.id);
    }
    this.db.query(
      `INSERT INTO jobs
        (id,type,executor,priority,course,payload_json,status,attempts,max_attempts,dedupe_key,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,'?','queued',0,?,?,?, ?, ?)`.replace("'?'", "?"),
    ).run(
      id,
      input.type,
      executor,
      input.priority ?? 50,
      input.course ?? null,
      JSON.stringify(input.payload ?? {}),
      input.maxAttempts ?? 3,
      dedupeKey,
      input.createdBy ?? "server",
      now,
      now,
    );
    const job = this.get(id);
    this.events?.publish({ type: "job", jobId: id, state: "queued", at: now });
    return job;
  }

  get(id: string): Job {
    const row = this.db.query("SELECT * FROM jobs WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!row) throw new JobError(`job not found: ${id}`);
    return this.map(row);
  }

  async awaitWork(owner: string, types?: string[], timeoutSeconds = 0): Promise<Job | null> {
    const deadline = Date.now() + Math.min(Math.max(timeoutSeconds, 0), 25) * 1000;
    do {
      const job = this.lease(owner, types);
      if (job) return job;
      if (Date.now() >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    return null;
  }

  lease(owner: string, types?: string[]): Job | null {
    return this.leaseExecutor(owner, "agent", types);
  }

  leaseServer(owner: string, types?: string[]): Job | null {
    return this.leaseExecutor(owner, "server", types);
  }

  private leaseExecutor(owner: string, executor: JobExecutor, types?: string[]): Job | null {
    const now = Date.now();
    this.db.query("UPDATE jobs SET status='queued', lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE status='leased' AND lease_expires_at < ?")
      .run(now, now);
    const where = types?.length ? ` AND type IN (${types.map(() => "?").join(",")})` : "";
    const row = this.db.query(
      `SELECT * FROM jobs WHERE status='queued' AND executor = ?${where}
       ORDER BY priority ASC, created_at ASC LIMIT 1`,
    ).get(executor, ...(types ?? [])) as Record<string, unknown> | null;
    if (!row) return null;
    const updated = this.db.query(
      "UPDATE jobs SET status='leased', lease_owner=?, lease_expires_at=?, attempts=attempts+1, updated_at=? WHERE id=? AND status='queued'",
    ).run(owner, now + LEASE_MS, now, row.id as string);
    if (updated.changes !== 1) return this.lease(owner, types);
    const job = this.get(row.id as string);
    this.events?.publish({ type: "job", jobId: job.id, state: "leased", at: now });
    return job;
  }

  complete(id: string, owner: string, result: unknown): Job {
    const now = Date.now();
    const changed = this.db.query(
      "UPDATE jobs SET status='done', result_json=?, done_at=?, updated_at=?, lease_owner=NULL, lease_expires_at=NULL WHERE id=? AND status='leased' AND lease_owner=?",
    ).run(JSON.stringify(result ?? null), now, now, id, owner);
    if (changed.changes !== 1) throw new JobError("job is not leased to this worker");
    const job = this.get(id);
    this.events?.publish({ type: "job", jobId: id, state: "done", at: now });
    return job;
  }

  fail(id: string, owner: string, error: string, retry: boolean): Job {
    const current = this.get(id);
    if (current.status !== "leased" || current.lease_owner !== owner) throw new JobError("job is not leased to this worker");
    const retryable = retry && current.attempts < current.max_attempts;
    const now = Date.now();
    this.db.query(
      `UPDATE jobs SET status=?, error=?, updated_at=?, lease_owner=NULL, lease_expires_at=NULL${retryable ? "" : ", done_at=?"} WHERE id=?`,
    ).run(...(retryable ? ["queued", error, now, id] : ["failed", error, now, now, id]));
    const job = this.get(id);
    this.events?.publish({ type: "job", jobId: id, state: job.status, at: now });
    return job;
  }

  list(limit = 50): Job[] {
    return (this.db.query("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((row) => this.map(row));
  }

  cancel(id: string): Job {
    const now = Date.now();
    const changed = this.db.query(
      "UPDATE jobs SET status='cancelled', updated_at=?, done_at=?, lease_owner=NULL, lease_expires_at=NULL WHERE id=? AND status IN ('queued','leased')",
    ).run(now, now, id);
    if (changed.changes !== 1) throw new JobError("job is not cancellable");
    const job = this.get(id);
    this.events?.publish({ type: "job", jobId: id, state: "cancelled", at: now });
    return job;
  }

  private map(row: Record<string, unknown>): Job {
    return {
      id: String(row.id),
      type: String(row.type),
      executor: row.executor as JobExecutor,
      priority: Number(row.priority),
      course: row.course == null ? null : String(row.course),
      payload: JSON.parse(String(row.payload_json)),
      status: row.status as JobStatus,
      lease_owner: row.lease_owner == null ? null : String(row.lease_owner),
      lease_expires_at: row.lease_expires_at == null ? null : Number(row.lease_expires_at),
      attempts: Number(row.attempts),
      max_attempts: Number(row.max_attempts),
      result: row.result_json == null ? null : JSON.parse(String(row.result_json)),
      error: row.error == null ? null : String(row.error),
      dedupe_key: row.dedupe_key == null ? null : String(row.dedupe_key),
      created_by: String(row.created_by),
      created_at: Number(row.created_at),
      updated_at: Number(row.updated_at),
      done_at: row.done_at == null ? null : Number(row.done_at),
    };
  }
}

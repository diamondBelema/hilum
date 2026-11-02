import { describe, expect, test } from "bun:test";
import { openDb } from "../src/server/db.ts";
import { JobError, JobService } from "../src/server/jobs/service.ts";

describe("jobs", () => {
  test("deduplicates active jobs and leases exclusively", () => {
    const db = openDb(":memory:");
    const jobs = new JobService(db);
    const first = jobs.enqueue({
      type: "sort_file",
      payload: { path: "inbox/a.pdf" },
      dedupeKey: "sort:inbox/a.pdf",
    });
    const duplicate = jobs.enqueue({
      type: "sort_file",
      payload: { path: "inbox/a.pdf" },
      dedupeKey: "sort:inbox/a.pdf",
    });

    expect(duplicate.id).toBe(first.id);
    const leased = jobs.lease("worker-a");
    expect(leased?.id).toBe(first.id);
    expect(jobs.lease("worker-b")).toBeNull();
    expect(() => jobs.complete(first.id, "worker-b", { ok: true })).toThrow(JobError);
    expect(jobs.complete(first.id, "worker-a", { ok: true }).status).toBe("done");
    expect(jobs.enqueue({ type: "sort_file", dedupeKey: "sort:inbox/a.pdf" }).id).not.toBe(first.id);
    db.close();
  });

  test("requeues retryable failures and eventually fails", () => {
    const db = openDb(":memory:");
    const jobs = new JobService(db);
    const queued = jobs.enqueue({ type: "research", maxAttempts: 2 });

    const first = jobs.lease("worker-a")!;
    expect(first.attempts).toBe(1);
    expect(jobs.fail(first.id, "worker-a", "temporary", true).status).toBe("queued");
    const second = jobs.lease("worker-a")!;
    expect(second.attempts).toBe(2);
    expect(jobs.fail(second.id, "worker-a", "permanent", true).status).toBe("failed");
    db.close();
  });

  test("reclaims expired leases", () => {
    const db = openDb(":memory:");
    const jobs = new JobService(db);
    const queued = jobs.enqueue({ type: "vision_transcribe" });
    const leased = jobs.lease("worker-a")!;
    db.query("UPDATE jobs SET lease_expires_at = ? WHERE id = ?").run(Date.now() - 1, leased.id);
    expect(jobs.lease("worker-b")?.id).toBe(queued.id);
    db.close();
  });

  test("cancels queued jobs", () => {
    const db = openDb(":memory:");
    const jobs = new JobService(db);
    const job = jobs.enqueue({ type: "research", payload: { topic: "renal physiology" } });
    expect(jobs.cancel(job.id).status).toBe("cancelled");
    expect(() => jobs.cancel(job.id)).toThrow("not cancellable");
    db.close();
  });
});

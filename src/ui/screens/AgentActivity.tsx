import { useEffect, useState } from "react";
import { AlertTriangle, Check, Clock, Copy, Plug, RotateCw, X } from "lucide-react";
import { api, type Job } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Link } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";
import { navigate } from "../lib/router.ts";

function messageOfLocal(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function relativeAge(ms: number): string {
  const delta = Math.max(0, Date.now() - ms);
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return `${Math.floor(delta / 86_400_000)}d ago`;
}

export function AgentActivity() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .jobs(100)
      .then((next) => {
        if (!cancelled) {
          setJobs(next);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(messageOfLocal(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCancel = async (id: string) => {
    setError(null);
    setNotice(null);
    try {
      await api.cancelJob(id);
      setJobs((prev) => prev.map((job) => (job.id === id ? { ...job, status: "cancelled" } : job)));
      setNotice("Job cancelled.");
    } catch (err) {
      setError(messageOfLocal(err));
    }
  };

  const handlePauseLauncher = async () => {
    setError(null);
    setNotice(null);
    try {
      await api.stopAgent();
      setNotice("Launcher paused.");
      setJobs((prev) => prev.map((job) => (job.status === "leased" ? { ...job, status: "cancelled" } : job)));
    } catch (err) {
      setError(messageOfLocal(err));
    }
  };

  const byStatus: Record<string, Job[]> = {};
  for (const job of jobs) {
    byStatus[job.status] = [...(byStatus[job.status] ?? []), job];
  }

  const statusOrder = ["leased", "queued", "done", "failed", "cancelled"];
  const statusLabel: Record<string, string> = {
    leased: "Running",
    queued: "Queued",
    done: "Done",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  const statusVariant: Record<string, string> = {
    leased: "border-warning/40 bg-warning-soft text-warning",
    queued: "border-border-subtle bg-surface-2 text-text-muted",
    done: "border-correct/40 bg-correct-soft text-correct",
    failed: "border-incorrect/40 bg-incorrect-soft text-incorrect",
    cancelled: "border-border-subtle bg-surface-2 text-text-muted",
  };

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="type-title text-text">Agent activity</h1>
          <p className="type-body-sm mt-1 text-text-muted">
            Background jobs created by Hilum and the agent. Cancel a job to stop it; use Pause launcher to stop the agent.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePauseLauncher} disabled={loading}>
          <X aria-hidden="true" className="size-4" />
          Pause launcher
        </Button>
      </div>

      {error && (
        <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 type-body-sm text-incorrect">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-3 rounded-control border border-correct/40 bg-correct-soft p-3 type-body-sm text-correct">
          {notice}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {statusOrder.map((status) => {
          const statusJobs = byStatus[status] ?? [];
          if (statusJobs.length === 0) return null;
          return (
            <section key={status} className="rounded-panel border border-border-subtle bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-2 px-3 py-2">
                <span className="type-label text-text-muted">{statusLabel[status]}</span>
                <span className="type-meta text-text-muted">{statusJobs.length}</span>
              </div>
              <ul className="divide-y divide-border-subtle">
                {statusJobs.map((job) => {
                  const age = relativeAge(job.created_at);
                  const running = job.status === "leased" || job.status === "queued";
                  return (
                    <li key={job.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex size-6 shrink-0 items-center justify-center rounded-full border font-mono type-meta",
                              running
                                ? "border-warning/50 bg-warning-soft text-warning"
                                : status === "done"
                                  ? "border-correct/50 bg-correct-soft text-correct"
                                  : status === "failed"
                                    ? "border-incorrect/50 bg-incorrect-soft text-incorrect"
                                    : "border-border-strong text-text-muted",
                            )}
                          >
                            {running ? <RotateCw aria-hidden="true" className="size-3 animate-spin" /> : (
                              status === "done" ? <Check aria-hidden="true" className="size-3" /> : <Clock aria-hidden="true" className="size-3" />
                            )}
                          </span>
                          <span className="type-body-sm truncate font-medium text-text">{job.type}</span>
                          {job.course && (
                            <span className="type-meta text-text-muted">· {job.course}</span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 type-body-sm text-text-muted">
                          <span>{age}</span>
                          {job.attempts > 0 && <span>{job.attempts} attempt{job.attempts === 1 ? "" : "s"}</span>}
                          {job.dedupeKey && <span>dedupe</span>}
                        </div>
                        {job.error && (
                          <p className="mt-1 type-body-sm text-incorrect">{job.error}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {running && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void handleCancel(job.id)}
                            aria-label={`Cancel ${job.type}`}
                          >
                            <X aria-hidden="true" className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void navigator.clipboard.writeText(JSON.stringify(job.payload, null, 2))}
                          aria-label="Copy payload"
                        >
                          <Copy aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {jobs.length === 0 && !loading && !error && (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-6 text-center">
          <Plug aria-hidden="true" className="mx-auto size-12 text-text-muted" />
          <h2 className="type-heading mt-3 text-text">No background jobs</h2>
          <p className="type-body-sm mt-1 text-text-muted">
            Jobs appear here when uploads convert, concepts are mapped, or the agent runs work.
          </p>
        </div>
      )}
    </div>
  );
}

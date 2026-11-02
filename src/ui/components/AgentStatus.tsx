import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Plug, RotateCw, X, AlertCircle, AlertTriangle } from "lucide-react";
import { api, type AgentStatus, type Job, type SessionDetail } from "../api.ts";
import { apiUrl } from "../lib/desktop.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Button } from "./Button.tsx";
import { Popover } from "./Popover.tsx";
import { cn } from "../lib/cn.ts";
import { Link, navigate } from "../lib/router.ts";

function jobCountText(jobs: Job[]): string {
  const working = jobs.filter((job) => job.status === "queued" || job.status === "leased");
  return working.length > 0 ? ` (${working.length} job${working.length === 1 ? "" : "s"})` : "";
}

export function AgentStatus({ sessionId }: { sessionId: string | null }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const endpoint = apiUrl("/mcp");

  useEffect(() => {
    setDetail(null);
    setStatus(null);
    setJobs([]);
    if (!sessionId) return;
    let cancelled = false;
    const load = () => {
      api
        .session(sessionId)
        .then((next) => {
          if (!cancelled) setDetail(next);
        })
        .catch(() => {});
    };
    load();
    const unsubscribe = subscribeHarnessEvents((event) => {
      if ((event.type === "activity" || event.type === "session") && event.sessionId === sessionId) load();
      if (event.type === "launcher") void loadAgent();
      if (event.type === "job") void loadJobs();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  const loadAgent = async () => {
    try {
      setStatus(await api.agentStatus());
    } catch {
      /* keep previous status */
    }
  };

  const loadJobs = async () => {
    try {
      setJobs(await api.jobs(100));
    } catch {
      /* keep previous jobs */
    }
  };

  useEffect(() => {
    void loadAgent();
    void loadJobs();
  }, []);

  const connected = Boolean(detail?.agentConnected);
  const preparing = Boolean(connected && detail?.agentPreparing);
  const state = status?.state ?? "none";
  const error = status?.error ?? null;

  const text = state === "not_configured" || state === "none"
    ? "Agent not connected"
    : state === "starting"
      ? "Starting…"
      : state === "working"
        ? `Working${jobCountText(jobs)}`
        : state === "idle"
          ? "Idle"
          : `Failed: ${error ?? "agent failed"}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const pillVariant = state === "failed"
    ? "border-incorrect/40 bg-incorrect-soft text-incorrect"
    : state === "working" || state === "starting"
      ? "border-warning/40 bg-warning-soft text-warning"
      : state === "idle"
        ? "border-correct/40 bg-correct-soft text-correct"
        : "border-border-subtle bg-surface-2 text-text-muted";

  const icon = state === "failed" ? <AlertCircle aria-hidden="true" className="size-4" /> : (
    state === "working" || state === "starting" ? <RotateCw aria-hidden="true" className="size-4 animate-spin" /> : <Plug aria-hidden="true" className="size-4" />
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? labelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "type-meta inline-flex min-h-11 items-center gap-2 rounded-chip border px-3",
          pillVariant,
        )}
      >
        {icon}
        <span className="hidden sm:inline">{text}</span>
        <span className="sm:hidden">{state === "failed" ? "Failed" : connected ? (preparing ? "Preparing" : "Connected") : "No agent"}</span>
      </button>
      <Popover
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
        labelledBy={labelId}
        initialFocusRef={copyRef}
      >
        <h2 id={labelId} className="type-heading text-text">Agent connection</h2>
        <p className="type-body-sm mt-1 text-text-muted">
          {state === "failed"
            ? `Agent failed: ${error}. Check the launcher panel in Settings.`
            : state === "working"
              ? `Agent is working${jobCountText(jobs)}.`
              : state === "idle"
                ? "Agent is idle and ready for work."
                : state === "starting"
                  ? "Agent is starting up."
                  : connected
                    ? "An agent has checked in recently. Keep teaching in this session."
                    : "No agent is connected. Messages wait in the queue until one connects."}
        </p>
        {state === "working" && jobs.length > 0 && (
          <div className="mt-3">
            <p className="type-label text-text-muted">Jobs</p>
            <ul className="mt-1 space-y-1">
              {jobs
                .filter((job) => job.status === "queued" || job.status === "leased")
                .slice(0, 5)
                .map((job) => (
                  <li key={job.id} className="type-body-sm text-text-muted truncate">
                    {job.type}
                  </li>
                ))}
              {jobs.filter((job) => job.status === "queued" || job.status === "leased").length > 5 && (
                <li className="type-body-sm text-text-muted">…</li>
              )}
            </ul>
          </div>
        )}
        <p className="type-label mt-3 text-text-muted">MCP endpoint</p>
        <code className="type-code mt-1 block break-all rounded-control border border-border-subtle bg-surface-2 px-2 py-2 text-text">
          {endpoint}
        </code>
        <div className="flex flex-wrap gap-2 mt-2">
          <Button
            ref={copyRef}
            variant="secondary"
            size="sm"
            onClick={() => void copy()}
          >
            {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied ? "Copied" : "Copy endpoint"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
          >
            Open launcher
          </Button>
          <Link
            to="/agent"
            className="type-body-sm inline-flex min-h-11 shrink-0 items-center gap-2 font-medium"
          >
            Activity list
            <X aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {state === "failed" && (
          <div className="mt-2 flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
            <span className="type-body-sm text-text">An agent run failed. Open the launcher in Settings to inspect and restart.</span>
          </div>
        )}
      </Popover>
    </div>
  );
}

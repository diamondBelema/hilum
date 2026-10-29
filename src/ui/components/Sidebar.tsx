import { useMemo, useState } from "react";
import { BookOpen, Library, Plus, Search, Settings2 } from "lucide-react";
import type { Course, SessionDetail, SessionSummary } from "../api.ts";
import { Link } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";
import { Input } from "./Input.tsx";
import { SegmentedControl } from "./SegmentedControl.tsx";

type Filter = "teaching" | "practice" | "all";

export function Sidebar({
  courses,
  sessions,
  details,
  loading,
  activeSessionId,
  onNavigate,
}: {
  courses: Course[];
  sessions: SessionSummary[];
  details: Record<string, SessionDetail>;
  loading: boolean;
  activeSessionId: string | null;
  onNavigate?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      const practice = isPractice(session.goal);
      if (filter === "teaching" && practice) return false;
      if (filter === "practice" && !practice) return false;
      if (!query) return true;
      const course = courses.find((item) => item.code === session.course);
      return (
        session.goal.toLowerCase().includes(query) ||
        session.course.toLowerCase().includes(query) ||
        (course?.title.toLowerCase().includes(query) ?? false)
      );
    });
  }, [courses, filter, search, sessions]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <img src="/icon.svg" alt="" aria-hidden="true" className="size-6 rounded-control" />
        <span className="type-body-sm font-semibold tracking-tight text-text">Hilum</span>
      </div>

      <div className="shrink-0 space-y-2 p-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="type-body-sm flex min-h-11 items-center gap-2 rounded-control border border-border-subtle px-3 font-medium text-text hover:bg-surface-2"
        >
          <Plus aria-hidden="true" className="size-5" />
          New session
        </Link>

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
            className="pl-9"
          />
        </div>

        <SegmentedControl
          label="Session type"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "teaching", label: "Teaching" },
            { value: "practice", label: "Practice" },
            { value: "all", label: "All" },
          ]}
          className="flex w-full"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <p className="type-label px-2 py-2 text-text-muted">Sessions</p>
        {loading ? (
          <p className="type-body-sm px-2 py-3 text-text-muted">Loading sessions…</p>
        ) : filtered.length === 0 ? (
          <p className="type-body-sm px-2 py-3 text-text-muted">
            {search.trim()
              ? "No sessions match that search."
              : filter === "all"
                ? "No sessions yet. Start with a goal above."
                : `No ${filter} sessions yet.`}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {filtered.map((session) => {
              const course = courses.find((item) => item.code === session.course);
              const detail = details[session.id];
              const title = sessionTitle(session.goal);
              const status = statusFor(session, detail);
              return (
                <li key={session.id}>
                  <Link
                    to={`/sessions/${session.id}`}
                    onClick={onNavigate}
                    aria-current={activeSessionId === session.id ? "page" : undefined}
                    title={`${title} — ${status}`}
                    className={cn(
                      "flex min-h-11 flex-col justify-center gap-0.5 rounded-control border px-2.5 py-2",
                      activeSessionId === session.id
                        ? "border-primary bg-primary-soft"
                        : "border-transparent hover:border-border-subtle hover:bg-surface-2",
                    )}
                  >
                    <span className="type-body-sm truncate font-medium text-text">{title}</span>
                    <span className="type-meta truncate text-text-muted">
                      {course?.code ?? session.course} · {relativeTime(session.startedAt)} ·{" "}
                      {shortStatus(status)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <nav aria-label="Secondary" className="shrink-0 border-t border-border-subtle p-2">
        <Link
          to="/library"
          onClick={onNavigate}
          className="type-body-sm flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <Library aria-hidden="true" className="size-5" />
          Library
        </Link>
        <Link
          to="/settings"
          onClick={onNavigate}
          className="type-body-sm flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-text-muted hover:bg-surface-2 hover:text-text"
        >
          <Settings2 aria-hidden="true" className="size-5" />
          Settings
        </Link>
        <p className="type-meta mt-1 flex items-start gap-2 px-2 py-1 text-text-muted">
          <BookOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Sessions are the product. Library is quiet.
        </p>
      </nav>
    </div>
  );
}

export function sessionTitle(goal: string): string {
  const title = goal.replace(/^practice:\s*/i, "").trim();
  return title || "Untitled session";
}

export function isPractice(goal: string): boolean {
  return /^practice\b/i.test(goal.trim());
}

export function shortStatus(status: string): string {
  switch (status) {
    case "Waiting for your answer":
      return "Waiting";
    case "Agent working":
      return "Working";
    case "Agent connected":
      return "Connected";
    case "Agent not connected":
      return "No agent";
    default:
      return status;
  }
}

export function statusFor(summary: SessionSummary, detail?: SessionDetail): string {
  if (summary.endedAt) return "Ended";
  if (!detail) return "Active";
  if (detail.activities.some((activity) => activity.status === "pending")) return "Waiting for your answer";
  if (detail.agentConnected && detail.agentPreparing) return "Agent working";
  if (detail.agentConnected) return "Agent connected";
  return "Agent not connected";
}

export function relativeTime(timestamp: number): string {
  const ms = Date.now() - timestamp;
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const date = new Date(timestamp);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

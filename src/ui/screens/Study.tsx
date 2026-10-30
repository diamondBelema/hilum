import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  Play,
  RefreshCw,
  Sparkles,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api, type Course, type Dashboard, type SessionDetail, type SessionSummary } from "../api.ts";
import { plural } from "../lib/format.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Button } from "../components/Button.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Banner, Chip, EmptyState, ProgressBar, Skeleton } from "../components/ui.tsx";

export function Study({
  courses,
  openNotes,
  onStudy,
  onExams,
}: {
  courses: Course[];
  openNotes: (course: Course) => void;
  onStudy: (course: string, conceptId?: string) => void;
  onExams: () => void;
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<SessionDetail | null>(null);
  const [composerText, setComposerText] = useState("");
  const [composerMode, setComposerMode] = useState<"teach" | "practice">("teach");
  const [queuing, setQueuing] = useState(false);
  const [queued, setQueued] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(false);

  function load() {
    setLoading(true);
    setSessionsLoading(true);
    Promise.all([api.dashboard(), api.sessionHistory()])
      .then(([dashboard, sessions]) => {
        setDashboard(dashboard);
        setSessions(sessions);
      })
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => {
        setLoading(false);
        setSessionsLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;
    api
      .dashboard()
      .then((value) => !cancelled && setDashboard(value))
      .catch((err: unknown) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    api
      .sessionHistory()
      .then((sessions) => !cancelled && setSessions(sessions))
      .catch(() => !cancelled && setSessions([]))
      .finally(() => !cancelled && setSessionsLoading(false));
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .activeSession()
      .then((session) => !cancelled && setActiveSession(session))
      .catch(() => !cancelled && setActiveSession(null));
    const timer = setInterval(() => {
      api.activeSession().then((session) => !cancelled && setActiveSession(session)).catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const noteCount = courses.reduce((sum, course) => sum + course.notes, 0);
  const hasTopics = Boolean(dashboard && dashboard.counts.total > 0);
  const due = dashboard?.due ?? [];
  const next = dashboard?.next ?? [];
  const connected = Boolean(activeSession?.agentConnected);
  const preparing = Boolean(connected && activeSession?.agentPreparing);

  async function queueRequest() {
    const text = composerText.trim();
    if (!text) return;
    setQueued(false);
    setError(null);
    setQueuing(true);
    try {
      let session = activeSession;
      if (!session) {
        const course = courses.find((item) => item.notes > 0 || item.concepts > 0) ?? courses[0];
        if (!course) {
          setError("Add a course first, then ask something to learn.");
          return;
        }
        session = await api.startSession(course.code, "learn");
        setActiveSession(session);
      }
      await api.askAgent(session.id, text);
      setComposerText("");
      setQueued(true);
      setNotice("Request queued. The agent will pick it up on its next check.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setQueuing(false);
    }
  }

  function messageOf(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Study</h1>
      <p className="reading mt-1 text-sm text-text-muted">
        Read your notes and see what is ready to practise. Everything stays on this device.
      </p>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {notice && (
        <div className="mt-4">
          <Banner tone="success" role="status">
            {notice}
          </Banner>
        </div>
      )}

      {/* Composer: "What do you want to learn?" */}
      <section className="mt-7 rounded-panel border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono tracking-wider uppercase text-text-muted">Composer</p>
            <label className="block text-sm font-semibold">What do you want to learn?</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                type="text"
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void queueRequest();
                  }
                }}
                className="reading min-h-11 flex-1 rounded-control border border-border-strong bg-bg px-3 text-sm focus:border-primary"
                placeholder="For example: explain the proximal convoluted tubule"
              />
              <div className="flex items-center gap-1 border border-border-strong rounded-control bg-surface">
                <button
                  type="button"
                  role="radio"
                  aria-checked={composerMode === "teach"}
                  onClick={() => setComposerMode("teach")}
                  className={`px-3 py-2 text-sm font-medium rounded-l-control ${
                    composerMode === "teach"
                      ? "bg-primary-soft text-primary"
                      : "text-text-muted hover:bg-surface-2"
                  }`}
                >
                  Teach
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={composerMode === "practice"}
                  onClick={() => setComposerMode("practice")}
                  className={`px-3 py-2 text-sm font-medium rounded-r-control ${
                    composerMode === "practice"
                      ? "bg-primary-soft text-primary"
                      : "text-text-muted hover:bg-surface-2"
                  }`}
                >
                  Practice
                </button>
              </div>
              <Button
                variant="primary"
                onClick={() => void queueRequest()}
                loading={queuing}
                disabled={!composerText.trim()}
              >
                {queued ? <span>Queued</span> : <span>Ask</span>}
              </Button>
            </div>
            {composerMode === "practice" && (
              <p className="mt-2 text-xs text-text-muted">
                Practice opens banked questions for your topics.
              </p>
            )}
            {!connected && (
              <p className="mt-2 text-xs text-text-muted">
                No agent is connected right now.{" "}
                <span className="font-medium">Practice</span> still works; teach requests wait until an agent
                connects over MCP.
              </p>
            )}
          </div>
          <AgentStatus connected={connected} preparing={preparing} session={activeSession} />
        </div>
      </section>

      {loading && !dashboard ? (
        <div className="mt-6 space-y-4">
          <Skeleton lines={2} />
          <Skeleton lines={4} />
          <Skeleton lines={4} />
        </div>
      ) : (
        <>
          {!hasTopics && (
            <div className="mt-5">
              <Banner tone="info">
                No topics yet. Ask a teaching agent to extract cited concepts from your notes, then
                the frontier and review queue appear here.
              </Banner>
            </div>
          )}

          <section aria-labelledby="next-heading" className="mt-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="next-heading" className="text-base font-semibold">
                Next up
              </h2>
              {dashboard && (
                <p className="font-mono text-xs tabular-nums text-text-muted">
                  {dashboard.counts.mastered} of {dashboard.counts.total} mastered
                </p>
              )}
            </div>
            {next.length === 0 ? (
              <p className="reading mt-2 text-sm text-text-muted">
                {hasTopics
                  ? "Nothing in the frontier right now. Review due topics or take a mock exam."
                  : "Topics appear after the first cited concept is added."}
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {next.map((item, index) => (
                  <li key={item.concept.id} className="flex items-center gap-3 py-3">
                    <MasteryRing state={item.concept.mastery.state} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text">{item.concept.title}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {item.concept.course} · {item.reason}
                        {item.concept.status === "proposed" ? " · Proposed" : ""}
                        {item.concept.examWeight > 0 ? ` · ${Math.round(item.concept.examWeight * 100)}% exam weight` : ""}
                      </p>
                    </div>
                    <Button
                      variant={index === 0 ? "primary" : "secondary"}
                      onClick={() => onStudy(item.concept.course, item.concept.id)}
                      aria-label={`Study ${item.concept.title}`}
                    >
                      <Play aria-hidden="true" className="size-4" />
                      Study this
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="due-heading" className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="due-heading" className="text-base font-semibold">
                Due for review
              </h2>
              <span className="font-mono text-xs tabular-nums text-text-muted">{due.length}</span>
            </div>
            {due.length === 0 ? (
              <p className="reading mt-2 text-sm text-text-muted">
                No reviews due. Mastered topics return here after their retrieval interval.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3 border-y border-border-subtle py-3">
                <RefreshCw aria-hidden="true" className="size-5 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {plural(due.length, "topic")} overdue
                  </p>
                  <p className="mt-0.5 truncate text-xs text-text-muted">
                    {due
                      .slice(0, 3)
                      .map((concept) => concept.title)
                      .join(", ")}
                    {due.length > 3 ? ` and ${due.length - 3} more` : ""}
                  </p>
                </div>
                <Button variant="primary" onClick={() => onStudy(due[0]!.course, due[0]!.id)}>
                  Start review
                </Button>
              </div>
            )}
          </section>

          <section aria-labelledby="exams-heading" className="mt-8">
            <h2 id="exams-heading" className="text-base font-semibold">
              Exams
            </h2>
            {dashboard && dashboard.exams.length > 0 ? (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {dashboard.exams.map((exam) => (
                  <li key={exam.course} className="flex flex-wrap items-center gap-3 py-3">
                    <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{exam.title}</p>
                      <p className="mt-0.5 text-xs whitespace-nowrap text-text-muted">
                        {new Date(`${exam.examDate}T00:00:00`).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="rounded-chip bg-surface-2 px-2.5 py-1 font-mono text-xs tabular-nums">
                      {exam.days < 0 ? `${Math.abs(exam.days)} days ago` : `${exam.days} days`}
                    </span>
                    <Button
                      className="w-full sm:ml-auto sm:w-auto"
                      onClick={onExams}
                      aria-label={`Take a mock exam for ${exam.title}`}
                    >
                      Take a mock exam
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 flex items-start gap-3 border-y border-border-subtle py-3">
                <CalendarClock aria-hidden="true" className="mt-0.5 size-5 text-text-muted" />
                <div>
                  <p className="text-sm text-text">No exam dates set</p>
                  <p className="mt-1 text-sm text-text-muted">
                    Add the real paper format and date in the course file to see a countdown here.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section aria-labelledby="courses-heading" className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="courses-heading" className="text-base font-semibold">
                Courses
              </h2>
              <p className="font-mono text-xs tabular-nums text-text-muted">
                {plural(courses.length, "course")} · {plural(noteCount, "note")}
              </p>
            </div>

            {courses.length === 0 ? (
              <div className="mt-4 rounded-panel border border-border-subtle bg-surface p-5">
                <GraduationCap aria-hidden="true" className="size-6 text-text-muted" />
                <h3 className="mt-2 text-sm font-semibold">No courses yet</h3>
                <p className="reading mt-1 text-sm text-text-muted">
                  Put your slides in the inbox and run the converter. Then ask an agent to write questions
                  from them.
                </p>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {courses.map((course) => {
                  const progress = dashboard?.courses.find((item) => item.code === course.code);
                  return (
                    <li key={course.code} className="py-3">
                      <div className="flex items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <h3 className="text-sm font-semibold text-text">{course.title}</h3>
                            <span className="font-mono text-xs text-text-muted">{course.code}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-text-muted">
                            {course.department ?? "No department"} · {plural(course.notes, "note")}
                            {progress ? ` · ${progress.mastered} of ${progress.total} mastered` : ""}
                          </p>
                        </div>
                        <Button onClick={() => openNotes(course)} aria-label={`Open notes for ${course.title}`}>
                          <BookOpen aria-hidden="true" className="size-4" />
                          Notes
                        </Button>
                      </div>
                      {progress && progress.highWeightTotal > 0 && (
                        <div className="mt-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <ProgressBar label="High-weight topics mastered" value={progress.percent} />
                          </div>
                          {progress.due > 0 && <Chip>{plural(progress.due, "review")} due</Chip>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="sessions-heading" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 id="sessions-heading" className="text-base font-semibold">
                  Sessions
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  Recent teaching sessions. Open one in Live to continue.
                </p>
              </div>
              <label className="min-w-56 flex-1">
                <span className="sr-only">Search sessions</span>
                <input
                  type="search"
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-sm focus:border-primary"
                  placeholder="Search sessions…"
                />
              </label>
            </div>
            {sessionsLoading && sessions.length === 0 ? (
              <div className="mt-2 space-y-1">
                <Skeleton lines={1} />
                <Skeleton lines={1} />
              </div>
            ) : sessions.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                No sessions yet. Start one from Live or queue a teach request above.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {sessions
                  .filter(
                    (session) =>
                      !sessionSearch ||
                      session.course.toLowerCase().includes(sessionSearch.toLowerCase()) ||
                      session.goal.toLowerCase().includes(sessionSearch.toLowerCase()),
                  )
                  .map((session) => (
                    <li key={session.id} className="py-3 flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-semibold text-text truncate">
                            {session.course} · {session.goal}
                          </p>
                          <span className="font-mono text-xs text-text-muted">
                            {relativeTime(session.startedAt)}
                          </span>
                        </div>
                        {session.summary && (
                          <p className="mt-0.5 text-xs text-text-muted truncate max-w-[42ch]">
                            {session.summary}
                          </p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                          {session.endedAt ? (
                            <span>· ended</span>
                          ) : (
                            <span className="text-warning">· active</span>
                          )}
                          {session.notePath && (
                            <span>· note saved</span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

function AgentStatus({
  connected,
  preparing,
  session,
}: {
  connected: boolean;
  preparing: boolean;
  session: SessionDetail | null;
}) {
  const label = !connected
    ? "Agent not connected"
    : preparing
      ? "Agent is preparing"
      : "Agent connected";
  const detail = !connected
    ? "Teach requests queue until an agent connects."
    : preparing
      ? "Choosing the next activity for you."
      : "Ask something to learn, or practise below.";
  return (
    <div
      className={`flex items-center gap-2 rounded-control border px-3 py-2 text-xs ${
        !connected
          ? "border-border-subtle bg-surface-2 text-text-muted"
          : preparing
            ? "border-warning/40 bg-warning-soft text-text"
            : "border-correct/30 bg-correct-soft text-text"
      }`}
      role="status"
      aria-live="polite"
    >
      {connected ? (
        preparing ? (
          <Timer aria-hidden="true" className="size-3.5 shrink-0 text-warning" />
        ) : (
          <Wifi aria-hidden="true" className="size-3.5 shrink-0 text-correct" />
        )
      ) : (
        <WifiOff aria-hidden="true" className="size-3.5 shrink-0 text-text-muted" />
      )}
      <p className="font-medium text-text">{label}</p>
      <p className="text-xs">{detail}</p>
      {session && (
        <span className="ml-auto text-xs text-text-muted">Live</span>
      )}
    </div>
  );
}

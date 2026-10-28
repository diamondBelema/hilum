import { useCallback, useEffect, useState } from "react";
import {
  BookmarkPlus,
  BookOpen,
  Check,
  Circle,
  ClipboardList,
  MessageCircleQuestion,
  Play,
  Send,
  Sparkles,
  Timer,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api, type Course, type SessionDetail } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { Banner, Chip, EmptyState, Skeleton } from "../components/ui.tsx";
import { ActivityRenderer } from "../components/ActivityRenderer.tsx";
import { buildResponse, initialValues, missingAnswers } from "../lib/activity.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";

const GOALS = [
  { value: "learn", label: "Learn something new" },
  { value: "review", label: "Review weak topics" },
  { value: "exam", label: "Prepare for an exam" },
];

export function Live({
  courses,
  target,
  onOpenNote,
  onOpenExams,
}: {
  courses: Course[];
  target?: { course: string; conceptId?: string; nonce: number } | null;
  onOpenNote: (path: string, anchor?: string) => void;
  onOpenExams: () => void;
}) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [courseCode, setCourseCode] = useState("");
  const [goal, setGoal] = useState("learn");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<unknown[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [activityStartedAt, setActivityStartedAt] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [requestText, setRequestText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [ending, setEnding] = useState(false);
  const [banking, setBanking] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!courseCode && courses[0]) setCourseCode(courses[0].code);
  }, [courses, courseCode]);

  useEffect(() => {
    if (!target) return;
    setCourseCode(target.course);
    setGoal("review");
  }, [target?.nonce]);

  useEffect(() => {
    let cancelled = false;
    api
      .activeSession()
      .then((active) => {
        if (cancelled) return;
        setSession(active);
        setCourseCode(active?.course ?? target?.course ?? courses[0]?.code ?? "");
      })
      .catch((err: unknown) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const next = await api.session(id);
      setSession((current) => (current?.id === id ? next : current));
    } catch {
      /* the session may have gone away; the next navigation will recover */
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const id = session.id;
    const unsubscribe = subscribeHarnessEvents((event) => {
      if ((event.type === "activity" || event.type === "session") && event.sessionId === id) {
        void refresh(id);
      }
    });
    const timer = setInterval(() => void refresh(id), 4000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [session?.id, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activity = session?.activity ?? null;
  useEffect(() => {
    if (!activity) return;
    setValues(initialValues(activity.spec));
    setSubmitted(activity.status !== "pending");
    setActivityStartedAt(Date.now());
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.id, activity?.status]);

  async function start() {
    if (!courseCode) return;
    setStarting(true);
    setError(null);
    try {
      const focus = target?.course === courseCode && target.conceptId;
      const created = await api.startSession(courseCode, focus ? `topic:${focus}` : goal);
      setSession(created);
      setSummary("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setStarting(false);
    }
  }

  async function submit() {
    if (!session || !activity) return;
    const missing = missingAnswers(activity.spec, values);
    if (missing.length > 0) {
      setError(`Still needed: ${missing.join(", ")}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.respondActivity(
        session.id,
        activity.id,
        buildResponse(activity.spec, values),
        Math.round((Date.now() - activityStartedAt) / 1000),
      );
      setSession((current) =>
        current
          ? {
              ...current,
              activity: updated,
              activities: [updated, ...current.activities.filter((item) => item.id !== updated.id)],
            }
          : current,
      );
      setSubmitted(true);
      setNotice("Response sent. Waiting for the agent to pick it up.");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendRequest(text: string) {
    if (!session) return;
    const clean = text.trim();
    if (!clean) return;
    try {
      await api.askAgent(session.id, clean);
      setRequestText("");
      setNotice("Request queued. The agent will see it on its next check.");
      void refresh(session.id);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function keepActivity() {
    if (!session || !activity) return;
    setBanking(true);
    setError(null);
    try {
      const saved = await api.bankActivity(activity.id);
      setNotice(`Kept in the vault at ${saved.path}.`);
      setSession((current) =>
        current
          ? {
              ...current,
              activity: current.activity
                ? { ...current.activity, banked: true, bankedPath: saved.path }
                : current.activity,
              activities: current.activities.map((item) =>
                item.id === activity.id ? { ...item, banked: true, bankedPath: saved.path } : item,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBanking(false);
    }
  }

  async function endSession() {
    if (!session) return;
    setEnding(true);
    setError(null);
    try {
      const ended = await api.endSession(session.id, summary);
      setSession(ended);
      setEndOpen(false);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setEnding(false);
    }
  }

  function reportRenderError(activityId: string, message: string) {
    if (!session) return;
    void api.renderError(session.id, activityId, message).catch(() => {});
  }

  const course = courses.find((item) => item.code === session?.course);
  const missing = activity ? missingAnswers(activity.spec, values) : [];
  const ended = Boolean(session?.endedAt);
  const connected = Boolean(session?.agentConnected);
  const preparing = Boolean(connected && session?.agentPreparing);
  const waitFrom =
    activity?.answeredAt ??
    session?.requests[0]?.createdAt ??
    activity?.createdAt ??
    session?.startedAt ??
    now;
  const waitingSec = Math.max(0, Math.floor((now - waitFrom) / 1000));
  const firstCite = session?.activity?.cites[0];

  useEffect(() => {
    if (ended) setSubmitted(true);
  }, [ended]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton lines={2} />
        <Skeleton lines={6} />
        <Skeleton lines={10} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Live session</h1>
          <p className="mt-1 text-sm text-text-muted">
            Teach with your agent at the pace that fits. Every answer becomes evidence.
          </p>
        </div>
        {session && (
          <Chip className="capitalize">
            <Sparkles aria-hidden="true" className="size-3.5" />
            {course?.title ?? session.course} · {session.goal}
          </Chip>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {!session ? (
        <div className="mt-6">
          <section className="rounded-panel border border-border-subtle bg-surface p-5">
            <h2 className="text-base font-semibold">Start a teaching session</h2>
            <p className="reading mt-2 text-sm text-text-muted">
              The app works without an agent. Connect a teaching agent over MCP to compose live activities,
              diagnose your reasoning and leave a session note in the vault.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Course
                <select
                  value={courseCode}
                  onChange={(event) => setCourseCode(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-control border border-border bg-bg px-3 text-sm"
                >
                  {courses.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Goal
                <select
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  className="mt-1.5 min-h-11 w-full rounded-control border border-border bg-bg px-3 text-sm"
                >
                  {GOALS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => void start()} loading={starting} disabled={!courseCode}>
                <Play aria-hidden="true" className="size-4" />
                Start session
              </Button>
              <Button variant="ghost" onClick={onOpenExams}>
                Practice saved questions instead
              </Button>
            </div>
          </section>
          <div className="mt-4 rounded-panel border border-border-subtle bg-surface-2 p-4 text-sm text-text-muted">
            <p className="font-medium text-text">Agent not connected</p>
            <p className="reading mt-1">
              Open your teacher agent and ask it to call <code className="font-mono text-xs">session_start</code> for
              {" "}{courses[0]?.code ?? "your course"}. It connects to the local MCP server at <code className="font-mono text-xs">/mcp</code>.
            </p>
          </div>
        </div>
      ) : ended ? (
        <EndedSession
          session={session}
          course={course}
          onNew={() => {
            setSession(null);
            setNotice(null);
          }}
          onOpenNote={onOpenNote}
        />
      ) : (
        <>
          <StatusStrip
            connected={connected}
            preparing={preparing}
            waitingSec={waitingSec}
            activity={activity}
            onReadNote={() => firstCite && onOpenNote(firstCite.note, firstCite.anchor)}
            onOpenExams={onOpenExams}
            hasCite={Boolean(firstCite)}
          />

          {notice && (
            <div className="mt-3">
              <Banner tone="success" role="status">
                {notice}
              </Banner>
            </div>
          )}

          {!activity ? (
            <div className="mt-5">
              <EmptyState title="The session is ready">
                Waiting for the agent's first activity. You can ask for something specific, or read the course index
                while it prepares.
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => setAskOpen(true)}>
                    <MessageCircleQuestion aria-hidden="true" className="size-4" /> Ask the agent
                  </Button>
                  <Button onClick={onOpenExams}>
                    <ClipboardList aria-hidden="true" className="size-4" /> Practice saved questions
                  </Button>
                </div>
              </EmptyState>
            </div>
          ) : activity.renderError || activity.status === "error" ? (
            <div className="mt-5">
              <Banner tone="error">
                This activity could not be displayed. The agent has been told and will send a replacement.
              </Banner>
              <div className="mt-3">
                <Button onClick={() => setAskOpen(true)}>Ask the agent about it</Button>
              </div>
            </div>
          ) : submitted ? (
            <div className="mt-5 rounded-panel border border-correct/30 bg-correct-soft p-5">
              <div className="flex items-start gap-3">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-correct" />
                <div>
                  <h2 className="font-semibold text-text">Answer sent</h2>
                  <p className="reading mt-1 text-sm text-text-muted">
                    {preparing
                      ? `The agent has your response and is choosing what to teach next. ${waitingSec}s so far.`
                      : "Saved as evidence. The agent will pick it up when it checks the session."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => setAskOpen(true)}>
                      <MessageCircleQuestion aria-hidden="true" className="size-4" /> Ask the agent
                    </Button>
                    {activity.cites.some((cite) => cite.quote) && (
                      <Button
                        onClick={() => void keepActivity()}
                        loading={banking}
                        disabled={activity.banked}
                      >
                        <BookmarkPlus aria-hidden="true" className="size-4" />
                        {activity.banked ? "Saved to vault" : "Keep this"}
                      </Button>
                    )}
                  </div>
                  {activity.bankedPath && (
                    <p className="mt-2 break-all font-mono text-xs text-text-muted">{activity.bankedPath}</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5">
              <ActivityRenderer
                activityId={activity.id}
                spec={activity.spec}
                values={values}
                onChange={(index, value) =>
                  setValues((current) => {
                    const next = [...current];
                    next[index] = value;
                    return next;
                  })
                }
                disabled={submitting}
                onOpenNote={onOpenNote}
                onRenderError={reportRenderError}
              />
              {missing.length > 0 && (
                <p className="mt-3 text-xs text-text-muted">Still needed: {missing.join(", ")}.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void submit()} loading={submitting} disabled={missing.length > 0}>
                  <Send aria-hidden="true" className="size-4" /> Send answer
                </Button>
                <Button variant="ghost" onClick={() => setAskOpen(true)}>
                  <MessageCircleQuestion aria-hidden="true" className="size-4" /> Ask the agent
                </Button>
                <Button variant="ghost" onClick={() => setEndOpen(true)}>
                  <X aria-hidden="true" className="size-4" /> End session
                </Button>
              </div>
            </div>
          )}

          {session.requests.filter((item) => item.status === "open").length > 0 && (
            <div className="mt-5 rounded-panel border border-border-subtle bg-surface-2 p-3 text-sm">
              <p className="font-medium">Queued for the agent</p>
              <ul className="mt-2 space-y-1 text-text-muted">
                {session.requests
                  .filter((item) => item.status === "open")
                  .map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <Circle aria-hidden="true" className="size-2 fill-current" />
                      {item.text}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {session.activities.length > 1 && (
            <details className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
              <summary className="cursor-pointer text-sm font-medium">Earlier in this session ({session.activities.length - 1})</summary>
              <ul className="mt-3 space-y-2">
                {session.activities
                  .filter((item) => item.id !== activity?.id)
                  .slice(0, 8)
                  .map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-text-muted">
                      <span className="truncate">{item.title}</span>
                      <span className="shrink-0 text-xs capitalize">
                        {item.status} · {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <span>
              <Timer aria-hidden="true" className="mr-1 inline size-3.5" />
              Session started {new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {session.evidenceCount} evidence {session.evidenceCount === 1 ? "record" : "records"}
            </span>
            <button type="button" onClick={() => setEndOpen(true)} className="hover:text-text">
              End session
            </button>
          </div>
        </>
      )}

      <Sheet open={askOpen} title="Ask the agent" onClose={() => setAskOpen(false)}>
        <div className="flex flex-wrap gap-2">
          {["Explain this", "Quiz me", "I am confused", "Go slower"].map((text) => (
            <Button key={text} onClick={() => void sendRequest(text)} disabled={!session}>
              {text}
            </Button>
          ))}
        </div>
        <label className="mt-4 block text-sm font-medium">
          Or write a request
          <textarea
            value={requestText}
            onChange={(event) => setRequestText(event.target.value)}
            rows={3}
            className="reading mt-1.5 w-full rounded-control border border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
            placeholder="What would help right now?"
          />
        </label>
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={() => void sendRequest(requestText)} disabled={!requestText.trim() || !session}>
            <Send aria-hidden="true" className="size-4" /> Queue request
          </Button>
        </div>
        <p className="reading mt-3 text-xs text-text-muted">
          Requests wait in the session. The agent sees them on its next check; nothing is sent over the internet.
        </p>
      </Sheet>

      <Sheet open={endOpen} title="End session" onClose={() => setEndOpen(false)}>
        <p className="reading text-sm text-text-muted">
          Ending writes a session note to the course vault with your summary and the activity log. Evidence is kept.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Summary for the note
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            rows={5}
            className="reading mt-1.5 w-full rounded-control border border-border bg-bg p-3 text-sm focus:border-primary focus:outline-none"
            placeholder="What did you learn? What still feels shaky?"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setEndOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void endSession()} loading={ending}>
            End and write note
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function StatusStrip({
  connected,
  preparing,
  waitingSec,
  activity,
  onReadNote,
  onOpenExams,
  hasCite,
}: {
  connected: boolean;
  preparing: boolean;
  waitingSec: number;
  activity: SessionDetail["activity"];
  onReadNote: () => void;
  onOpenExams: () => void;
  hasCite: boolean;
}) {
  const label = !connected
    ? "Agent not connected"
    : preparing
      ? "Agent is preparing the next activity"
      : "Agent connected";
  const detail = !connected
    ? "The app still works. Read a note or practise saved questions while you wait."
    : preparing
      ? `${waitingSec}s${waitingSec >= 20 ? " · still working" : ""}`
      : "Answer below and the agent will pick up your response.";
  return (
    <div
      className={`mt-5 rounded-panel border px-4 py-3 ${
        !connected
          ? "border-border-subtle bg-surface-2"
          : preparing
            ? "border-warning/40 bg-warning-soft"
            : "border-correct/30 bg-correct-soft"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        {connected ? (
          preparing ? (
            <Timer aria-hidden="true" className="size-4 shrink-0 text-warning" />
          ) : (
            <Wifi aria-hidden="true" className="size-4 shrink-0 text-correct" />
          )
        ) : (
          <WifiOff aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
        )}
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-text-muted">{detail}</p>
        {preparing && activity && (
          <span className="ml-auto font-mono text-xs text-text-muted">{waitingSec}s</span>
        )}
      </div>
      {preparing && waitingSec >= 20 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasCite && (
            <Button onClick={onReadNote}>
              <BookOpen aria-hidden="true" className="size-4" /> Read the note
            </Button>
          )}
          <Button onClick={onOpenExams}>
            <ClipboardList aria-hidden="true" className="size-4" /> Practice saved questions
          </Button>
          <p className="reading w-full text-xs text-text-muted">
            Still working. You can read the note or practise saved questions meanwhile.
          </p>
        </div>
      )}
      {!connected && (
        <div className="mt-3 flex flex-wrap gap-2">
          {hasCite && (
            <Button onClick={onReadNote}>
              <BookOpen aria-hidden="true" className="size-4" /> Read the note
            </Button>
          )}
          <Button onClick={onOpenExams}>
            <ClipboardList aria-hidden="true" className="size-4" /> Practice saved questions
          </Button>
        </div>
      )}
    </div>
  );
}

function EndedSession({
  session,
  course,
  onNew,
  onOpenNote,
}: {
  session: SessionDetail;
  course?: Course;
  onNew: () => void;
  onOpenNote: (path: string, anchor?: string) => void;
}) {
  return (
    <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-5">
      <div className="flex items-start gap-3">
        <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-correct" />
        <div>
          <h2 className="text-base font-semibold">Session ended</h2>
          <p className="mt-1 text-sm text-text-muted">
            {course?.title ?? session.course} · {session.activities.length} activities · {session.evidenceCount} evidence records
          </p>
          {session.summary && <p className="reading mt-3 text-sm">{session.summary}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {session.notePath && (
              <Button variant="primary" onClick={() => onOpenNote(session.notePath ?? "")}>
                <BookOpen aria-hidden="true" className="size-4" /> Open session note
              </Button>
            )}
            <Button onClick={onNew}>Start another session</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

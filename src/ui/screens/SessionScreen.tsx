import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Timer } from "lucide-react";
import { api, type Course, type SessionDetail, type SessionActivity, type Cite } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Banner } from "../components/ui.tsx";
import { ActivityRenderer } from "../components/ActivityRenderer.tsx";
import { Composer, type ComposerMode } from "../components/Composer.tsx";
import { Markdown } from "../Markdown.tsx";
import { buildResponse, initialValues, missingAnswers } from "../lib/activity.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { cn } from "../lib/cn.ts";

type SessionScreenProps = {
  sessionId: string;
  onClose: () => void;
  onNewSession: (course: import("../api.ts").Course | null) => void;
};

export function SessionScreen({ sessionId, onClose, onNewSession }: SessionScreenProps) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [renderErrorCount, setRenderErrorCount] = useState(0);

  // Fetch the session once on mount; keep it in sync via SSE instead of polling.
  useEffect(() => {
    let cancelled = false;
    api
      .session(sessionId)
      .then((detail) => {
        if (!cancelled) {
          setSession(detail);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Load courses for the composer course chip.
  useEffect(() => {
    let cancelled = false;
    api
      .courses()
      .then((list) => {
        if (!cancelled) setCourses(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // SSE subscription for live session updates (replaces the 4-second full refetch).
  useEffect(() => {
    if (!session) return;
    const id = session.id;
    const unsubscribe = subscribeHarnessEvents((event) => {
      if ((event.type === "activity" || event.type === "session") && event.sessionId === id) {
        void api
          .session(id)
          .then((next) => setSession((current) => (current?.id === id ? next : current)))
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [session?.id]);

  const currentCourse = courses.find((c) => c.code === session?.course) ?? null;

  // Find the newest unanswered activity for the interactive area.
  const activity = session?.activities.find((a) => a.status === "pending") ?? null;

  const [values, setValues] = useState<unknown[]>([]);
  const [activityStartedAt, setActivityStartedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setValues(initialValues(activity.spec));
    setActivityStartedAt(Date.now());
  }, [activity?.id]);

  const respond = useCallback(async () => {
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
        Math.round((Date.now() - activityStartedAt!) / 1000),
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [session, activity, values, activityStartedAt]);

  const sendMessage = useCallback(
    (_course: Course, goal: string, _mode: ComposerMode) => {
      const text = goal.trim();
      if (!text || sending || !session) return;
      setSending(true);
      setError(null);
      void api
        .askAgent(sessionId, text)
        .then(() => {
          setSending(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : String(err));
          setSending(false);
        });
    },
    [sessionId, sending, session],
  );

  const reportRenderError = useCallback(
    (activityId: string, message: string) => {
      if (!session) return;
      void api.renderError(session.id, activityId, message).catch(() => {});
      setRenderErrorCount((n) => n + 1);
      setError(`This activity could not be displayed. The agent has been told.`);
    },
    [session],
  );

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Banner tone="info">Loading session…</Banner>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Session header */}
      <header className="border-b border-border-subtle bg-surface px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Back to sessions"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Button>
          <div>
            {session && (
              <>
                <span className="block text-sm font-medium text-text truncate max-w-[200px]">
                  {session.goal || "Session"}
                </span>
                <span className="block text-xs font-mono text-text-muted">
                  {session.course}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onNewSession(null)}>
            New session
          </Button>
        </div>
      </header>

      {/* Agent status strip */}
      {session && (
        <div className="px-4 py-2 border-b border-border-subtle bg-surface-2/50 flex items-center gap-3">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-control border px-2 py-1 text-xs",
              !session.agentConnected
                ? "border-border-subtle bg-surface-2 text-text-muted"
                : session.agentPreparing
                  ? "border-warning/40 bg-warning-soft text-warning"
                  : "border-correct/30 bg-correct-soft text-correct",
            )}
          >
            {!session.agentConnected ? (
              <span className="text-text-muted" aria-label="Agent not connected">
                ● Agent not connected
              </span>
            ) : session.agentPreparing ? (
              <span className="text-warning" aria-label="Agent is preparing">
                ● Agent is preparing… ({waitingSeconds(session)}s)
              </span>
            ) : (
              <span className="text-correct" aria-label="Agent connected">
                ● Agent connected
              </span>
            )}
          </span>
        </div>
      )}

      {/* Transcript area */}
      <main className="flex-1 overflow-y-auto p-4 bg-bg">
        {error && (
          <div className="mb-4">
            <Banner tone="error">{error}</Banner>
          </div>
        )}
        {!loading && session && (
          <div className="space-y-4">
            <h2 className="type-meta mb-2">
              Transcript
            </h2>
            {session.transcript.length === 0 && (
              <p className="text-text-muted">No activities yet. Type below to start.</p>
            )}
            {session.transcript.map((item) => {
              if (item.kind === "message") {
                const msg = item.data as { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number };
                return (
                  <div
                    key={`msg-${msg.id}`}
                    className="rounded-control border border-border-subtle bg-surface-2 p-3 text-sm flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5 font-mono text-xs text-primary">
                        └─
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="type-label mb-1">
                          Agent<span className="type-meta ml-1">
                            · {msg.kind}{msg.unverified ? " · unverified" : ""}
                          </span>
                        </p>
                        <Markdown body={msg.text} notePath="" onOpenNote={() => {}} />
                        {msg.cites.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {msg.cites.map((cite) => (
                              <button
                                key={`${cite.note}-${cite.anchor}`}
                                type="button"
                                onClick={() => {
                                  void api
                                    .note(cite.note)
                                    .then(() => {})
                                    .catch(() => {});
                                }}
                                className="inline-flex min-h-9 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text"
                              >
                                {cite.note.split("/").slice(-1)[0]}
                                {cite.anchor ? ` #${cite.anchor}` : ""}
                              </button>
                            ))}
                          </div>
                        )}
                        <p className="type-meta mt-1">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              if (item.kind === "request") {
                const req = item.data as { id: number; text: string; status: string; createdAt: number };
                return (
                  <div
                    key={`req-${req.id}`}
                    className="rounded-control border border-border-subtle bg-surface p-3 text-sm flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 mt-0.5 font-mono text-xs text-text-muted">
                        ▸
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="type-label mb-1">
                          You
                        </p>
                        <p className="type-body whitespace-pre-wrap">{req.text}</p>
                        <p className="type-meta mt-1">
                          {new Date(req.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              const act = item.data as SessionActivity;
              const isPending = act.status === "pending" && act.id === activity?.id;
              const showRenderError = act.renderError && act.id === activity?.id;
              return (
                <div
                  key={String(act.id)}
                  className={cn(
                    "rounded-control border p-3 text-sm flex flex-col gap-2",
                    isPending ? "border-primary bg-primary/5" : "border-border-subtle bg-surface",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="type-heading truncate">{act.title}</p>
                      <p className="type-meta mt-1">
                        {act.status} ·
                        {new Date(act.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {act.cites.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {act.cites.map((cite) => (
                            <button
                              key={`${cite.note}-${cite.anchor}`}
                              type="button"
                              onClick={() => {
                                void api
                                  .note(cite.note)
                                  .then(() => {})
                                  .catch(() => {});
                              }}
                              className="inline-flex min-h-9 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text"
                            >
                              {cite.note.split("/").slice(-1)[0]}
                              {cite.anchor ? ` #${cite.anchor}` : ""}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {showRenderError && (
                    <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 text-sm text-incorrect">
                      This activity could not be displayed. The agent has been told.
                    </div>
                  )}

                  {!showRenderError && (
                    <ActivityRenderer
                      activityId={act.id}
                      spec={act.spec}
                      values={isPending ? values : act.response?.components ?? []}
                      onChange={(index, value) => {
                        const next = [...values];
                        next[index] = value;
                        setValues(next);
                      }}
                      disabled={
                        act.status !== "pending" || act.id !== activity?.id || submitting
                      }
                      onOpenNote={(path, anchor) => {
                        void api.note(path).catch(() => {});
                      }}
                      onRenderError={reportRenderError}
                    />
                  )}

                  {act.answeredAt && (
                    <p className="mt-2 text-xs text-text-muted">
                      Answered at {new Date(act.answeredAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  )}

                  {isPending && missingAnswers(act.spec, values).length > 0 && (
                    <p className="type-meta mt-2 text-warning">
                      Still needed: {missingAnswers(act.spec, values).join(", ")}.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Composer pinned at bottom */}
      <div className="border-t border-border-subtle bg-surface p-3">
        <Composer
          courses={courses}
          selectedCourse={currentCourse}
          onSelectCourse={() => {}}
          onStart={sendMessage}
        />
      </div>
    </div>
  );
}

function waitingSeconds(session: SessionDetail): number {
  const now = Date.now();
  const base =
    session.activity?.answeredAt ??
    session.requests[0]?.createdAt ??
    session.activity?.createdAt ??
    session.startedAt ??
    now;
  return Math.max(0, Math.floor((now - base) / 1000));
}

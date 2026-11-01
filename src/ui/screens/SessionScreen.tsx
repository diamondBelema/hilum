import { ArrowRight, Check, Copy, MessageCircle, Network, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "../lib/router.ts";
import { api, type Course, type SessionDetail, type SessionActivity, type Cite, type ActivitySpec } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Banner } from "../components/ui.tsx";
import { ActivityRenderer } from "../components/ActivityRenderer.tsx";
import { Markdown } from "../Markdown.tsx";
import { buildResponse, initialValues, missingAnswers } from "../lib/activity.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { apiUrl } from "../lib/desktop.ts";
import { cn } from "../lib/cn.ts";
import { navigate } from "../lib/router.ts";
import { Composer } from "../components/Composer.tsx";
import { GraphCanvas } from "../components/GraphCanvas.tsx";
import { uuid } from "../lib/uuid.ts";
import type { ConceptSummary } from "../api.ts";

const INTERACTIVE_TYPES = new Set([
  "mcq_single",
  "mcq_multi",
  "tf_multi",
  "short_answer",
  "cloze",
  "matching",
  "ordering",
  "theory",
  "calculation",
  "confidence_rating",
  "think_aloud",
  "label_diagram",
  "spotter_station",
  "teach_back",
  "case_vignette",
  "muddy_point",
  "spot_the_error",
]);

function isDisplayOnly(spec: ActivitySpec): boolean {
  return !spec.components.some((component) => INTERACTIVE_TYPES.has(component.type));
}

function citeLabel(cite: Cite): string {
  const noteTitle = (cite.note.split("/").slice(-1)[0] ?? cite.note).replace(/\.md$/, "").replace(/[-_]+/g, " ");
  const heading = cite.anchor ? cite.anchor.replace(/^#/, "").replace(/[-_]+/g, " ") : "";
  return heading ? `${noteTitle} · ${heading}` : noteTitle;
}

function specRepeatsTitle(act: SessionActivity): boolean {
  const first = act.spec.components[0] as { type?: string; text?: string; title?: string; body?: string } | undefined;
  if (!first) return false;
  const text = String(first.text ?? first.title ?? first.body ?? "").replace(/^#+\s*/, "").trim().toLowerCase();
  return text !== "" && text === act.title.trim().toLowerCase();
}

type SessionScreenProps = {
  sessionId: string;
  onEndSession?: () => void;
  onResume?: () => Promise<void> | void;
};

function classifyError(err: unknown): { message: string; isNotFound: boolean; isNetwork: boolean } {
  const message = err instanceof Error ? err.message : String(err);
  const isNotFound = message.includes("404") || message.includes("no longer exists") || message.includes("not found");
  const isNetwork = message.includes("Failed to fetch") || message.includes("network") || !message.includes("Request failed");
  return { message, isNotFound, isNetwork };
}

export function SessionScreen({ sessionId, onEndSession, onResume }: SessionScreenProps) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; isNotFound: boolean; isNetwork: boolean } | null>(null);
  const [contextTag, setContextTag] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [seenCount, setSeenCount] = useState(0);
  const [sessionConcepts, setSessionConcepts] = useState<Array<{
    id: string;
    course: string;
    title: string;
    evidenceCount: number;
    correctCount: number;
  }>>([]);
  const [graphOpen, setGraphOpen] = useState(false);
  const [graphFocusId, setGraphFocusId] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<{
    nodes: ConceptSummary[];
    edges: { from: string; to: string; type: string }[];
  } | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const graphContainerRef = useRef<HTMLDivElement>(null);

  const [valuesByActivity, setValuesByActivity] = useState<Record<string, unknown[]>>({});
  const valuesRef = useRef<Record<string, unknown[]>>({});
  const [submittingByActivity, setSubmittingByActivity] = useState<Record<string, boolean>>({});

  const [optimisticMessages, setOptimisticMessages] = useState<
    { id: string; text: string; createdAt: number; failed?: boolean }[]
  >([]);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const firstLoadRef = useRef(true);
  const atBottomRef = useRef(true);

  const [tabId] = useState(() => uuid());

  useEffect(() => {
    let cancelled = false;

    void api.focusSession(sessionId, tabId);

    api
      .session(sessionId)
      .then((detail) => {
        if (!cancelled) {
          setSession(detail);
          void api.sessionConcepts(detail.id).then((concepts) => {
            if (!cancelled) setSessionConcepts(concepts);
          });
          setLoading(false);
          initValues(detail);
          atBottomRef.current = true;
          firstLoadRef.current = true;
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(classifyError(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, tabId]);

  useEffect(() => {
    let cancelled = false;
    api.courses().then((list) => {
      if (!cancelled) setCourses(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const id = session.id;
    const unsubscribe = subscribeHarnessEvents((event) => {
      if ((event.type === "activity" || event.type === "session") && event.sessionId === id) {
        void api
          .session(id)
          .then((next) => {
            setSession((current) => (current?.id === id ? next : current));
            initValues(next);
          })
          .catch(() => {});
        void api
          .sessionConcepts(id)
          .then((concepts) => {
            setSessionConcepts((current) => (current.length === concepts.length &&
              current.every((item, index) => item.id === concepts[index]?.id &&
                item.evidenceCount === concepts[index]?.evidenceCount)
              ? current
              : concepts));
          })
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, [session?.id]);

  useEffect(() => {
    if (!graphOpen || !session?.course) return;
    let cancelled = false;
    api
      .graph(session.course)
      .then((data) => {
        if (!cancelled) setGraphData(data);
      })
      .catch(() => {
        if (!cancelled) setGraphData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [graphOpen, session?.course]);

  useEffect(() => {
    if (!graphOpen) return;
    const element = graphContainerRef.current;
    if (!element) return;
    const resize = () => setGraphSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [graphOpen]);

  const initValues = (detail: SessionDetail) => {
    setValuesByActivity((current) => {
      const next = { ...current };
      let changed = false;
      for (const act of detail.activities) {
        if (!current[act.id]) {
          next[act.id] = initialValues(act.spec);
          changed = true;
        }
      }
      if (changed) valuesRef.current = next;
      return changed ? next : current;
    });
  };

  const currentCourse = courses.find((c) => c.code === session?.course) ?? null;

  const ended = Boolean(session?.endedAt);
  const connected = Boolean(session?.agentConnected);
  const pendingActivities = session?.activities.filter((a) => a.status === "pending") ?? [];
  const activeActivity = pendingActivities[0] ?? null;
  const transcriptEmpty = session?.transcript.length === 0 && optimisticMessages.length === 0;

  const sessionFailed = !session && Boolean(error) && !loading;
  const sessionReady = Boolean(session) && !loading;

  const getValues = (activityId: string) => {
    const act = session?.activities.find((a) => a.id === activityId);
    return valuesRef.current[activityId] ?? valuesByActivity[activityId] ?? (act ? initialValues(act.spec) : []);
  };
  const setValues = (activityId: string, next: unknown[]) => {
    setValuesByActivity((current) => {
      const updated = { ...current, [activityId]: next };
      valuesRef.current = updated;
      return updated;
    });
  };

  const submitActivity = useCallback(
    async (activity: SessionActivity) => {
      const values = getValues(activity.id);
      const spec = activity.spec;
      const missing = missingAnswers(spec, values);
      if (missing.length > 0) {
        setError({ message: `Still needed: ${missing.join(", ")}.`, isNotFound: false, isNetwork: false });
        return;
      }
      setSubmittingByActivity((current) => ({ ...current, [activity.id]: true }));
      setError(null);
      try {
        const updated = await api.respondActivity(
          session!.id,
          activity.id,
          buildResponse(spec, values),
          0,
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
        setValues(activity.id, []);
      } catch (err) {
        setError(classifyError(err));
      } finally {
        setSubmittingByActivity((current) => ({ ...current, [activity.id]: false }));
      }
    },
    [session?.id],
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!session || !text.trim() || sending) return;
      const optimisticId = `opt-${Date.now()}`;
      const body = contextTag ? `${contextTag} ${text.trim()}` : text.trim();
      setOptimisticMessages((prev) => [...prev, { id: optimisticId, text: body, createdAt: Date.now() }]);
      setContextTag(null);
      setSending(true);
      setError(null);
      try {
        await api.askAgent(sessionId, body);
        // Pull the stored request first, then drop the temporary row, so a message never shows twice.
        const next = await api.session(sessionId).catch(() => null);
        if (next) setSession((current) => (current?.id === sessionId ? next : current));
        setOptimisticMessages((prev) => prev.filter((item) => item.id !== optimisticId));
      } catch (err) {
        setError(classifyError(err));
        setOptimisticMessages((prev) =>
          prev.map((item) =>
            item.id === optimisticId ? { ...item, failed: true } : item,
          ),
        );
      } finally {
        setSending(false);
      }
    },
    [contextTag, sending, session, sessionId],
  );

  const retryMessage = useCallback(
    (message: { id: string; text: string }) => {
      setOptimisticMessages((prev) => prev.filter((item) => item.id !== message.id));
      void sendMessage(message.text);
    },
    [sendMessage],
  );

  const resume = useCallback(async () => {
    if (resuming) return;
    setResuming(true);
    try {
      if (onResume) await onResume();
      else {
        await api.reopenSession(sessionId);
        setSession(await api.session(sessionId));
      }
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setResuming(false);
    }
  }, [onResume, resuming, sessionId]);

  const endpoint = apiUrl("/mcp");

  const totalItems = (session?.transcript.length ?? 0) + optimisticMessages.length;
  const jumpCount = userScrolled ? Math.max(0, totalItems - seenCount) : 0;

  // Stay pinned to the bottom unless the reader scrolled up on purpose.
  useEffect(() => {
    if (!session) return;
    if (firstLoadRef.current || atBottomRef.current) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
      firstLoadRef.current = false;
      setSeenCount(totalItems);
    }
  }, [session, totalItems]);

  const jumpToBottom = useCallback(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    atBottomRef.current = true;
    setUserScrolled(false);
    setSeenCount(totalItems);
  }, [totalItems]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        if (activeActivity && !submittingByActivity[activeActivity.id]) {
          void submitActivity(activeActivity);
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeActivity, submittingByActivity, submitActivity]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4 p-4">
        <Banner tone="info">Loading session…</Banner>
      </div>
    );
  }

  if (sessionFailed) {
    if (error!.isNetwork) {
      return (
        <div className="max-w-3xl space-y-4 p-4">
          <Banner tone="error" action={
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }>
            Can't reach the Hilum server. Check that it is running.
          </Banner>
        </div>
      );
    }
    if (error!.isNotFound) {
      return (
        <div className="max-w-3xl space-y-4 p-4">
          <Banner tone="error" action={
            <Link to="/" className="type-body-sm inline-flex min-h-11 items-center gap-2 font-medium">
              Back to sessions
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }>
            This session no longer exists.
          </Banner>
        </div>
      );
    }
    return (
      <div className="max-w-3xl space-y-4 p-4">
        <Banner tone="error" action={
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        }>
          Something went wrong loading this session.
          <details className="ml-2 mt-1 text-text-muted text-xs">
            <summary className="cursor-pointer">Details</summary>
            <p>{error!.message}</p>
          </details>
        </Banner>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden bg-bg">
      {session && sessionConcepts.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border-subtle bg-bg px-3 py-2 sm:px-4">
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setGraphFocusId(null);
              setGraphOpen(true);
            }}
          >
            <Network aria-hidden="true" className="size-4" />
            Open map
          </Button>
          {sessionConcepts.map((concept) => (
            <button
              key={concept.id}
              type="button"
              onClick={() => {
                setGraphFocusId(concept.id);
                setGraphOpen(true);
              }}
              className="min-h-11 shrink-0 rounded-chip border border-border-subtle bg-surface px-3 type-body-sm text-text hover:border-primary hover:bg-primary-soft"
            >
              {concept.title}
            </button>
          ))}
        </div>
      )}
      <div
        className={cn(
          "flex-1 min-h-0 overflow-y-auto px-3 pt-3 pb-1 sm:px-4 sm:pt-4",
        )}
        ref={scrollRef}
        onScroll={() => {
          const node = scrollRef.current;
          if (!node) return;
          const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 24;
          atBottomRef.current = atBottom;
          setUserScrolled(!atBottom);
          if (atBottom) setSeenCount(totalItems);
        }}
      >
        <div className="w-full max-w-4xl space-y-3">
          {session && (
            <>
              {error && (
                <Banner tone="error">
                  {error.message}
                </Banner>
              )}
              {transcriptEmpty && !connected && (
                <div className="rounded-panel border border-border-subtle bg-surface p-5 type-body-sm text-text">
                  <p className="font-medium">{session.title?.trim() || session.goal}</p>
                  {session.title?.trim() && (
                    <p className="mt-1 text-text-muted">{session.goal}</p>
                  )}
                  <p className="mt-2 text-text-muted">
                    Waiting for your agent. Your goal is saved and it will pick it up when it connects.
                  </p>
                  <div className="mt-4 rounded-control border border-border-subtle bg-surface-2 p-4 type-body-sm text-text">
                    <p className="font-medium mb-2">Connect an agent</p>
                    <p className="text-text-muted mb-3">
                      Point any MCP client at this endpoint and call <code className="font-mono">get_active_session</code>, then follow <code className="font-mono">AGENTS.md</code>.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="type-code text-xs break-all truncate max-w-[260px] text-text">
                        {endpoint}
                      </code>
                      <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(endpoint)}>
                        {<Copy aria-hidden="true" className="size-4" />}
                        Copy endpoint
                      </Button>
                    </div>
                    <p className="mt-3 type-meta text-text-muted">
                      Active session: <span className="font-mono">{session.id}</span>
                    </p>
                  </div>
                </div>
              )}

              {session.transcript.map((item) => {
                if (item.kind === "message") {
                  const msg = item.data as { id: number; kind: string; text: string; cites: Cite[]; unverified: boolean; createdAt: number };
                  return (
                    <div key={`msg-${msg.id}`} className="type-dense flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="type-label mb-1">
                            Agent <span className="type-meta ml-1">{msg.kind}{msg.unverified ? " · unverified" : ""}</span>
                          </p>
                          <Markdown body={msg.text} notePath={session?.course ? `courses/${session.course}` : ""} onOpenNote={(path, anchor) => navigate(`/library/notes?path=${encodeURIComponent(path)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}`)} />
                          {msg.cites.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {msg.cites.slice(0, 3).map((cite) => (
                                <button
                                  key={`${cite.note}-${cite.anchor}`}
                                  type="button"
                                  onClick={() => navigate(`/library/notes?path=${encodeURIComponent(cite.note)}${cite.anchor ? `&anchor=${encodeURIComponent(cite.anchor)}` : ""}`)}
                                  className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text truncate max-w-[200px]"
                                  title={citeLabel(cite)}
                                >
                                  {citeLabel(cite)}
                                </button>
                              ))}
                              {msg.cites.length > 3 && (
                                <button
                                  type="button"
                                  className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text truncate max-w-[200px]"
                                  onClick={() => navigate(`/library/notes?path=${encodeURIComponent(msg.cites[3].note)}`)}
                                >
                                  +{msg.cites.length - 3} more
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (item.kind === "request") {
                  const req = item.data as { id: number; text: string; status: string; createdAt: number };
                  return (
                    <div key={`req-${req.id}`} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5">
                        <p className="type-body whitespace-pre-wrap text-text">{req.text}</p>
                      </div>
                    </div>
                  );
                }
                const act = item.data as SessionActivity;
                const isPending = act.status === "pending";
                const answered = act.status === "answered";
                const values = answered && act.response
                  ? act.response.components
                  : getValues(act.id);
                const missing = missingAnswers(act.spec, values);
                const displayOnly = isDisplayOnly(act.spec);
                const submitting = Boolean(submittingByActivity[act.id]);

                return (
                  <div
                    key={String(act.id)}
                    className={cn(
                      "rounded-panel border bg-surface p-3 flex flex-col gap-3",
                      activeActivity?.id === act.id ? "border-l-4 border-border-subtle border-l-primary" : "border-border-subtle",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {!specRepeatsTitle(act) && <p className="type-heading">{act.title}</p>}
                        {act.cites.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {act.cites.slice(0, 3).map((cite) => (
                              <button
                                key={`${cite.note}-${cite.anchor}`}
                                type="button"
                                onClick={() => navigate(`/library/notes?path=${encodeURIComponent(cite.note)}${cite.anchor ? `&anchor=${encodeURIComponent(cite.anchor)}` : ""}`)}
                                className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text truncate max-w-[200px]"
                                title={citeLabel(cite)}
                              >
                                {citeLabel(cite)}
                              </button>
                            ))}
                            {act.cites.length > 3 && (
                              <button
                                type="button"
                                className="inline-flex min-h-11 items-center rounded-chip border border-border-subtle bg-surface px-2 py-1 type-meta text-text-muted hover:border-primary/40 hover:text-text truncate max-w-[200px]"
                                onClick={() => navigate(`/library/notes?path=${encodeURIComponent(act.cites[3].note)}`)}
                              >
                                +{act.cites.length - 3} more
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {act.renderError && (
                      <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 text-sm text-incorrect">
                        This activity could not be displayed. The agent has been told.
                      </div>
                    )}

                    {!act.renderError && isPending && !ended && (
                      <ActivityRenderer
                        activityId={act.id}
                        spec={act.spec}
                        values={values}
                        showTitle={specRepeatsTitle(act)}
                        onChange={(index, value) => {
                          const next = [...values];
                          next[index] = value;
                          setValues(act.id, next);
                          setError(null);
                        }}
                        disabled={submitting}
                        onOpenNote={(path, anchor) => navigate(`/library/notes?path=${encodeURIComponent(path)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}`)}
                        onRenderError={(activityId, message) => {
                          if (!session) return;
                          void api.renderError(session.id, activityId, message).catch(() => {});
                          setError({ message: `This activity could not be displayed. The agent has been told.`, isNotFound: false, isNetwork: false });
                        }}
                      />
                    )}

                    {!act.renderError && answered && (
                      <ActivityRenderer
                        activityId={act.id}
                        spec={act.spec}
                        values={values}
                        showTitle={specRepeatsTitle(act)}
                        disabled
                      />
                    )}

                    {missing.length > 0 && isPending && !ended && (
                      <p className="type-meta text-warning">Still needed: {missing.join(", ")}.</p>
                    )}

                    {answered && (
                      <div className="flex items-start gap-2 rounded-control border border-correct/30 bg-correct-soft px-3 py-2 type-dense text-correct">
                        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                        <p>
                          <span className="font-medium">Activity completed.</span>{" "}
                          Saved as evidence; waiting for the next activity.
                        </p>
                      </div>
                    )}

                    {isPending && !ended && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          onClick={() => void submitActivity(act)}
                          disabled={submitting || missing.length > 0}
                          loading={submitting}
                        >
                          {displayOnly ? (
                            <>Continue</>
                          ) : (
                            <>
                              <Check aria-hidden="true" className="size-4" />
                              Submit answer
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setContextTag(`About: ${act.title}`);
                          }}
                          disabled={!connected}
                        >
                          <MessageCircle aria-hidden="true" className="size-4" /> Ask agent
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {optimisticMessages.map((msg) => (
                <div key={msg.id} className="flex flex-col items-end gap-1">
                  <div className={cn(
                    "max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5",
                    msg.failed ? "border border-incorrect/40 bg-incorrect-soft" : "bg-primary-soft",
                  )}>
                    <p className="type-body whitespace-pre-wrap text-text">{msg.text}</p>
                  </div>
                  {msg.failed ? (
                    <button
                      type="button"
                      onClick={() => retryMessage(msg)}
                      className="type-meta text-incorrect underline underline-offset-2 hover:text-text"
                    >
                      Not sent — retry
                    </button>
                  ) : (
                    <span className="type-meta text-text-muted">Sending…</span>
                  )}
                </div>
              ))}

              <div ref={transcriptEndRef} />
            </>
          )}
        </div>
      </div>

      {sessionReady && (
        <div className="shrink-0 bg-bg px-3 pb-2 pt-1 sm:px-4 sm:pb-3 sm:pt-2">
          <Composer
            view="session"
            courses={courses}
            currentCourse={currentCourse ?? (session ? ({ code: session.course } as Course) : null)}
            sessionMode={session?.goal.toLowerCase().startsWith("practice") ? "practice" : "teach"}
            onSend={(text) => sendMessage(text)}
            contextLabel={contextTag}
            onClearContext={() => setContextTag(null)}
            sending={sending}
            ended={ended}
            onResume={resume}
            resuming={resuming}
            draftKey={`session:${sessionId}`}
          />
        </div>
      )}

      {graphOpen && (
        <aside className="absolute inset-y-3 right-3 z-30 flex w-[min(42rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-panel border border-border-subtle bg-surface shadow-popover">
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-4">
            <div className="min-w-0">
              <p className="type-body-sm font-semibold text-text">Session map</p>
              <p className="type-meta text-text-muted">Connections from this session are highlighted.</p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close session map"
              onClick={() => setGraphOpen(false)}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </div>
          <div ref={graphContainerRef} className="relative min-h-0 flex-1">
            {graphData && graphSize.width > 0 && graphSize.height > 0 ? (
              <GraphCanvas
                nodes={graphData.nodes}
                edges={graphData.edges}
                width={graphSize.width}
                height={graphSize.height}
                course={session?.course}
                sessionId={sessionId}
                sessionConceptIds={new Set(sessionConcepts.map((concept) => concept.id))}
                focusNodeId={graphFocusId}
                selectedId={graphFocusId}
                onNodeSelect={(id) => setGraphFocusId(id)}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-6 type-body-sm text-text-muted">
                Loading session map…
              </div>
            )}
          </div>
        </aside>
      )}

      {!userScrolled || jumpCount === 0 ? null : (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-28 right-6 z-40 rounded-control border border-border-subtle bg-surface px-4 py-2 type-body-sm text-text hover:bg-surface-2 shadow-popover"
          aria-label={`New message${jumpCount > 0 ? ` (${jumpCount})` : ""}`}
        >
          New message{jumpCount > 0 ? ` (${jumpCount})` : ""}
        </button>
      )}
    </div>
  );
}

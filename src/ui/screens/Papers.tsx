import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Flag,
  LayoutGrid,
  Send,
  Upload,
  X,
} from "lucide-react";
import {
  api,
  photoName,
  photoUrl,
  spotterImageUrl,
  type AttemptResults,
  type AttemptSession,
  type AttemptSummary,
  type BlueprintSection,
  type Course,
  type Paper,
  type Question,
  type QuestionType,
} from "../api.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { Banner, Chip, EmptyState, ProgressBar, Skeleton } from "../components/ui.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { plural } from "../lib/format.ts";
import { clearActiveAttempt, readActiveAttempt, setActiveAttempt } from "../lib/activeAttempt.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { graphHref, navigate } from "../lib/router.ts";

const MODE_LABEL = { strict: "Strict", sectioned: "Sectioned", practice: "Practice" };

export function Papers({ course, onBack }: { course: Course; onBack: () => void }) {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [attempts, setAttempts] = useState<AttemptSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "builder" | "runner" | "results">("list");
  const [session, setSession] = useState<AttemptSession | null>(null);
  const [results, setResults] = useState<AttemptResults | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.papers(course.code), api.attempts(course.code)])
      .then(([list, history]) => {
        if (cancelled) return;
        setPapers(list);
        setAttempts(history);
      })
      .catch((err: unknown) => !cancelled && setError(messageOf(err)));
    return () => {
      cancelled = true;
    };
  }, [course.code]);

  useEffect(() => {
    const active = readActiveAttempt();
    if (!active || active.course !== course.code) return;
    let cancelled = false;
    api
      .attempt(active.id)
      .then((resumed) => {
        if (cancelled) return;
        if (resumed.attempt.status !== "in_progress") {
          clearActiveAttempt();
          return;
        }
        setSession(resumed);
        setResults(null);
        setView("runner");
      })
      .catch(() => {
        if (!cancelled) clearActiveAttempt();
      });
    return () => {
      cancelled = true;
    };
  }, [course.code]);

  function reload() {
    Promise.all([api.papers(course.code), api.attempts(course.code)])
      .then(([list, history]) => {
        setPapers(list);
        setAttempts(history);
      })
      .catch((err: unknown) => setError(messageOf(err)));
  }

  async function openAttempt(attempt: AttemptSummary) {
    setError(null);
    try {
      if (attempt.status === "in_progress") {
        const resumed = await api.attempt(attempt.id);
        setActiveAttempt({ id: resumed.attempt.id, course: course.code });
        setSession(resumed);
        setResults(null);
        setView("runner");
      } else {
        setResults(await api.results(attempt.id));
        setSession(null);
        setView("results");
      }
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function start(paper: Paper) {
    setError(null);
    try {
      const started = await api.startAttempt(paper.id);
      setActiveAttempt({ id: started.attempt.id, course: course.code });
      setSession(started);
      setResults(null);
      setView("runner");
    } catch (err) {
      setError(messageOf(err));
    }
  }

  if (view === "runner" && session) {
    return (
      <Runner
        session={session}
        onExit={() => {
          setSession(null);
          setView("list");
          reload();
        }}
        onSubmitted={(value) => {
          clearActiveAttempt();
          setResults(value);
          setView("results");
        }}
      />
    );
  }

  function refreshResults() {
    if (!results) return;
    api
      .results(results.attempt.id)
      .then(setResults)
      .catch((err: unknown) => setError(messageOf(err)));
  }

  if (view === "results" && results) {
    return (
      <Results
        results={results}
        onRefresh={refreshResults}
        onBack={() => {
          setResults(null);
          setSession(null);
          setView("list");
          reload();
        }}
        onBank={onBack}
      />
    );
  }

  return (
    <div className="max-w-4xl">
      <Button variant="ghost" className="px-2" onClick={onBack}>
        <ChevronLeft aria-hidden="true" className="size-5" />
        <span className="hidden sm:inline">Question bank</span>
      </Button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="type-title">Exam papers</h1>
          <p className="reading mt-1 type-body-sm text-text-muted">
            {course.title} · built only from verified, cited questions.
          </p>
        </div>
        {view === "list" && (
          <Button variant="primary" onClick={() => setView("builder")}>
            <LayoutGrid aria-hidden="true" className="size-5" />
            Build a paper
          </Button>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {view === "builder" ? (
        <Builder
          course={course}
          onCancel={() => setView("list")}
          onCreated={(paper) => {
            setView("list");
            reload();
            void start(paper);
          }}
        />
      ) : papers === null ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-5">
          <Skeleton lines={5} />
        </div>
      ) : papers.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No papers yet" action={<Button onClick={() => setView("builder")}>Build the first paper</Button>}>
            A paper copies verified questions into sections. Nothing is drawn from unverified material.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border-subtle border-y border-border-subtle">
          {papers.map((paper) => {
            const latest = attempts?.find((attempt) => attempt.paperId === paper.id);
            return (
              <li key={paper.id} className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{paper.title}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    <Chip>{MODE_LABEL[paper.mode]}</Chip>
                    <Chip>{plural(paper.items.length, "question")}</Chip>
                    <Chip>{Math.round(paper.durationSec / 60)} min</Chip>
                    {latest?.status === "in_progress" && <Chip>In progress</Chip>}
                  </p>
                </div>
                {latest?.status === "in_progress" && (
                  <Button variant="secondary" onClick={() => void openAttempt(latest)}>
                    Resume
                  </Button>
                )}
                {latest?.status === "submitted" && (
                  <Button variant="secondary" onClick={() => void openAttempt(latest)}>
                    Results
                  </Button>
                )}
                <Button variant="primary" onClick={() => void start(paper)}>
                  Start
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Builder({
  course,
  onCancel,
  onCreated,
}: {
  course: Course;
  onCancel: () => void;
  onCreated: (paper: Paper) => void;
}) {
  const [title, setTitle] = useState(`${course.title} practice`);
  const [mode, setMode] = useState<Paper["mode"]>("strict");
  const [sections, setSections] = useState<BlueprintSection[]>([
    { section: "A", type: "tf_multi", count: 1, minutes: 10 },
    { section: "B", type: "mcq_single", count: 1, minutes: 5 },
    { section: "C", type: "theory", count: 1, minutes: 30 },
  ]);
  const [stationSeconds, setStationSeconds] = useState("75");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalMinutes = sections.reduce((sum, section) => sum + (section.minutes ?? 0), 0);
  const hasSpotter = sections.some((section) => section.type === "spotter");

  function patch(index: number, patch: Partial<BlueprintSection>) {
    setSections((current) =>
      current.map((section, itemIndex) => (itemIndex === index ? { ...section, ...patch } : section)),
    );
  }

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const paper = await api.createPaper({
        course: course.code,
        title,
        mode,
        blueprint: sections.map((section) => ({
          ...section,
          count: Number(section.count),
          minutes: Number(section.minutes),
          seconds_each:
            section.type === "spotter" ? Number(stationSeconds) || undefined : undefined,
        })),
      });
      onCreated(paper);
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-6 space-y-4 rounded-panel border border-border-subtle bg-surface p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void build();
      }}
    >
      {error && <Banner tone="error">{error}</Banner>}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold">Mode</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as Paper["mode"])}
            className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-sm"
          >
            <option value="strict">Strict</option>
            <option value="sectioned">Sectioned</option>
            <option value="practice">Practice</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold">Sections</legend>
        <ul className="space-y-2">
          {sections.map((section, index) => (
            <li key={index} className="grid grid-cols-[3.5rem_1fr_4.5rem_4.5rem_2.75rem] items-end gap-2">
              <label className="block">
                <span className="sr-only">Section name</span>
                <input
                  value={section.section}
                  onChange={(event) => patch(index, { section: event.target.value })}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-2 text-center text-sm"
                  aria-label={`Section ${index + 1} name`}
                />
              </label>
              <label className="block">
                <span className="sr-only">Type</span>
                <select
                  value={section.type}
                  onChange={(event) => patch(index, { type: event.target.value as QuestionType })}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-2 text-sm"
                  aria-label={`Section ${index + 1} type`}
                >
                  <option value="tf_multi">True / false</option>
                  <option value="mcq_single">MCQ</option>
                  <option value="theory">Theory</option>
                  <option value="spotter">Spotter</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-text-muted">Count</span>
                <input
                  type="number"
                  min={1}
                  value={section.count}
                  onChange={(event) => patch(index, { count: Number(event.target.value) })}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-text-muted">Min</span>
                <input
                  type="number"
                  min={1}
                  value={section.minutes ?? 1}
                  onChange={(event) => patch(index, { minutes: Number(event.target.value) })}
                  className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-2 text-sm"
                />
              </label>
              <IconButton
                label={`Remove section ${section.section}`}
                disabled={sections.length === 1}
                onClick={() => setSections((current) => current.filter((_, itemIndex) => itemIndex !== index))}
              >
                <X aria-hidden="true" className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          className="mt-2 px-2"
          onClick={() =>
            setSections((current) => [
              ...current,
              {
                section: String.fromCharCode(65 + current.length),
                type: "mcq_single",
                count: 1,
                minutes: 5,
              },
            ])
          }
        >
          Add section
        </Button>
      </fieldset>

      {hasSpotter && (
        <label className="block max-w-xs">
          <span className="mb-1.5 block text-xs font-semibold">Seconds per station</span>
          <input
            type="number"
            min={10}
            max={600}
            value={stationSeconds}
            onChange={(event) => setStationSeconds(event.target.value)}
            className="min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 text-sm"
          />
          <span className="mt-1 block text-xs text-text-muted">
            Spotter stations auto-advance when the station timer runs out.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={busy} loadingLabel="Building…">
          Build and start
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <p className="ml-auto font-mono text-xs text-text-muted">{totalMinutes} min total</p>
      </div>
    </form>
  );
}

function Runner({
  session: initial,
  onExit,
  onSubmitted,
}: {
  session: AttemptSession;
  onExit: () => void;
  onSubmitted: (results: AttemptResults) => void;
}) {
  const paper = initial.paper;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(initial.answers.map((answer) => [answer.questionId, answer.response])),
  );
  const [flags, setFlags] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initial.answers.map((answer) => [answer.questionId, answer.flagged])),
  );
  const [now, setNow] = useState(Date.now());
  const [stationStart, setStationStart] = useState(Date.now());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [grid, setGrid] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const submitted = useRef(false);
  const questionSince = useRef(Date.now());
  const item = paper.items[index]!;
  const question = item.question;
  const elapsed = Math.floor((now - initial.attempt.startedAt) / 1000);
  const remaining = Math.max(0, paper.durationSec - elapsed);

  const sectionBounds = paper.blueprint.reduce<{ section: string; start: number; end: number }[]>(
    (bounds, section) => {
      const start = bounds.length > 0 ? (bounds[bounds.length - 1]?.end ?? 0) : 0;
      bounds.push({
        section: section.section,
        start,
        end: start + (section.minutes ?? 0) * 60,
      });
      return bounds;
    },
    [],
  );
  const currentBounds = sectionBounds.find((bound) => bound.section === item.section);
  const sectionRemaining =
    paper.mode === "sectioned" && currentBounds
      ? Math.max(0, currentBounds.end - elapsed)
      : remaining;
  const sectionLocked =
    paper.mode === "sectioned" && currentBounds ? elapsed >= currentBounds.end : false;
  const timeLeft = paper.mode === "sectioned" ? sectionRemaining : remaining;
  const stationSeconds = paper.blueprint.find(
    (section) => section.section === item.section,
  )?.seconds_each;
  const stationRemaining = stationSeconds
    ? Math.max(0, stationSeconds - Math.floor((now - stationStart) / 1000))
    : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    questionSince.current = Date.now();
    setSaveState("idle");
  }, [index]);

  useEffect(() => {
    if (!stationSeconds || index >= paper.items.length - 1) return;
    if (now - stationStart < stationSeconds * 1000) return;
    go(index + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, stationStart, stationSeconds, index, paper.items.length]);

  useEffect(() => {
    if (remaining === 0 && !submitted.current) {
      submitted.current = true;
      void submit(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const answered = paper.items.filter((entry) => hasAnswer(answers[entry.question.id])).length;
  const flagged = paper.items.filter((entry) => flags[entry.question.id]).length;
  const expected = paper.durationSec > 0 ? (paper.items.length * elapsed) / paper.durationSec : 0;
  const pace = answered - expected;
  const paceLabel =
    remaining === 0
      ? "Time up"
      : Math.abs(pace) < 1
        ? "On track"
        : pace > 0
          ? `${Math.round(pace)} ahead`
          : `${Math.round(-pace)} behind`;

  async function persist(nextAnswers = answers, nextFlags = flags) {
    if (submitted.current) return;
    setSaveState("saving");
    try {
      await api.saveAnswer(initial.attempt.id, {
        question_id: question.id,
        response: nextAnswers[question.id] ?? null,
        time_spent_sec: Math.max(1, Math.round((Date.now() - questionSince.current) / 1000)),
        flagged: nextFlags[question.id] ?? false,
      });
      setSaveState("saved");
      setError(null);
    } catch (err) {
      setSaveState("error");
      setError(messageOf(err));
    }
  }

  function setResponse(response: unknown) {
    const next = { ...answers, [question.id]: response };
    setAnswers(next);
    void persist(next, flags);
  }

  async function uploadTheoryPhoto(file: File) {
    if (sectionLocked || uploadedLocked()) return;
    setUploading(true);
    setError(null);
    try {
      const saved = await api.uploadPhoto(
        initial.attempt.id,
        question.id,
        file,
        theoryAnswer(answers[question.id]),
      );
      setAnswers((current) => ({ ...current, [question.id]: saved.response }));
      setSaveState("saved");
    } catch (err) {
      setSaveState("error");
      setError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  function uploadedLocked(): boolean {
    return submitted.current;
  }

  function toggleFlag() {
    const next = { ...flags, [question.id]: !flags[question.id] };
    setFlags(next);
    void persist(answers, next);
  }

  function go(next: number) {
    if (next < 0 || next >= paper.items.length) return;
    setIndex(next);
    setStationStart(Date.now());
    window.scrollTo({ top: 0 });
  }

  async function submit(auto = false) {
    if (submitted.current && !auto) return;
    setSubmitOpen(false);
    setError(null);
    try {
      const results = await api.submitAttempt(initial.attempt.id, auto);
      onSubmitted(results);
    } catch (err) {
      submitted.current = false;
      setError(messageOf(err));
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "n") go(index + 1);
      else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "p") go(index - 1);
      else if (event.key.toLowerCase() === "g") setGrid(true);
      else if (event.key.toLowerCase() === "l") toggleFlag();
      else if (question.type === "mcq_single" && /^[a-e]$/i.test(event.key)) {
        const key = event.key.toUpperCase();
        if (key in mcqOptions(question)) setResponse({ answer: key });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, answers, flags, question]);

  const timerTone = timeLeft <= 60 ? "text-incorrect" : timeLeft <= 300 ? "text-warning" : "text-text";

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg">
      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-surface px-3 py-2">
        <span className="text-xs text-text-muted">
          Section {item.section} · {typeLabel(question.type)}
        </span>
        {stationSeconds && stationRemaining !== null && (
          <span
            className={`flex items-center gap-1 font-mono text-sm tabular-nums ${
              stationRemaining <= 10 ? "text-warning" : "text-text-muted"
            }`}
          >
            Station {formatTime(stationRemaining)}
            <span className="sr-only">remaining in this station</span>
          </span>
        )}
        <span className="hidden text-xs text-text-muted sm:inline">
          Question {index + 1} of {paper.items.length}
        </span>
        <span className={`ml-auto flex items-center gap-1.5 font-mono text-lg tabular-nums ${timerTone}`}>
          <Clock aria-hidden="true" className="size-4" />
          {formatTime(timeLeft)}
          <span className="sr-only">remaining</span>
        </span>
        <Button variant="ghost" className="px-2" onClick={toggleFlag} aria-pressed={flags[question.id]}>
          <Flag
            aria-hidden="true"
            className={`size-4 ${flags[question.id] ? "fill-current text-accent" : ""}`}
          />
          {flags[question.id] ? "Flagged" : "Flag"}
        </Button>
        <IconButton label="Keyboard shortcuts" className="hidden sm:inline-flex" onClick={() => setHelpOpen(true)}>
          <CircleHelp aria-hidden="true" className="size-5" />
        </IconButton>
        <Button variant="secondary" className="px-2" onClick={() => setSubmitOpen(true)}>
          <Send aria-hidden="true" className="size-4" />
          Submit
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-5 pb-28 lg:grid-cols-[minmax(0,1fr)_17rem] lg:pb-6">
          <div>
            {error && (
              <div className="mb-3">
                <Banner tone="error" action={<Button variant="ghost" className="px-2" onClick={() => void persist()}>Retry</Button>}>
                  Not saved. {error}
                </Banner>
              </div>
            )}
            <div className="mx-auto max-w-[68ch]">
              <h1 className="reading text-lg font-semibold leading-snug sm:text-xl">
                {question.body.stem ?? question.body.prompt}
              </h1>
              <p className="mt-1 text-xs text-text-muted">
                {plural(question.marks, "mark")}
                {currentBounds && paper.mode !== "practice"
                  ? ` · about ${Math.max(1, Math.round((currentBounds.end - currentBounds.start) / 60))} min for this section`
                  : ""}
              </p>

              <div className="mt-5">
                {question.type === "mcq_single" && (
                  <fieldset disabled={sectionLocked}>
                    <legend className="sr-only">Choose one option</legend>
                    <ul className="space-y-2">
                      {Object.entries(mcqOptions(question)).map(([key, text]) => {
                        const selected = mcqAnswer(answers[question.id]) === key;
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => setResponse({ answer: key })}
                              aria-pressed={selected}
                              className={`flex min-h-14 w-full items-center gap-3 rounded-control border px-3 text-left text-sm ${
                                selected
                                  ? "border-2 border-primary bg-primary-soft"
                                  : "border-border-strong bg-surface hover:bg-surface-2"
                              }`}
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-sm">
                                {key}
                              </span>
                              <span className="flex-1">{text}</span>
                              {selected && <Check aria-hidden="true" className="size-5 text-primary" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                )}

                {question.type === "tf_multi" && (
                  <fieldset disabled={sectionLocked}>
                    <legend className="sr-only">Mark each statement true or false</legend>
                    <ol className="space-y-3">
                      {(question.body.statements ?? []).map((statement, statementIndex) => {
                        const current = tfAnswers(answers[question.id])[statementIndex];
                        return (
                          <li key={statementIndex} className="rounded-panel border border-border-subtle bg-surface p-3">
                            <p className="text-sm leading-6">
                              <span className="mr-2 font-mono text-xs text-text-muted">
                                {String.fromCharCode(97 + statementIndex)})
                              </span>
                              {statement.text}
                            </p>
                            <div className="mt-2 flex gap-2">
                              {[true, false].map((value) => (
                                <button
                                  key={String(value)}
                                  type="button"
                                  aria-pressed={current === value}
                                  onClick={() => {
                                    const next = [...tfAnswers(answers[question.id])];
                                    next[statementIndex] = value;
                                    setResponse({ statements: next });
                                  }}
                                  className={`min-h-11 flex-1 rounded-control border text-xs font-semibold ${
                                    current === value
                                      ? "border-2 border-primary bg-primary-soft text-text"
                                      : "border-border-strong text-text-muted hover:bg-surface-2"
                                  }`}
                                >
                                  {value ? "True" : "False"}
                                </button>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </fieldset>
                )}

                {question.type === "theory" && (() => {
                  const answerInput = question.body.answer_input ?? "text";
                  const photo = photoName(answers[question.id]);
                  return (
                    <div>
                      {answerInput !== "photo" && (
                        <>
                          <label htmlFor="theory-answer" className="sr-only">
                            Your answer
                          </label>
                          <textarea
                            id="theory-answer"
                            rows={10}
                            value={theoryAnswer(answers[question.id])}
                            disabled={sectionLocked}
                            spellCheck={paper.mode === "practice"}
                            autoCorrect={paper.mode === "practice" ? "on" : "off"}
                            onChange={(event) => {
                              const next = { ...answers, [question.id]: { text: event.target.value } };
                              setAnswers(next);
                              setSaveState("saving");
                              window.setTimeout(() => void persist(next, flags), 600);
                            }}
                            className="reading min-h-64 w-full resize-y rounded-control border border-border-strong bg-surface px-3 py-3 text-base leading-7"
                            placeholder="Write your answer…"
                          />
                          <p className="mt-1 flex justify-between text-xs text-text-muted">
                            <span>{plural(wordCount(theoryAnswer(answers[question.id])), "word")}</span>
                            <span>{plural(question.marks, "mark")}</span>
                          </p>
                        </>
                      )}

                      {answerInput !== "text" && (
                        <div className={answerInput === "photo" ? "" : "mt-2"}>
                          {answerInput === "photo" && !photo && (
                            <p className="reading mb-2 text-sm text-text-muted">
                              Write the answer on paper, photograph the whole page, then upload it here.
                            </p>
                          )}
                          {photo && (
                            <img
                              src={photoUrl(initial.attempt.id, question.id, photo)}
                              alt="Your handwritten answer"
                              className="mb-2 max-h-[52dvh] w-full rounded-panel border border-border-subtle bg-surface object-contain"
                            />
                          )}
                          <label
                            className={`inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-surface px-4 text-sm font-semibold ${
                              sectionLocked
                                ? "pointer-events-none opacity-50"
                                : "cursor-pointer hover:bg-surface-2"
                            }`}
                          >
                            <Upload aria-hidden="true" className="size-4" />
                            {uploading
                              ? "Uploading…"
                              : photo
                                ? "Replace photo"
                                : answerInput === "photo"
                                  ? "Upload photo of your answer"
                                  : "Add a photo"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              className="sr-only"
                              disabled={sectionLocked || uploading}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void uploadTheoryPhoto(file);
                              }}
                            />
                          </label>
                          <p className="mt-1 text-xs text-text-muted">
                            JPEG, PNG or WebP up to 10 MB. Stored on this device.
                          </p>
                        </div>
                      )}
                      {answerInput === "photo" && (
                        <p className="mt-2 text-xs text-text-muted">{plural(question.marks, "mark")}</p>
                      )}
                    </div>
                  );
                })()}

                {question.type === "spotter" && (
                  <div>
                    {spotterImageUrl(question) ? (
                      <img
                        src={spotterImageUrl(question)}
                        alt="Spotter station"
                        className="max-h-[52dvh] w-full rounded-panel border border-border-subtle bg-surface object-contain"
                      />
                    ) : (
                      <Banner tone="warning">This spotter has no image.</Banner>
                    )}
                    <label htmlFor="spotter-answer" className="mt-4 block text-xs font-semibold">
                      Identify
                    </label>
                    <input
                      id="spotter-answer"
                      type="text"
                      value={theoryAnswer(answers[question.id])}
                      disabled={sectionLocked}
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={paper.mode === "practice"}
                      autoCorrect={paper.mode === "practice" ? "on" : "off"}
                      placeholder="Type the structure…"
                      onChange={(event) => {
                        const next = { ...answers, [question.id]: { text: event.target.value } };
                        setAnswers(next);
                        setSaveState("saving");
                        window.setTimeout(() => void persist(next, flags), 400);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && index < paper.items.length - 1) {
                          event.preventDefault();
                          go(index + 1);
                        }
                      }}
                      className="reading mt-1.5 min-h-14 w-full rounded-control border border-border-strong bg-surface px-3 text-base"
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      {plural(question.marks, "mark")} · exact answer, one or two words
                    </p>
                  </div>
                )}

                {paper.mode === "practice" && hasAnswer(answers[question.id]) && (
                  <div className="mt-5 rounded-panel border border-border-subtle bg-surface p-3">
                    {question.type === "theory" && question.body.model_answer && (
                      <>
                        <p className="text-xs font-semibold">Model answer</p>
                        <p className="reading mt-1 whitespace-pre-wrap text-sm">
                          {question.body.model_answer}
                        </p>
                      </>
                    )}
                    {question.type === "spotter" && (
                      <p className="text-sm">
                        <span className="font-semibold">Answer:</span> {question.body.answer}
                        {question.body.accepted && question.body.accepted.length > 0
                          ? ` (also ${question.body.accepted.join(", ")})`
                          : ""}
                      </p>
                    )}
                    {question.body.explanation && (
                      <p className="mt-2 text-sm text-text-muted">{question.body.explanation}</p>
                    )}
                    {question.type === "theory" && question.body.rubric && (
                      <div className="mt-3 border-t border-border-subtle pt-3">
                        <p className="text-xs font-semibold">Rubric</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-text-muted">
                          {question.body.rubric}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-6 hidden items-center justify-between gap-2 lg:flex">
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
                    <ChevronLeft aria-hidden="true" className="size-4" />
                    Back
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => go(index + 1)}
                    disabled={index === paper.items.length - 1}
                  >
                    Next
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
                <SaveIndicator state={saveState} />
              </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-4 space-y-4 rounded-panel border border-border-subtle bg-surface p-3">
              <QuestionGrid
                paper={paper}
                index={index}
                answers={answers}
                flags={flags}
                onPick={go}
                locked={(section) =>
                  paper.mode === "sectioned" &&
                  Boolean(sectionBounds.find((bound) => bound.section === section)) &&
                  elapsed >=
                    (sectionBounds.find((bound) => bound.section === section)?.end ?? Infinity)
                }
              />
              <div className="border-t border-border-subtle pt-3">
                <p className="text-xs font-semibold">Pace</p>
                <p className={`mt-1 text-sm ${pace < -1 ? "text-warning" : "text-text"}`}>{paceLabel}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {answered} answered · {flagged} flagged
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-border-subtle bg-surface px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <Button variant="secondary" className="px-3" onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
        <Button variant="secondary" className="px-3" onClick={() => setGrid(true)}>
          <LayoutGrid aria-hidden="true" className="size-4" />
          {index + 1}/{paper.items.length}
        </Button>
        <Button
          variant="secondary"
          className="px-3"
          onClick={() => go(index + 1)}
          disabled={index === paper.items.length - 1}
        >
          Next
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
        <div className="ml-auto">
          <SaveIndicator state={saveState} compact />
        </div>
      </footer>

      <Sheet open={grid} title="Questions" onClose={() => setGrid(false)}>
        <QuestionGrid
          paper={paper}
          index={index}
          answers={answers}
          flags={flags}
          onPick={(next) => {
            setGrid(false);
            go(next);
          }}
          locked={(section) =>
            paper.mode === "sectioned" &&
            Boolean(sectionBounds.find((bound) => bound.section === section)) &&
            elapsed >= (sectionBounds.find((bound) => bound.section === section)?.end ?? Infinity)
          }
        />
        <div className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-muted">
          <p>{answered} answered · {flagged} flagged · {paper.items.length - answered} left</p>
          <Button variant="primary" className="mt-3 w-full" onClick={() => { setGrid(false); setSubmitOpen(true); }}>
            Submit paper
          </Button>
        </div>
      </Sheet>

      <Sheet open={submitOpen} title="Submit paper?" onClose={() => setSubmitOpen(false)}>
        <p className="text-sm">
          {paper.items.length - answered === 0
            ? "Every question has an answer."
            : `${paper.items.length - answered} unanswered and ${flagged} flagged.`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const first = paper.items.findIndex((entry) => !hasAnswer(answers[entry.question.id]));
              setSubmitOpen(false);
              if (first >= 0) go(first);
            }}
          >
            Review
          </Button>
          <Button variant="primary" onClick={() => void submit(false)}>
            Submit now
          </Button>
          <Button variant="ghost" className="ml-auto" onClick={() => void onExit()}>
            Save and leave
          </Button>
        </div>
      </Sheet>

      <Sheet open={helpOpen} title="Keyboard shortcuts" onClose={() => setHelpOpen(false)}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {[
            ["N or →", "Next question"],
            ["P or ←", "Previous question"],
            ["G", "Open the question grid"],
            ["L", "Flag this question"],
            ["A–E", "Choose an MCQ option"],
            ["Enter", "Next from a spotter answer"],
          ].map(([keys, action]) => (
            <div key={keys} className="contents">
              <dt className="font-mono text-xs text-text-muted">{keys}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </Sheet>
    </div>
  );
}

function SaveIndicator({ state, compact }: { state: "idle" | "saving" | "saved" | "error"; compact?: boolean }) {
  if (state === "saving") return <span className="text-xs text-text-muted">Saving…</span>;
  if (state === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-correct">
        <CheckCircle2 aria-hidden="true" className="size-4" />
        {compact ? "Saved" : "Saved"}
      </span>
    );
  if (state === "error") return <span className="text-xs text-incorrect">Not saved</span>;
  return null;
}

function QuestionGrid({
  paper,
  index,
  answers,
  flags,
  onPick,
  locked,
}: {
  paper: Paper;
  index: number;
  answers: Record<string, unknown>;
  flags: Record<string, boolean>;
  onPick: (index: number) => void;
  locked: (section: string) => boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold">Questions</p>
      <div className="mt-2 space-y-1">
        {paper.blueprint.map((section) => (
          <div key={section.section}>
            <p className="mt-2 text-xs text-text-muted">Section {section.section}</p>
            <div className="mt-1 grid grid-cols-5 gap-1.5">
              {paper.items
                .map((entry, entryIndex) => ({ entry, entryIndex }))
                .filter(({ entry }) => entry.section === section.section)
                .map(({ entry, entryIndex }) => {
                  const isAnswered = hasAnswer(answers[entry.question.id]);
                  const isCurrent = entryIndex === index;
                  const isLocked = locked(section.section);
                  return (
                    <button
                      key={entry.question.id}
                      type="button"
                      onClick={() => onPick(entryIndex)}
                      aria-current={isCurrent ? "true" : undefined}
                      aria-label={`Question ${entryIndex + 1}${isAnswered ? ", answered" : ""}${flags[entry.question.id] ? ", flagged" : ""}${isLocked ? ", locked" : ""}`}
                      className={`relative flex aspect-square min-h-9 items-center justify-center rounded-control border text-xs font-semibold ${
                        isCurrent
                          ? "border-2 border-primary bg-primary-soft text-text"
                          : isAnswered
                            ? "border-primary/40 bg-surface-2 text-text"
                            : "border-border-strong text-text-muted"
                      } ${isLocked ? "opacity-40" : ""}`}
                    >
                      {entryIndex + 1}
                      {flags[entry.question.id] && (
                        <Flag aria-hidden="true" className="absolute top-0.5 right-0.5 size-2.5 fill-current text-accent" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
        <li className="flex items-center gap-1"><span className="size-2.5 rounded-sm border-2 border-primary" /> current</li>
        <li className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-surface-2" /> answered</li>
        <li className="flex items-center gap-1"><Flag aria-hidden="true" className="size-2.5 text-accent" /> flagged</li>
      </ul>
    </div>
  );
}

function Results({
  results,
  onRefresh,
  onBack,
  onBank,
}: {
  results: AttemptResults;
  onRefresh: () => void;
  onBack: () => void;
  onBank: () => void;
}) {
  const pendingMarks = results.items
    .filter((item) => item.status === "pending_grading")
    .reduce((sum, item) => sum + item.marks, 0);
  const gradedMax = results.score.max - pendingMarks;
  const percent = gradedMax > 0 ? Math.round((results.score.awarded / gradedMax) * 100) : 0;
  const [filter, setFilter] = useState<"all" | "mistakes" | "pending">("all");
  const [sort, setSort] = useState<"paper" | "slowest">("paper");
  const mistakeIds = new Set(results.mistakes.map((item) => item.questionId));
  const mistakeTags = new Map(results.mistakes.map((item) => [item.questionId, item.tags]));
  const groups = new Map<string, number>();
  for (const mistake of results.mistakes) {
    for (const tag of mistake.tags) groups.set(tag, (groups.get(tag) ?? 0) + 1);
  }
  const visible = results.items.filter((item) => {
    if (filter === "mistakes") return mistakeIds.has(item.questionId);
    if (filter === "pending") return item.status === "pending_grading";
    return true;
  });
  if (sort === "slowest") visible.sort((a, b) => b.timeSpentSec - a.timeSpentSec);

  useEffect(
    () =>
      subscribeHarnessEvents((event) => {
        if (event.type === "graded" && event.attemptId === results.attempt.id) onRefresh();
      }),
    [results.attempt.id, onRefresh],
  );

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">{results.paper.title}</h1>
      <p className="mt-1 text-sm text-text-muted">
        {MODE_LABEL[results.paper.mode as Paper["mode"]]} · {formatTime(results.durationUsedSec)}
      </p>

      <div className="mt-5 rounded-panel border border-border-subtle bg-surface p-5">
        <p className="font-mono text-3xl font-semibold tabular-nums">
          {results.score.awarded}
          <span className="text-base text-text-muted"> / {results.score.max}</span>
        </p>
        <p className="mt-1 text-sm text-text-muted">
          {percent}% on graded items
          {results.score.pending > 0
            ? ` · ${plural(results.score.pending, "theory answer")} awaiting grading (${pendingMarks} marks)`
            : ""}
        </p>
        <div className="mt-3">
          <ProgressBar label="Graded score" value={results.score.awarded} max={gradedMax} />
        </div>
      </div>

      <section aria-labelledby="sections-heading" className="mt-6">
        <h2 id="sections-heading" className="text-base font-semibold">By section</h2>
        <ul className="mt-2 space-y-2">
          {results.bySection.map((section) => (
            <li key={section.section} className="rounded-control border border-border-subtle bg-surface p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">Section {section.section}</p>
                <p className="font-mono text-xs tabular-nums">
                  {section.awarded} / {section.max}
                  {section.pending > 0 ? ` · ${section.pending} pending` : ""}
                </p>
              </div>
              <div className="mt-2">
                <ProgressBar label={`Section ${section.section}`} value={section.awarded} max={section.max} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-panel border border-border-subtle bg-surface p-4">
          <h2 className="text-sm font-semibold">Flagged</h2>
          <p className="mt-1 text-sm text-text-muted">
            {results.flaggedAccuracy
              ? `${results.flaggedAccuracy.correct} of ${results.flaggedAccuracy.flagged} flagged objective items correct`
              : "No flagged objective items."}
          </p>
        </div>
        <div className="rounded-panel border border-border-subtle bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold">Mistakes</h2>
            {groups.size > 0 && (
              <Button
                variant="ghost"
                className="min-h-9 px-2 text-xs"
                onClick={() => {
                  setFilter("mistakes");
                  requestAnimationFrame(() =>
                    document.getElementById("items-heading")?.scrollIntoView({ block: "start" }),
                  );
                }}
              >
                Review these
              </Button>
            )}
          </div>
          {groups.size === 0 ? (
            <p className="mt-1 text-sm text-text-muted">No mistakes tagged.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {[...groups.entries()].map(([tag, count]) => (
                <li key={tag}>
                  <Chip>
                    <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
                    {mistakeLabel(tag)} · {count}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <section aria-labelledby="items-heading" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="items-heading" className="text-base font-semibold">Debrief</h2>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter questions">
            {([
              ["all", "All"],
              ["mistakes", "Mistakes"],
              ["pending", "Awaiting grading"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-9 rounded-control px-2.5 text-xs font-semibold ${
                  filter === value
                    ? "bg-primary-soft text-text"
                    : "border border-border-subtle text-text-muted hover:bg-surface-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Order</span>
          <Button
            variant="ghost"
            className="min-h-9 px-2 text-xs"
            aria-pressed={sort === "paper"}
            onClick={() => setSort("paper")}
          >
            Paper order
          </Button>
          <Button
            variant="ghost"
            className="min-h-9 px-2 text-xs"
            aria-pressed={sort === "slowest"}
            onClick={() => setSort("slowest")}
          >
            Slowest first
          </Button>
        </div>

        {visible.length === 0 ? (
          <p className="mt-3 rounded-panel border border-border-subtle bg-surface p-4 text-sm text-text-muted">
            No questions match this view.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
            {visible.map((item) => (
              <DebriefItem
                key={item.questionId}
                item={item}
                course={results.paper.course}
                attemptId={results.attempt.id}
                number={results.items.findIndex((entry) => entry.questionId === item.questionId) + 1}
                tags={mistakeTags.get(item.questionId) ?? []}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onBack}>Back to papers</Button>
        <Button variant="secondary" onClick={onBank}>Question bank</Button>
      </div>
    </div>
  );
}

function DebriefItem({
  item,
  course,
  attemptId,
  number,
  tags,
}: {
  item: AttemptResults["items"][number];
  course: string;
  attemptId: string;
  number: number;
  tags: string[];
}) {
  const pending = item.status === "pending_grading";
  const photo = photoName(item.response);
  const prompt =
    item.body.stem ||
    item.body.prompt ||
    (item.type === "theory" ? "Theory answer" : typeLabel(item.type));
  const statusLabel = pending
    ? "Awaiting grading"
    : item.type === "theory"
      ? "Graded theory"
      : item.correct
        ? "Correct"
        : item.status === "unanswered"
          ? "Not answered"
          : "Incorrect";
  return (
    <li className="py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-xs text-text-muted">{number}</span>
        <div className="min-w-0 flex-1">
          <p className="reading text-sm">{prompt}</p>
          <p className="mt-1 flex flex-wrap gap-1.5">
            <Chip>{item.section}</Chip>
            <Chip>{typeLabel(item.type)}</Chip>
            <Chip>{plural(item.marks, "mark")}</Chip>
            {item.autoScore !== null && <Chip>{item.autoScore} awarded</Chip>}
            {item.timeSpentSec > 0 && <Chip>{formatTime(item.timeSpentSec)}</Chip>}
            {item.flagged && <Chip>Flagged</Chip>}
            {tags.map((tag) => (
              <Chip key={tag}>
                <AlertTriangle aria-hidden="true" className="size-3.5 text-warning" />
                {mistakeLabel(tag)}
              </Chip>
            ))}
          </p>
          {item.conceptIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.conceptIds.map((conceptId) => (
                <button
                  key={conceptId}
                  type="button"
                  onClick={() =>
                    navigate(
                      graphHref(course, conceptId),
                    )
                  }
                  className="min-h-11 rounded-chip border border-border-subtle bg-surface-2 px-3 type-body-sm text-text hover:border-primary hover:bg-primary-soft"
                >
                  Review {conceptId}
                </button>
              ))}
            </div>
          )}
          <details className="group mt-2">
            <summary className="flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold text-text-muted">
              <span className="group-open:hidden">Show answer and explanation</span>
              <span className="hidden group-open:inline">Hide answer and explanation</span>
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <section aria-label="Your answer" className="rounded-control border border-border-subtle bg-surface p-3">
                <h3 className="text-xs font-semibold text-text-muted">Your answer</h3>
                <AnswerView item={item} attemptId={attemptId} photo={photo} />
              </section>
              <section aria-label="Correct answer" className="rounded-control border border-border-subtle bg-surface p-3">
                <h3 className="text-xs font-semibold text-text-muted">
                  {item.type === "theory" ? "Model answer" : "Correct answer"}
                </h3>
                <CorrectView item={item} />
              </section>
            </div>

            {item.body.explanation && (
              <div className="mt-3 rounded-control border border-border-subtle bg-surface p-3">
                <h3 className="text-xs font-semibold text-text-muted">Explanation</h3>
                <p className="reading mt-1 whitespace-pre-wrap text-sm">{item.body.explanation}</p>
              </div>
            )}

            {item.type === "theory" && item.body.rubric && (
              <div className="mt-3 rounded-control border border-border-subtle bg-surface p-3">
                <h3 className="text-xs font-semibold text-text-muted">Rubric</h3>
                <p className="reading mt-1 whitespace-pre-wrap text-sm text-text-muted">{item.body.rubric}</p>
              </div>
            )}

            {item.grade && (
              <div className="mt-3 rounded-control border border-border-subtle bg-surface p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-text-muted">Grade</h3>
                  <p className="font-mono text-xs tabular-nums">
                    {item.grade.total} / {item.marks} · {item.grade.gradedBy}
                  </p>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {item.grade.rubricScores.map((score, index) => (
                    <li key={`${score.heading}-${index}`} className="text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{score.heading}</span>
                        <span className="font-mono text-xs tabular-nums">
                          {score.awarded} / {score.max}
                        </span>
                      </div>
                      {score.comment && <p className="text-xs text-text-muted">{score.comment}</p>}
                    </li>
                  ))}
                </ul>
                {item.grade.feedback && (
                  <p className="reading mt-2 whitespace-pre-wrap text-sm">{item.grade.feedback}</p>
                )}
                {item.grade.mistakeTags.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {item.grade.mistakeTags.map((tag) => (
                      <li key={tag}>
                        <Chip>{mistakeLabel(tag)}</Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {pending && (
              <div className="mt-3">
                <Banner tone="warning">
                  This answer is awaiting grading. The score above excludes its marks until a grade is saved.
                </Banner>
              </div>
            )}

            {item.cites.length > 0 && (
              <div className="mt-3">
                <h3 className="text-xs font-semibold text-text-muted">Citations</h3>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {item.cites.map((cite, index) => (
                    <li key={`${cite.note}-${index}`}>
                      <Chip>
                        {cite.note}
                        {cite.anchor ? `#${cite.anchor}` : ""}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        </div>
        <span className="mt-0.5 flex flex-col items-end gap-1 text-right">
          <span className="text-xs font-semibold text-text-muted">{statusLabel}</span>
          {pending ? (
            <Clock aria-label="Pending" className="size-5 text-warning" />
          ) : item.type === "theory" ? (
            <CheckCircle2 aria-label="Graded" className="size-5 text-text-muted" />
          ) : item.correct ? (
            <CheckCircle2 aria-label="Correct" className="size-5 text-correct" />
          ) : (
            <X aria-label="Incorrect" className="size-5 text-incorrect" />
          )}
        </span>
      </div>
    </li>
  );
}

function AnswerView({
  item,
  attemptId,
  photo,
}: {
  item: AttemptResults["items"][number];
  attemptId: string;
  photo: string | null;
}) {
  const text = theoryAnswer(item.response);
  return (
    <div className="mt-1 space-y-2">
      {photo && (
        <img
          src={photoUrl(attemptId, item.questionId, photo)}
          alt="Handwritten answer"
          loading="lazy"
          className="max-h-96 w-full rounded-control border border-border-subtle bg-surface object-contain"
        />
      )}
      {item.type === "tf_multi" ? (
        <ol className="space-y-1 text-sm">
          {(item.body.statements ?? []).map((statement, index) => (
            <li key={index}>
              <span className="text-text-muted">{index + 1}. </span>
              {statement.text}
              <span className="ml-2 font-semibold">
                {tfAnswers(item.response)[index] === undefined
                  ? "—"
                  : tfAnswers(item.response)[index]
                    ? "True"
                    : "False"}
              </span>
            </li>
          ))}
        </ol>
      ) : item.type === "mcq_single" ? (
        <McqAnswer item={item} />
      ) : text ? (
        <p className="reading whitespace-pre-wrap text-sm">{text}</p>
      ) : photo ? (
        <p className="text-sm text-text-muted">Photo answer</p>
      ) : (
        <p className="text-sm text-text-muted">No answer saved.</p>
      )}
    </div>
  );
}

function McqAnswer({ item }: { item: AttemptResults["items"][number] }) {
  const answer = mcqAnswer(item.response);
  if (!answer) return <p className="mt-1 text-sm text-text-muted">No answer saved.</p>;
  return (
    <p className="mt-1 text-sm">
      <span className="font-semibold">{answer}</span>
      {item.body.options?.[answer] ? ` — ${item.body.options[answer]}` : ""}
    </p>
  );
}

function CorrectView({ item }: { item: AttemptResults["items"][number] }) {
  if (item.type === "tf_multi") {
    return (
      <ol className="mt-1 space-y-1 text-sm">
        {(item.body.statements ?? []).map((statement, index) => (
          <li key={index}>
            <span className="text-text-muted">{index + 1}. </span>
            {statement.text}
            <span className="ml-2 font-semibold text-correct">
              {statement.answer ? "True" : "False"}
            </span>
          </li>
        ))}
      </ol>
    );
  }
  if (item.type === "mcq_single") {
    const answer = item.body.answer ?? "";
    return (
      <p className="mt-1 text-sm">
        <span className="font-semibold text-correct">{answer}</span>
        {item.body.options?.[answer] ? ` — ${item.body.options[answer]}` : ""}
      </p>
    );
  }
  if (item.type === "spotter") {
    return (
      <p className="mt-1 text-sm">
        <span className="font-semibold text-correct">{item.body.answer ?? "No answer"}</span>
        {item.body.accepted && item.body.accepted.length > 0
          ? ` · also accepted: ${item.body.accepted.join(", ")}`
          : ""}
      </p>
    );
  }
  return (
    <p className="reading mt-1 whitespace-pre-wrap text-sm">
      {item.body.model_answer || "No model answer supplied."}
    </p>
  );
}

function mistakeLabel(tag: string): string {
  const labels: Record<string, string> = {
    knowledge_gap: "Knowledge gap",
    misread_question: "Misread question",
    wrong_structure: "Wrong structure",
    ran_out_of_time: "Ran out of time",
    careless: "Careless",
  };
  return labels[tag] ?? tag;
}

function typeLabel(type: QuestionType): string {
  return type === "tf_multi"
    ? "True / false"
    : type === "mcq_single"
      ? "MCQ"
      : type === "spotter"
        ? "Spotter"
        : "Theory";
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function hasAnswer(response: unknown): boolean {
  if (response === null || response === undefined) return false;
  if (typeof response === "object") {
    const value = response as Record<string, unknown>;
    if (Array.isArray(value.statements)) return value.statements.some((item) => typeof item === "boolean");
    if (typeof value.answer === "string") return value.answer.length > 0;
    if (typeof value.text === "string") return value.text.trim().length > 0;
  }
  return false;
}

function mcqOptions(question: Question): Record<string, string> {
  return (question.body.options ?? {}) as Record<string, string>;
}

function mcqAnswer(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const value = (response as { answer?: unknown }).answer;
  return typeof value === "string" ? value : null;
}

function tfAnswers(response: unknown): (boolean | null)[] {
  if (!response || typeof response !== "object") return [];
  const value = (response as { statements?: unknown }).statements;
  return Array.isArray(value) ? value.map((item) => (typeof item === "boolean" ? item : null)) : [];
}

function theoryAnswer(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const value = (response as { text?: unknown }).text;
  return typeof value === "string" ? value : "";
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

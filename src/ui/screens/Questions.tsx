import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListChecks,
  X,
} from "lucide-react";
import {
  api,
  assetUrl,
  type Course,
  type NoteDetail,
  type Question,
  type QuestionInput,
  type QuestionType,
} from "../api.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { Banner, Chip, EmptyState, ProgressBar, Skeleton } from "../components/ui.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { Markdown } from "../Markdown.tsx";
import { plural } from "../lib/format.ts";
import { readActiveAttempt } from "../lib/activeAttempt.ts";
import { defaultCourse } from "../lib/courses.ts";
import { graphHref, navigate } from "../lib/router.ts";
import { Papers } from "./Papers.tsx";

const TYPE_LABEL: Record<QuestionType, string> = {
  tf_multi: "True / false",
  mcq_single: "MCQ",
  theory: "Theory",
  spotter: "Spotter",
};

const field =
  "min-h-11 w-full rounded-control border border-border-strong bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted";
const label = "mb-1.5 block text-xs font-semibold text-text";

type Mode = "bank" | "review" | "papers";

export function Questions({ courses }: { courses: Course[] }) {
  const params = new URLSearchParams(window.location.search);
  const requestedCourse = params.get("course");
  const requestedQuestion = params.get("q");
  const [courseCode, setCourseCode] = useState(
    () =>
      (requestedCourse && courses.some((course) => course.code === requestedCourse)
        ? requestedCourse
        : readActiveAttempt()?.course ?? defaultCourse(courses, "questions")),
  );
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(() => (readActiveAttempt() ? "papers" : "bank"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [status, setStatus] = useState<"all" | "verified" | "unverified">("all");
  const [type, setType] = useState<"all" | QuestionType>("all");

  useEffect(() => {
    if (courseCode) return;
    const active = readActiveAttempt();
    const next =
      active && courses.some((course) => course.code === active.course)
        ? active.course
        : defaultCourse(courses, "questions");
    if (next) setCourseCode(next);
  }, [courses, courseCode]);

  useEffect(() => {
    if (!courseCode) return;
    let cancelled = false;
    setQuestions(null);
    setError(null);
    api
      .questions({ course: courseCode })
      .then((list) => {
        if (cancelled) return;
        setQuestions(list);
        setSelectedId((current) =>
          requestedQuestion && list.some((question) => question.id === requestedQuestion)
            ? requestedQuestion
            : current && list.some((question) => question.id === current)
            ? current
            : (list.find((question) => !question.verified)?.id ?? list[0]?.id ?? null),
        );
        if (requestedQuestion && list.some((question) => question.id === requestedQuestion)) {
          setMode("review");
        }
      })
      .catch((err: unknown) => !cancelled && setError(messageOf(err)));
    return () => {
      cancelled = true;
    };
  }, [courseCode, requestedQuestion]);

  const selected = questions?.find((question) => question.id === selectedId) ?? null;
  const verified = questions?.filter((question) => question.verified).length ?? 0;
  const unverified = (questions?.length ?? 0) - verified;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (questions ?? []).filter((question) => {
      if (status === "verified" && !question.verified) return false;
      if (status === "unverified" && question.verified) return false;
      if (type !== "all" && question.type !== type) return false;
      if (!needle) return true;
      const haystack = [
        question.id,
        question.body.stem,
        question.body.prompt,
        question.topics.join(" "),
        question.sourcePaper,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [questions, query, status, type]);

  function updateQuestion(next: Question) {
    setQuestions((list) => list?.map((item) => (item.id === next.id ? next : item)) ?? null);
  }

  function openReview(id: string) {
    setSelectedId(id);
    setMode("review");
    setMessage(null);
    window.scrollTo({ top: 0 });
  }

  function startQueue() {
    const next = questions?.find((question) => !question.verified);
    if (next) openReview(next.id);
  }

  const nextUnverified = questions?.find(
    (question) => !question.verified && question.id !== selectedId,
  );

  if (courses.length === 0) {
    return (
      <div className="w-full">
        <p className="reading mt-1 type-body-sm text-text-muted">
          Browse, verify and review the cited questions used by exam papers.
        </p>
        <div className="mt-6">
          <EmptyState title="No courses yet">
            Add a course and import past papers first. The question bank is built from cited items.
          </EmptyState>
        </div>
      </div>
    );
  }

  const activeCourse = courses.find((course) => course.code === courseCode) ?? courses[0];

  if (mode === "papers") {
    return <Papers course={activeCourse} onBack={() => setMode("bank")} />;
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="reading mt-1 type-body-sm text-text-muted">
            {mode === "review"
              ? "Check the parsed question against its source, then mark it verified."
              : "The question bank and past-paper verification."}
          </p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <label className="block min-w-48 flex-1">
            <span className="sr-only">Course</span>
            <select
              value={courseCode}
              onChange={(event) => {
                setCourseCode(event.target.value);
                setMode("bank");
                setQuery("");
                setSelectedId(null);
              }}
              className={field}
            >
              {courses.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.title} ({course.code})
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" onClick={() => setMode("papers")}>
            <FileText aria-hidden="true" className="size-4" />
            Build or take an exam
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {questions === null ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-5">
          <Skeleton lines={6} />
        </div>
      ) : questions.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No questions yet"
            action={
              <p className="text-sm text-text-muted">
                Ask an agent to run <code className="font-mono">import_past_paper</code> or{" "}
                <code className="font-mono">add_questions</code>.
              </p>
            }
          >
            Questions are banked only with a citation whose quote appears in the source note.
          </EmptyState>
        </div>
      ) : mode === "bank" ? (
        <BankView
          questions={filtered}
          total={questions.length}
          verified={verified}
          unverified={unverified}
          query={query}
          status={status}
          type={type}
          onQuery={setQuery}
          onStatus={setStatus}
          onType={setType}
          onOpen={openReview}
          onQueue={startQueue}
        />
      ) : selected ? (
        <ReviewView
          question={selected}
          next={nextUnverified}
          verified={verified}
          total={questions.length}
          message={message}
          onBack={() => {
            setMode("bank");
            setMessage(null);
          }}
          onSaved={updateQuestion}
          onVerified={(next) => {
            updateQuestion(next);
            setMessage(
              next.verified
                ? "Verified. This question can now enter exam papers."
                : "Moved back to the review queue.",
            );
          }}
          onNext={() => {
            if (nextUnverified) openReview(nextUnverified.id);
          }}
          setMessage={setMessage}
        />
      ) : (
        <div className="mt-6">
          <Banner tone="warning">Pick a question from the bank to review.</Banner>
        </div>
      )}
    </div>
  );
}

function BankView({
  questions,
  total,
  verified,
  unverified,
  query,
  status,
  type,
  onQuery,
  onStatus,
  onType,
  onOpen,
  onQueue,
}: {
  questions: Question[];
  total: number;
  verified: number;
  unverified: number;
  query: string;
  status: "all" | "verified" | "unverified";
  type: "all" | QuestionType;
  onQuery: (value: string) => void;
  onStatus: (value: "all" | "verified" | "unverified") => void;
  onType: (value: "all" | QuestionType) => void;
  onOpen: (id: string) => void;
  onQueue: () => void;
}) {
  return (
    <>
      <section aria-label="Question bank progress" className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="type-body-sm tabular-nums text-text">
              {verified} of {total} verified
            </p>
            <p className="mt-0.5 type-meta text-text-muted">
              Unverified questions stay out of exam papers.
            </p>
          </div>
          {unverified > 0 && (
            <Button variant="primary" onClick={onQueue}>
              <ListChecks aria-hidden="true" className="size-5" />
              Review {plural(unverified, "question")}
            </Button>
          )}
        </div>
        <div className="mt-3">
          <ProgressBar label="Verified" value={verified} max={total} />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className={label}>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Stem, topic or id"
            className={field}
          />
        </label>
        <label>
          <span className={label}>Type</span>
          <select
            value={type}
            onChange={(event) => onType(event.target.value as typeof type)}
            className={`${field} min-w-40`}
          >
            <option value="all">All types</option>
            <option value="tf_multi">True / false</option>
            <option value="mcq_single">MCQ</option>
            <option value="theory">Theory</option>
            <option value="spotter">Spotter</option>
          </select>
        </label>
        <div>
          <span className={label}>Status</span>
          <div
            role="group"
            aria-label="Verification status"
            className="flex rounded-control border border-border-strong p-0.5"
          >
            {(["all", "unverified", "verified"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => onStatus(value)}
                className={`min-h-11 rounded-[calc(var(--radius-control)-2px)] px-3 type-body-sm font-medium ${
                  status === value ? "bg-primary text-on-primary" : "text-text-muted hover:bg-surface-2"
                }`}
              >
                {value === "all" ? "All" : value === "unverified" ? "Needs check" : "Verified"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No matching questions">Clear the filters to see the bank.</EmptyState>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
          {questions.map((question) => (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onOpen(question.id)}
                className="flex w-full items-start gap-3 py-4 text-left hover:bg-surface"
              >
                <span className="mt-0.5">
                  {question.verified ? (
                    <CheckCircle2 aria-label="Verified" className="size-5 text-correct" />
                  ) : (
                    <AlertTriangle aria-label="Needs check" className="size-5 text-warning" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="type-body-sm font-medium text-text">
                      {question.body.stem ?? question.body.prompt ?? question.id}
                    </span>
                    <span className="font-mono type-meta text-text-muted">{question.id}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <Chip>{TYPE_LABEL[question.type]}</Chip>
                    <Chip>{plural(question.marks, "mark")}</Chip>
                    {question.topics.map((topic) => (
                      <Chip key={topic}>{topic}</Chip>
                    ))}
                    <Chip>{question.verified ? "Verified" : "Needs check"}</Chip>
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReviewView({
  question,
  next,
  verified,
  total,
  message,
  onBack,
  onSaved,
  onVerified,
  onNext,
  setMessage,
}: {
  question: Question;
  next: Question | undefined;
  verified: number;
  total: number;
  message: string | null;
  onBack: () => void;
  onSaved: (question: Question) => void;
  onVerified: (question: Question) => void;
  onNext: () => void;
  setMessage: (value: string | null) => void;
}) {
  const [source, setSource] = useState<NoteDetail | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const isImage = Boolean(question.sourcePaper && /\.(png|jpe?g|webp|svg)$/i.test(question.sourcePaper));

  useEffect(() => {
    setSource(null);
    setSourceError(null);
    if (!question.sourcePaper || isImage) return;
    let cancelled = false;
    api
      .note(question.sourcePaper)
      .then((note) => !cancelled && setSource(note))
      .catch((err: unknown) => !cancelled && setSourceError(messageOf(err)));
    return () => {
      cancelled = true;
    };
  }, [question.sourcePaper, isImage]);

  const sourcePanel = (
    <SourcePanel
      sourcePaper={question.sourcePaper}
      note={source}
      error={sourceError}
      isImage={isImage}
      questionId={question.id}
      onZoom={setZoom}
    />
  );

  return (
    <section className="mt-6" aria-label={`Review question ${question.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="px-2" onClick={onBack}>
          <ChevronLeft aria-hidden="true" className="size-5" />
          <span className="hidden sm:inline">Question bank</span>
        </Button>
        <span className="ml-auto font-mono type-meta text-text-muted tabular-nums">
          {verified} of {total} verified
        </span>
        <Button variant="secondary" onClick={onNext} disabled={!next}>
          Next unverified
          <ChevronRight aria-hidden="true" className="size-5" />
        </Button>
      </div>

      {message && (
        <div className="mt-3">
          <Banner tone={message.includes("review queue") ? "warning" : "success"}>{message}</Banner>
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-panel border border-border-subtle bg-surface">
            {sourcePanel}
          </div>
        </aside>

        <div>
          <div className="lg:hidden">
            <Button variant="secondary" onClick={() => setSourceOpen(true)}>
              <FileText aria-hidden="true" className="size-5" />
              View source
            </Button>
            <Sheet open={sourceOpen} title="Source" onClose={() => setSourceOpen(false)}>
              <SourcePanel
                sourcePaper={question.sourcePaper}
                note={source}
                error={sourceError}
                isImage={isImage}
                questionId={question.id}
                onZoom={setZoom}
                hideTitle
              />
            </Sheet>
          </div>

          <div className="rounded-panel border border-border-subtle bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="type-meta text-text-muted">{question.id}</p>
                <h2 className="mt-1 type-heading">
                  {TYPE_LABEL[question.type]}
                  {question.questionKind ? ` · ${question.questionKind}` : ""}
                </h2>
              </div>
              {question.verified ? (
                <span className="inline-flex items-center gap-1.5 rounded-chip border border-correct/40 bg-correct-soft px-2.5 py-1 type-body-sm font-medium text-correct">
                  <CheckCircle2 aria-hidden="true" className="size-5" />
                  Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-chip border border-warning/40 bg-warning-soft px-2.5 py-1 type-body-sm font-medium text-warning">
                  <AlertTriangle aria-hidden="true" className="size-5" />
                  Needs check
                </span>
              )}
            </div>

            {!question.verified && (
              <div className="mt-3">
                <Banner tone="warning">
                  Compare with the source before marking. Unverified content is excluded from exam papers.
                </Banner>
              </div>
            )}

            {question.conceptIds.length > 0 && (
              <section className="mt-4" aria-labelledby="linked-concepts-heading">
                <h3 id="linked-concepts-heading" className="type-label text-text-muted">
                  Linked concepts
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {question.conceptIds.map((conceptId) => (
                    <button
                      key={conceptId}
                      type="button"
                      onClick={() =>
                        navigate(
                          graphHref(question.course, conceptId),
                        )
                      }
                      className="min-h-11 rounded-chip border border-border-subtle bg-surface-2 px-3 type-body-sm text-text hover:border-primary hover:bg-primary-soft"
                    >
                      {conceptId}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <QuestionEditor
              key={question.id}
              question={question}
              onSaved={(saved) => {
                onSaved(saved);
                setMessage("Draft saved. The citation still points at the original source.");
              }}
              onVerified={(value) => {
                onVerified(value);
                setMessage(
                  value.verified
                    ? "Verified. This question can now enter exam papers."
                    : "Moved back to the review queue.",
                );
              }}
            />
          </div>
        </div>
      </div>

      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Source image"
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4"
          onClick={() => setZoom(null)}
        >
          <div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img src={zoom} alt="" className="max-h-[85dvh] w-auto rounded-panel object-contain" />
            <IconButton label="Close" className="absolute top-2 right-2 bg-surface" onClick={() => setZoom(null)}>
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
        </div>
      )}
    </section>
  );
}

function SourcePanel({
  sourcePaper,
  note,
  error,
  isImage,
  questionId,
  onZoom,
  hideTitle = false,
}: {
  sourcePaper: string | null;
  note: NoteDetail | null;
  error: string | null;
  isImage: boolean;
  questionId: string;
  onZoom: (src: string) => void;
  hideTitle?: boolean;
}) {
  if (!sourcePaper) {
    return (
      <div className="p-4">
        <p className="text-sm text-text-muted">No source paper recorded for {questionId}.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          {!hideTitle && <h2 className="text-sm font-semibold">Source</h2>}
          <p className="mt-0.5 truncate font-mono text-xs text-text-muted" title={sourcePaper}>
            {sourcePaper.split("/").pop()}
          </p>
        </div>
        <a
          href={`#note=${encodeURIComponent(sourcePaper)}`}
          className="shrink-0 text-xs font-semibold text-primary hover:underline"
        >
          Open note
        </a>
      </div>
      <div className="p-4">
        {error ? (
          <Banner tone="warning">Source note unavailable: {error}</Banner>
        ) : isImage ? (
          <button
            type="button"
            onClick={() => onZoom(`/api/asset?path=${encodeURIComponent(sourcePaper)}`)}
            className="block w-full"
          >
            <img
              src={`/api/asset?path=${encodeURIComponent(sourcePaper)}`}
              alt="Original past paper"
              className="w-full rounded-control border border-border-subtle"
            />
          </button>
        ) : note ? (
          <div className="text-sm">
            <Markdown
              body={note.body}
              notePath={note.path}
              onOpenNote={() => undefined}
              onZoomImage={(src) => onZoom(src)}
            />
          </div>
        ) : (
          <Skeleton lines={8} />
        )}
      </div>
    </div>
  );
}

function QuestionEditor({
  question,
  onSaved,
  onVerified,
}: {
  question: Question;
  onSaved: (question: Question) => void;
  onVerified: (question: Question) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(question));
  const [busy, setBusy] = useState<"save" | "verify" | "unverify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(question));

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
    setError(null);
  }

  function payload(): QuestionInput {
    const common = {
      type: question.type,
      question_kind: draft.questionKind.trim() || undefined,
      topics: splitList(draft.topics),
      marks: Number(draft.marks),
      cites: question.cites,
      source_paper: question.sourcePaper ?? undefined,
    };
    if (question.type === "tf_multi") {
      return {
        ...common,
        stem: draft.stem.trim(),
        statements: draft.statements.map((statement) => ({
          text: statement.text.trim(),
          answer: statement.answer,
        })),
        explanation: draft.explanation.trim() || undefined,
        scoring: question.body.scoring,
      };
    }
    if (question.type === "mcq_single") {
      return {
        ...common,
        stem: draft.stem.trim(),
        options: Object.fromEntries(draft.options.map((option) => [option.key, option.text.trim()])),
        answer: draft.answer,
        explanation: draft.explanation.trim() || undefined,
      };
    }
    if (question.type === "spotter") {
      return {
        ...common,
        prompt: draft.prompt.trim(),
        image: draft.image.trim(),
        answer: draft.answer.trim(),
        accepted: splitList(draft.accepted),
        explanation: draft.explanation.trim() || undefined,
      };
    }
    return {
      ...common,
      question_kind: draft.questionKind.trim(),
      prompt: draft.prompt.trim(),
      model_answer: draft.modelAnswer.trim() || undefined,
      rubric: draft.rubric.trim() || undefined,
      answer_input: draft.answerInput,
    };
  }

  function validate(): string | null {
    if (!Number.isFinite(Number(draft.marks)) || Number(draft.marks) <= 0) {
      return "Marks must be a positive number.";
    }
    if (question.type === "tf_multi") {
      if (!draft.stem.trim()) return "Add the stem.";
      if (draft.statements.some((statement) => !statement.text.trim())) {
        return "Every statement needs text.";
      }
    }
    if (question.type === "mcq_single") {
      if (!draft.stem.trim()) return "Add the stem.";
      if (draft.options.some((option) => !option.text.trim())) return "Every option needs text.";
      if (!draft.options.some((option) => option.key === draft.answer)) {
        return "Pick the correct option.";
      }
    }
    if (question.type === "theory") {
      if (!draft.prompt.trim()) return "Add the prompt.";
      if (!draft.questionKind.trim()) return "Theory questions need a question kind.";
    }
    if (question.type === "spotter") {
      if (!draft.prompt.trim()) return "Add the spotter prompt.";
      if (!draft.image.trim()) return "Add the image path.";
      if (!draft.answer.trim()) return "Add the expected answer.";
    }
    return null;
  }

  async function save(markVerified?: boolean) {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(markVerified === undefined ? "save" : markVerified ? "verify" : "unverify");
    setError(null);
    try {
      const updated = await api.updateQuestion(question.id, payload());
      if (markVerified === undefined) {
        onSaved(updated);
        setSaved(true);
      } else {
        const checked = await api.verifyQuestion(updated.id, markVerified);
        onVerified(checked);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {error && <Banner tone="error">{error}</Banner>}
      {saved && !dirty && <Banner tone="success">Draft saved.</Banner>}

      {question.type === "tf_multi" && (
        <>
          <TextField
            label="Stem"
            value={draft.stem}
            onChange={(value) => patchDraft({ stem: value })}
            multiline
          />
          <fieldset>
            <legend className={label}>Statements</legend>
            <ul className="space-y-2">
              {draft.statements.map((statement, index) => (
                <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    aria-label={`Statement ${index + 1}`}
                    value={statement.text}
                    onChange={(event) =>
                      patchDraft({
                        statements: draft.statements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                    className={field}
                  />
                  <TrueFalse
                    value={statement.answer}
                    onChange={(answer) =>
                      patchDraft({
                        statements: draft.statements.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, answer } : item,
                        ),
                      })
                    }
                    index={index}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
          <TextField
            label="Explanation (optional)"
            value={draft.explanation}
            onChange={(value) => patchDraft({ explanation: value })}
            multiline
          />
        </>
      )}

      {question.type === "mcq_single" && (
        <>
          <TextField
            label="Stem"
            value={draft.stem}
            onChange={(value) => patchDraft({ stem: value })}
            multiline
          />
          <fieldset>
            <legend className={label}>Options · pick the correct one</legend>
            <ul className="space-y-2">
              {draft.options.map((option) => (
                <li key={option.key} className="flex items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-control border border-border-strong font-mono text-sm">
                    {option.key}
                  </span>
                  <input
                    aria-label={`Option ${option.key}`}
                    value={option.text}
                    onChange={(event) =>
                      patchDraft({
                        options: draft.options.map((item) =>
                          item.key === option.key ? { ...item, text: event.target.value } : item,
                        ),
                      })
                    }
                    className={field}
                  />
                  <label className="flex min-h-11 shrink-0 items-center gap-2 px-1 text-xs text-text-muted">
                    <input
                      type="radio"
                      name={`answer-${question.id}`}
                      checked={draft.answer === option.key}
                      onChange={() => patchDraft({ answer: option.key })}
                      className="size-5 accent-[var(--primary)]"
                    />
                    Correct
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <TextField
            label="Explanation (optional)"
            value={draft.explanation}
            onChange={(value) => patchDraft({ explanation: value })}
            multiline
          />
        </>
      )}

      {question.type === "theory" && (
        <>
          <TextField
            label="Prompt"
            value={draft.prompt}
            onChange={(value) => patchDraft({ prompt: value })}
            multiline
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Question kind"
              value={draft.questionKind}
              onChange={(value) => patchDraft({ questionKind: value })}
              hint="e.g. muscle, region, mechanism"
            />
            <TextField
              label="Marks"
              value={draft.marks}
              onChange={(value) => patchDraft({ marks: value })}
              inputMode="decimal"
            />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-text">Answer input</span>
            <select
              value={draft.answerInput}
              onChange={(event) =>
                patchDraft({ answerInput: event.target.value as Draft["answerInput"] })
              }
              className={field}
            >
              <option value="text">Typed text</option>
              <option value="text_and_drawing">Text and drawing (optional photo)</option>
              <option value="photo">Photo of handwriting</option>
            </select>
            <p className="mt-1 text-xs text-text-muted">
              Photo answers upload to this device; nothing leaves it.
            </p>
          </label>
          <TextField
            label="Model answer (optional)"
            value={draft.modelAnswer}
            onChange={(value) => patchDraft({ modelAnswer: value })}
            multiline
          />
          <TextField
            label="Rubric (optional)"
            value={draft.rubric}
            onChange={(value) => patchDraft({ rubric: value })}
            multiline
          />
        </>
      )}

      {question.type === "spotter" && (
        <>
          <TextField
            label="Prompt"
            value={draft.prompt}
            onChange={(value) => patchDraft({ prompt: value })}
            multiline
            hint="e.g. Identify the structure marked with an arrow."
          />
          <TextField
            label="Image"
            value={draft.image}
            onChange={(value) => patchDraft({ image: value })}
            hint="Relative to the cited note, or a vault path starting with courses/"
          />
          {draft.image.trim() && (
            <img
              src={spotterPreview(question, draft.image.trim())}
              alt="Spotter image preview"
              className="max-h-80 w-full rounded-control border border-border-subtle object-contain"
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Expected answer"
              value={draft.answer}
              onChange={(value) => patchDraft({ answer: value })}
            />
            <TextField
              label="Also accept"
              value={draft.accepted}
              onChange={(value) => patchDraft({ accepted: value })}
              hint="Comma separated"
            />
          </div>
          <TextField
            label="Explanation (optional)"
            value={draft.explanation}
            onChange={(value) => patchDraft({ explanation: value })}
            multiline
          />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <TextField
          label="Topics"
          value={draft.topics}
          onChange={(value) => patchDraft({ topics: value })}
          hint="Comma separated"
        />
        {question.type !== "theory" && (
          <TextField
            label="Marks"
            value={draft.marks}
            onChange={(value) => patchDraft({ marks: value })}
            inputMode="decimal"
          />
        )}
      </div>

      <section aria-labelledby="cites-heading" className="rounded-control border border-border-subtle bg-bg p-3">
        <h3 id="cites-heading" className="text-xs font-semibold text-text">
          Citations
        </h3>
        <ul className="mt-2 space-y-2">
          {question.cites.map((cite) => (
            <li key={`${cite.note}-${cite.anchor}`} className="text-xs">
              <p className="flex items-center gap-1.5 font-mono text-text-muted">
                <FileText aria-hidden="true" className="size-3.5" />
                {cite.note}
                {cite.anchor ? `#${cite.anchor}` : ""}
              </p>
              {cite.quote && (
                <blockquote className="mt-1 border-l-2 border-accent pl-2 text-text-muted">
                  “{cite.quote}”
                </blockquote>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-muted">
          Citations are fixed at import. Re-import to change the source.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" variant="secondary" loading={busy === "save"} loadingLabel="Saving…">
          Save draft
        </Button>
        {question.verified ? (
          <Button
            variant="ghost"
            loading={busy === "unverify"}
            loadingLabel="Updating…"
            onClick={() => void save(false)}
          >
            <X aria-hidden="true" className="size-4" />
            Unverify
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={busy === "verify"}
            loadingLabel="Verifying…"
            onClick={() => void save(true)}
          >
            <Check aria-hidden="true" className="size-4" />
            Mark verified
          </Button>
        )}
        {dirty && <span className="text-xs text-text-muted">Unsaved changes</span>}
      </div>
    </form>
  );
}

function TrueFalse({
  value,
  onChange,
  index,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  index: number;
}) {
  return (
    <div
      role="group"
      aria-label={`Statement ${index + 1} answer`}
      className="flex shrink-0 rounded-control border border-border-strong p-0.5"
    >
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`min-h-11 min-w-16 rounded-[calc(var(--radius-control)-2px)] px-2 text-xs font-semibold ${
            value === option ? "bg-primary text-on-primary" : "text-text-muted hover:bg-surface-2"
          }`}
        >
          {option ? "True" : "False"}
        </button>
      ))}
    </div>
  );
}

function TextField({
  label: text,
  value,
  onChange,
  hint,
  multiline,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  inputMode?: "decimal";
}) {
  const id = `field-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className={`${field} min-h-24 resize-y leading-6`}
        />
      ) : (
        <input
          id={id}
          value={value}
          inputMode={inputMode}
          onChange={(event) => onChange(event.target.value)}
          className={field}
        />
      )}
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

type Draft = {
  stem: string;
  prompt: string;
  explanation: string;
  modelAnswer: string;
  rubric: string;
  answerInput: "text" | "text_and_drawing" | "photo";
  questionKind: string;
  marks: string;
  topics: string;
  statements: { text: string; answer: boolean }[];
  options: { key: string; text: string }[];
  answer: string;
  accepted: string;
  image: string;
};

function toDraft(question: Question): Draft {
  const body = question.body;
  return {
    stem: body.stem ?? "",
    prompt: body.prompt ?? "",
    explanation: body.explanation ?? "",
    modelAnswer: body.model_answer ?? "",
    rubric: body.rubric ?? "",
    answerInput: body.answer_input ?? "text",
    questionKind: question.questionKind ?? "",
    marks: String(question.marks),
    topics: question.topics.join(", "),
    statements: body.statements ?? [],
    options: Object.entries(body.options ?? {}).map(([key, text]) => ({ key, text })),
    answer: body.answer ?? "",
    accepted: (body.accepted ?? []).join(", "),
    image: body.image ?? "",
  };
}

function spotterPreview(question: Question, image: string): string {
  if (!image) return "";
  if (/^(https?:|data:|\/)/.test(image)) return image;
  if (image.startsWith("courses/")) return `/api/asset?path=${encodeURIComponent(image)}`;
  return assetUrl(question.cites[0]?.note ?? `courses/${question.course}/course.md`, image);
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

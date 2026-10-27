import { useEffect, useState } from "react";
import {
  Check,
  ClipboardList,
  Clock,
  Copy,
  FileText,
  RefreshCw,
} from "lucide-react";
import {
  api,
  photoName,
  photoUrl,
  type Course,
  type MistakeTag,
  type PendingGradingItem,
  type RubricScore,
} from "../api.ts";
import { Button } from "../components/Button.tsx";
import { Banner, Chip, EmptyState, Skeleton } from "../components/ui.tsx";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { plural } from "../lib/format.ts";

const MISTAKE_TAGS: MistakeTag[] = [
  "knowledge_gap",
  "misread_question",
  "wrong_structure",
  "ran_out_of_time",
  "careless",
];

export function Grading({
  courses,
  onOpenExams,
}: {
  courses: Course[];
  onOpenExams: () => void;
}) {
  const [course, setCourse] = useState("");
  const [items, setItems] = useState<PendingGradingItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .pendingGrading(course || undefined)
      .then((list) => {
        if (cancelled) return;
        setItems(list);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(messageOf(err)));
    return () => {
      cancelled = true;
    };
  }, [course, reloadKey]);

  useEffect(
    () =>
      subscribeHarnessEvents((event) => {
        if (event.type === "graded" || event.type === "submitted") {
          setReloadKey((key) => key + 1);
        }
      }),
    [],
  );

  function graded(answerId: number) {
    setItems((current) => current?.filter((item) => item.answerId !== answerId) ?? null);
    setNotice("Grade saved. The student's results and evidence are updated.");
    setReloadKey((key) => key + 1);
  }

  const count = items?.length ?? 0;

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Grading queue</h1>
          <p className="reading mt-1 text-sm text-text-muted">
            Theory answers wait here. Grade them with an agent or paste the JSON it returns.
          </p>
        </div>
        <Button onClick={() => setReloadKey((key) => key + 1)}>
          <RefreshCw aria-hidden="true" className="size-4" />
          Refresh
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-text">Course</span>
          <select
            value={course}
            onChange={(event) => setCourse(event.target.value)}
            className="min-h-11 rounded-control border border-border-strong bg-surface px-3 text-sm"
          >
            <option value="">All courses</option>
            {courses.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <p className="text-sm text-text-muted" aria-live="polite">
          {items === null ? "Loading…" : `${plural(count, "answer")} waiting`}
        </p>
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <Banner tone="success" role="status">{notice}</Banner>
        </div>
      )}

      {items === null ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-5">
          <Skeleton lines={6} />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing waiting for a grade"
            action={<Button onClick={onOpenExams}>Open exam papers</Button>}
          >
            Submit a theory answer in a paper and it will appear here. Objective answers are graded instantly.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {items.map((item) => (
            <GradingCard key={item.answerId} item={item} onGraded={() => graded(item.answerId)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GradingCard({
  item,
  onGraded,
}: {
  item: PendingGradingItem;
  onGraded: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showBusy, setShowBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const photo = photoName(item.response);
  const text = responseText(item.response);
  const body = item.body;

  async function copyPrompt() {
    setCopying(true);
    setError(null);
    try {
      const value = prompt ?? (await api.gradingPrompt(item.answerId)).prompt;
      setPrompt(value);
      setShowPrompt(true);
      await copyText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setCopying(false);
    }
  }

  async function togglePrompt() {
    if (showPrompt) {
      setShowPrompt(false);
      return;
    }
    if (prompt) {
      setShowPrompt(true);
      return;
    }
    setShowBusy(true);
    setError(null);
    try {
      const value = (await api.gradingPrompt(item.answerId)).prompt;
      setPrompt(value);
      setShowPrompt(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setShowBusy(false);
    }
  }

  async function submit() {
    setError(null);
    const parsed = parseGradeJson(json, item);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setPending(true);
    try {
      await api.gradeAnswer(item.answerId, parsed.grade);
      setJson("");
      onGraded();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-panel border border-border-subtle bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{item.paperTitle}</p>
          <h2 className="mt-0.5 text-sm font-semibold">
            {item.body && "prompt" in item.body ? item.body.prompt : "Theory answer"}
          </h2>
          <p className="mt-1 flex flex-wrap gap-1.5">
            <Chip>{item.section}</Chip>
            <Chip>{plural(item.marks, "mark")}</Chip>
            {item.questionKind && <Chip>{item.questionKind}</Chip>}
            <Chip>
              <Clock aria-hidden="true" className="size-3.5" />
              {formatSeconds(item.timeSpentSec)}
            </Chip>
            {item.flagged && <Chip>Flagged</Chip>}
          </p>
        </div>
        <span className="font-mono text-xs text-text-muted">answer {item.answerId}</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section aria-label="Student answer" className="rounded-control border border-border-subtle bg-surface-2 p-3">
          <h3 className="text-xs font-semibold text-text-muted">Student answer</h3>
          {photo ? (
            <img
              src={photoUrl(item.attemptId, item.questionId, photo)}
              alt="Handwritten answer"
              className="mt-2 max-h-96 w-full rounded-control border border-border-subtle bg-surface object-contain"
            />
          ) : text ? (
            <p className="reading mt-2 whitespace-pre-wrap text-sm">{text}</p>
          ) : (
            <p className="mt-2 text-sm text-text-muted">No response saved.</p>
          )}
          {photo && text && <p className="reading mt-2 whitespace-pre-wrap text-sm">{text}</p>}
        </section>

        <section aria-label="Grading reference" className="rounded-control border border-border-subtle bg-surface-2 p-3">
          <h3 className="text-xs font-semibold text-text-muted">Reference</h3>
          <dl className="mt-2 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-semibold">Model answer</dt>
              <dd className="reading mt-1 text-sm text-text-muted">
                {("model_answer" in body && body.model_answer) || "None supplied."}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold">Rubric</dt>
              <dd className="reading mt-1 whitespace-pre-wrap text-sm text-text-muted">
                {("rubric" in body && body.rubric) || "None supplied — grade as one Overall heading."}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold">Citations</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {item.cites.length === 0 ? (
                  <span className="text-text-muted">None.</span>
                ) : (
                  item.cites.map((cite, index) => (
                    <Chip key={`${cite.note}-${index}`}>
                      <FileText aria-hidden="true" className="size-3.5" />
                      {cite.note}
                      {cite.anchor ? `#${cite.anchor}` : ""}
                    </Chip>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void copyPrompt()} loading={copying} loadingLabel="Copying…">
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? "Copied" : "Copy grading prompt"}
        </Button>
        <Button variant="ghost" onClick={() => void togglePrompt()} loading={showBusy} loadingLabel="Loading…">
          {showPrompt ? "Hide prompt" : "Show prompt"}
        </Button>
      </div>

      {showPrompt && prompt && (
        <div className="mt-3">
          <textarea
            readOnly
            value={prompt}
            rows={10}
            aria-label="Grading prompt"
            className="reading w-full rounded-control border border-border-strong bg-bg px-3 py-2 font-mono text-xs"
          />
        </div>
      )}

      <details className="mt-4 rounded-control border border-border-subtle bg-bg p-3">
        <summary className="cursor-pointer text-sm font-semibold">Paste grade JSON</summary>
        <p className="mt-1 text-xs text-text-muted">
          Paste the JSON returned by your grading agent. It is checked against the <code>submit_grade</code> schema.
        </p>
        <textarea
          value={json}
          onChange={(event) => setJson(event.target.value)}
          rows={6}
          spellCheck={false}
          aria-label="Grade JSON"
          placeholder={`{"answer_id": ${item.answerId}, "rubric_scores": [{"heading": "Overall", "awarded": 0, "max": ${item.marks}}], "feedback": "…", "mistake_tags": []}`}
          className="reading mt-2 w-full rounded-control border border-border-strong bg-surface px-3 py-2 font-mono text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void submit()} loading={pending} loadingLabel="Saving…">
            <ClipboardList aria-hidden="true" className="size-4" />
            Save grade
          </Button>
          <Button variant="ghost" onClick={() => setJson("")} disabled={pending}>
            Clear
          </Button>
        </div>
      </details>
    </li>
  );
}

function parseGradeJson(
  raw: string,
  item: PendingGradingItem,
): { grade: { rubric_scores: RubricScore[]; feedback: string; mistake_tags: MistakeTag[] } } | { error: string } {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!trimmed) return { error: "Paste the grade JSON first." };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { error: "That is not valid JSON." };
  }
  if (!value || typeof value !== "object") return { error: "The grade must be a JSON object." };
  const record = value as Record<string, unknown>;
  if (Number(record.answer_id) !== item.answerId) {
    return { error: `answer_id must be ${item.answerId}.` };
  }
  if (!Array.isArray(record.rubric_scores) || record.rubric_scores.length === 0) {
    return { error: "rubric_scores must be a non-empty array." };
  }
  const scores: RubricScore[] = [];
  for (const entry of record.rubric_scores) {
    if (!entry || typeof entry !== "object") return { error: "Every rubric score needs a heading, awarded and max." };
    const row = entry as Record<string, unknown>;
    const heading = typeof row.heading === "string" ? row.heading.trim() : "";
    const awarded = typeof row.awarded === "number" ? row.awarded : Number.NaN;
    const max = typeof row.max === "number" ? row.max : Number.NaN;
    if (!heading || !Number.isFinite(awarded) || !Number.isFinite(max) || awarded < 0 || max <= 0) {
      return { error: "Every rubric score needs a heading, a non-negative awarded and a positive max." };
    }
    if (awarded > max) return { error: `"${heading}" awards more than its maximum.` };
    scores.push({
      heading,
      awarded,
      max,
      ...(typeof row.comment === "string" && row.comment ? { comment: row.comment } : {}),
    });
  }
  const total = scores.reduce((sum, score) => sum + score.awarded, 0);
  if (total > item.marks + 0.001) {
    return { error: `The rubric awards ${total}, more than the ${item.marks} marks available.` };
  }
  const tags: MistakeTag[] = [];
  if (record.mistake_tags !== undefined) {
    if (!Array.isArray(record.mistake_tags)) return { error: "mistake_tags must be an array." };
    for (const tag of record.mistake_tags) {
      if (typeof tag !== "string" || !MISTAKE_TAGS.includes(tag as MistakeTag)) {
        return { error: `Unknown mistake tag: ${String(tag)}.` };
      }
      tags.push(tag as MistakeTag);
    }
  }
  return {
    grade: {
      rubric_scores: scores,
      feedback: typeof record.feedback === "string" ? record.feedback : "",
      mistake_tags: tags,
    },
  };
}

function responseText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const value = (response as { text?: unknown }).text;
  return typeof value === "string" ? value : "";
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

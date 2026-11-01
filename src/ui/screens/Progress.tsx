import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Minus,
  Play,
  RefreshCw,
  X,
} from "lucide-react";
import {
  api,
  type ConceptDetail,
  type ConceptNode,
  type ConceptSummary,
  type Course,
  type MasterySnapshot,
} from "../api.ts";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { plural } from "../lib/format.ts";
import { Button } from "../components/Button.tsx";
import { MasteryRing } from "../components/MasteryRing.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { Banner, Chip, EmptyState, ProgressBar, Skeleton } from "../components/ui.tsx";
import { defaultCourse } from "../lib/courses.ts";

const STATE_ORDER = ["unseen", "familiar", "understood", "mastered", "decayed"] as const;
const STATE_LABELS = {
  unseen: "Not seen",
  familiar: "Familiar",
  understood: "Understood",
  mastered: "Mastered",
  decayed: "Due for review",
} as const;

export function ProgressScreen({
  courses,
  onStudy,
  onOpenNote,
  onOpenGraph,
}: {
  courses: Course[];
  onStudy: (course: string, conceptId?: string) => void;
  onOpenNote: (path: string, anchor?: string) => void;
  onOpenGraph: (course: string, conceptId: string) => void;
}) {
  const [courseCode, setCourseCode] = useState(defaultCourse(courses, "concepts"));
  const [tree, setTree] = useState<ConceptNode[]>([]);
  const [snapshot, setSnapshot] = useState<MasterySnapshot | null>(null);
  const [proposed, setProposed] = useState<ConceptSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!courseCode && courses[0]) setCourseCode(defaultCourse(courses, "concepts"));
  }, [courses, courseCode]);

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    setTree([]);
    setProposed([]);
    setSelectedId(null);
  }, [courseCode]);

  useEffect(() => {
    if (!courseCode) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.mastery(courseCode),
      api.masteryTree(courseCode),
      api.concepts(courseCode, "proposed"),
    ])
      .then(([mastery, nodes, proposals]) => {
        if (cancelled) return;
        setSnapshot(mastery);
        setTree(nodes);
        setProposed(proposals);
        setExpanded(new Set(nodes.filter((node) => node.childCount > 0).map((node) => node.id)));
      })
      .catch((err: unknown) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [courseCode, reloadKey]);

  useEffect(() => {
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") {
        setReloadKey((key) => key + 1);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .concept(selectedId)
      .then((value) => !cancelled && setDetail(value))
      .catch((err: unknown) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const course = courses.find((item) => item.code === courseCode);
  const byId = new Map(tree.map((node) => [node.id, node]));
  const children = new Map<string, ConceptNode[]>();
  for (const node of tree) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  const visible = tree.filter((node) => {
    let parent = node.parentId;
    const seen = new Set<string>();
    while (parent) {
      if (seen.has(parent)) return true;
      seen.add(parent);
      if (!expanded.has(parent)) return false;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return true;
  });
  const dueCount = snapshot?.counts.decayed ?? 0;

  async function accept() {
    if (!detail) return;
    try {
      const updated = await api.updateConcept(detail.id, { status: "accepted" });
      setDetail(updated);
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function study(concept: ConceptDetail) {
    setSelectedId(null);
    onStudy(concept.course, concept.id);
  }

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mt-1 type-body-sm text-text-muted">
            Topics, mastery and the review queue. Mastery comes from evidence, never from a hand edit.
          </p>
        </div>
        {courses.length > 0 && (
          <label className="block type-body-sm font-medium">
            Course
            <select
              value={courseCode}
              onChange={(event) => {
                setCourseCode(event.target.value);
                setSelectedId(null);
              }}
              className="mt-1.5 min-h-11 w-full min-w-44 rounded-control border border-border bg-surface px-3 type-body-sm"
            >
              {courses.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Banner tone="error">{error}</Banner>
        </div>
      )}

      {loading && !snapshot ? (
        <div className="mt-6 space-y-4">
          <Skeleton lines={3} />
          <Skeleton lines={8} />
        </div>
      ) : courses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No courses yet">
            Add a course and cited concepts, then mastery appears here.
          </EmptyState>
        </div>
      ) : !snapshot || snapshot.counts.total === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No topics yet"
            action={
              <Button variant="primary" onClick={() => onStudy(courseCode)}>
                <Play aria-hidden="true" className="size-4" />
                Study this course
              </Button>
            }
          >
            Ask your teaching agent to add cited concepts with add_concept. Proposed topics stay
            flagged until you review them.
          </EmptyState>
        </div>
      ) : (
        <>
          <section aria-labelledby="overview-heading" className="mt-6 border-y border-border-subtle py-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="overview-heading" className="type-label">
                  {course?.title ?? courseCode}
                </h2>
                <p className="mt-0.5 font-mono type-body font-semibold tabular-nums text-text">
                  {snapshot.counts.mastered} of {snapshot.counts.total}
                  <span className="ml-2 type-body-sm font-normal text-text-muted">mastered</span>
                </p>
              </div>
              {dueCount > 0 && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const first = snapshot.concepts.find((item) => item.mastery.overdue);
                    onStudy(first?.course ?? courseCode, first?.id);
                  }}
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Start review
                </Button>
              )}
            </div>
            <div className="mt-3">
              <ProgressBar
                label="Mastered"
                value={snapshot.counts.mastered}
                max={snapshot.counts.total}
              />
            </div>
            <ul className="mt-4 flex flex-wrap gap-2">
              {STATE_ORDER.map((state) => (
                <li key={state}>
                  <Chip>
                    <MasteryRing state={state} size={16} />
                    <span className="type-body-sm">{STATE_LABELS[state]}</span>
                    <span className="font-mono type-meta tabular-nums">{snapshot.counts[state]}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          </section>

          {proposed.length > 0 && (
            <section aria-labelledby="proposed-heading" className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="proposed-heading" className="type-heading">Proposed topics</h2>
                <span className="font-mono type-meta tabular-nums text-text-muted">{proposed.length}</span>
              </div>
              <p className="reading mt-1 type-body-sm text-text-muted">
                Your agent proposed these. Accept them after checking the citation.
              </p>
              <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {proposed.map((concept) => (
                  <li key={concept.id} className="flex items-center gap-3 py-2">
                    <MasteryRing state={concept.mastery.state} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate type-body-sm font-medium">{concept.title}</p>
                      <p className="mt-0.5 truncate type-meta text-text-muted">
                        {concept.cites[0]?.note ?? "No citation"}
                      </p>
                    </div>
                    <Button onClick={() => setSelectedId(concept.id)}>Review</Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="topics-heading" className="mt-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="topics-heading" className="type-heading">Topics</h2>
              <ul className="flex flex-wrap gap-2 type-meta text-text-muted" aria-label="Mastery legend">
                {STATE_ORDER.map((state) => (
                  <li key={state} className="flex items-center gap-1">
                    <MasteryRing state={state} size={16} />
                    {STATE_LABELS[state]}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="mt-2 border-t border-border-subtle">
              {visible.map((node) => {
                const kids = children.get(node.id) ?? [];
                const open = expanded.has(node.id);
                return (
                  <li key={node.id} className="border-b border-border-subtle">
                    <div
                      className="flex min-h-11 items-center gap-1"
                      style={{ paddingLeft: `${Math.min(node.depth, 8) * 14}px` }}
                    >
                      {kids.length > 0 ? (
                        <button
                          type="button"
                          aria-label={`${open ? "Collapse" : "Expand"} ${node.title}`}
                          aria-expanded={open}
                          onClick={() => toggle(node.id)}
                          className="flex size-11 shrink-0 items-center justify-center rounded-control text-text-muted hover:bg-surface-2 hover:text-text"
                        >
                          {open ? (
                            <ChevronDown aria-hidden="true" className="size-5" />
                          ) : (
                            <ChevronRight aria-hidden="true" className="size-5" />
                          )}
                        </button>
                      ) : (
                        <span className="w-11 shrink-0" aria-hidden="true" />
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control pr-2 text-left hover:bg-surface-2"
                      >
                        <MasteryRing state={node.mastery.state} size={24} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="truncate type-body-sm font-medium">{node.title}</span>
                            {node.status === "proposed" && <span className="type-meta text-warning">Proposed</span>}
                            {node.lecturerFlag && <span className="type-meta text-accent">Lecturer flagged</span>}
                          </span>
                          <span className="block truncate type-meta text-text-muted">
                            {node.childCount > 0
                              ? `${node.rollup.mastered} of ${node.rollup.total} mastered in this branch`
                              : node.mastery.evidenceCount > 0
                                ? `${plural(node.mastery.evidenceCount, "piece")} of evidence`
                                : "No evidence yet"}
                          </span>
                        </span>
                        <span className="hidden shrink-0 type-meta text-text-muted sm:block">
                          {STATE_LABELS[node.mastery.state]}
                          {node.mastery.overdue && node.mastery.decayDueAt
                            ? ` · ${daysOverdue(node.mastery.decayDueAt)}d`
                            : ""}
                        </span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <Sheet
        open={Boolean(selectedId)}
        title={detail?.title ?? "Topic"}
        onClose={() => setSelectedId(null)}
      >
        {detailLoading || !detail ? (
          <Skeleton lines={8} />
        ) : (
        <ConceptPanel
          concept={detail}
          onAccept={() => void accept()}
          onAction={() => {
            setReloadKey((key) => key + 1);
            setSelectedId(null);
          }}
          onStudy={() => study(detail)}
          onOpenConcept={(id) => setSelectedId(id)}
          onOpenNote={onOpenNote}
          onOpenGraph={(conceptId) => onOpenGraph(detail.course, conceptId)}
        />
        )}
      </Sheet>
    </div>
  );
}

function ConceptPanel({
  concept,
  onAccept,
  onAction,
  onStudy,
  onOpenConcept,
  onOpenNote,
  onOpenGraph,
}: {
  concept: ConceptDetail;
  onAccept: () => void;
  onAction: () => void;
  onStudy: () => void;
  onOpenConcept: (id: string) => void;
  onOpenNote: (path: string, anchor?: string) => void;
  onOpenGraph: (conceptId: string) => void;
}) {
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);

  async function rejectConcept() {
    if (!confirm(`Reject “${concept.title}"?`)) return;
    try {
      await api.updateConcept(concept.id, { status: "rejected" });
      setMergeStatus("Rejected.");
      onAction();
    } catch (err) {
      setMergeStatus(messageOf(err));
    }
  }

  async function mergeIntoTarget() {
    const targetId = mergeTarget.trim();
    if (!targetId || targetId === concept.id) {
      setMergeStatus("Enter a different concept id.");
      return;
    }
    try {
      const target = await api.concept(targetId);
      const aliases = [...(target.aliases ?? []), concept.id];
      await api.updateConcept(targetId, { aliases });
      await api.updateConcept(concept.id, { status: "rejected" });
      setMergeStatus(`Merged into “${target.title}".`);
      onAction();
    } catch (err) {
      setMergeStatus(messageOf(err));
    }
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        <MasteryRing state={concept.mastery.state} size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{STATE_LABELS[concept.mastery.state]}</p>
          <p className="mt-0.5 text-xs text-text-muted">
            {concept.mastery.evidenceCount > 0
              ? `${plural(concept.mastery.evidenceCount, "piece")} of evidence`
              : "No evidence yet"}
            {concept.mastery.overdue && concept.mastery.decayDueAt
              ? ` · ${daysOverdue(concept.mastery.decayDueAt)} days overdue`
              : ""}
          </p>
        </div>
        {concept.status === "proposed" && <Chip>Proposed</Chip>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onStudy}>
          <Play aria-hidden="true" className="size-4" />
          Study this
        </Button>
        <Button
          variant="outline"
          onClick={() => onOpenGraph(concept.id)}
        >
          View in graph
        </Button>
        {concept.status === "proposed" && <Button onClick={onAccept}>Accept topic</Button>}
        {concept.status === "proposed" && (
          <Button variant="secondary" onClick={rejectConcept}>Reject</Button>
        )}
        {concept.status === "proposed" && (
          <>
            <input
              value={mergeTarget}
              onChange={(event) => setMergeTarget(event.target.value)}
              className="min-w-[140px] rounded-control border border-border bg-surface px-2 py-1.5 text-xs focus:border-primary-soft"
              placeholder="Merge into concept id…"
            />
            <Button onClick={mergeIntoTarget}>Merge</Button>
          </>
        )}
        {mergeStatus && (
          <span className={`text-xs ${mergeStatus?.startsWith("Rejected") || mergeStatus?.startsWith("Merged") ? "text-success" : "text-danger"}`}>
            {mergeStatus}
          </span>
        )}
      </div>

      <p className="reading mt-4 text-sm text-text">
        {concept.definition || "No definition written yet."}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-y border-border-subtle py-3 text-sm">
        <div>
          <dt className="text-xs text-text-muted">Exam weight</dt>
          <dd className="font-mono tabular-nums">{Math.round(concept.examWeight * 100)}%</dd>
        </div>
        <div>
          <dt className="text-xs text-text-muted">Confidence</dt>
          <dd>
            {concept.lecturerFlag ? "Lecturer flagged" : "Standard"}
            {concept.unverified ? " · Unverified" : ""}
          </dd>
        </div>
        {concept.aliases.length > 0 && (
          <div className="col-span-2">
            <dt className="text-xs text-text-muted">Also called</dt>
            <dd>{concept.aliases.join(", ")}</dd>
          </div>
        )}
      </dl>

      <Section title="Citations">
        {concept.cites.length === 0 ? (
          <p className="text-sm text-text-muted">No citation recorded.</p>
        ) : (
          <ul className="space-y-2">
            {concept.cites.map((cite, index) => (
              <li key={`${cite.note}-${index}`}>
                <button
                  type="button"
                  onClick={() => onOpenNote(cite.note, cite.anchor)}
                  className="flex min-h-11 w-full items-start gap-2 rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-left text-sm hover:border-border-strong"
                >
                  <FileText aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {cite.note}
                      {cite.anchor ? `#${cite.anchor}` : ""}
                    </span>
                    {cite.quote && (
                      <span className="reading mt-1 block text-xs text-text-muted">“{cite.quote}”</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Relations title="Prerequisites" items={concept.prerequisites} onOpen={onOpenConcept} />
      <Relations title="Related" items={concept.related} onOpen={onOpenConcept} />
      <Relations title="Contrasts with" items={concept.contrasts} onOpen={onOpenConcept} />
      <Relations title="Subtopics" items={concept.children} onOpen={onOpenConcept} />

      <Section title="Evidence timeline">
        {concept.timeline.length === 0 ? (
          <p className="text-sm text-text-muted">No evidence yet. Answer an activity or exam item.</p>
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {concept.timeline.slice(0, 12).map((item) => (
              <li key={item.id} className="flex items-start gap-2 py-2 text-sm">
                <EvidenceIcon correct={item.correct} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.correct === null ? "Seen" : item.correct ? "Correct" : "Incorrect"}
                    <span className="ml-2 text-xs font-normal text-text-muted">{prettyKind(item.kind)}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                    {item.activityTitle ? ` · ${item.activityTitle}` : ""}
                    {item.questionType ? ` · ${item.questionType}` : ""}
                    {item.timeSec > 0 ? ` · ${item.timeSec}s` : ""}
                  </p>
                  {item.excerpt && <p className="reading mt-1 text-xs text-text-muted">{item.excerpt}</p>}
                  {item.sessionNotePath && (
                    <button
                      type="button"
                      onClick={() => onOpenNote(item.sessionNotePath!)}
                      className="mt-1 min-h-11 text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Open session note
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Practice bank">
        {concept.practice.length === 0 ? (
          <p className="text-sm text-text-muted">No saved questions for this topic yet.</p>
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {concept.practice.map((item) => (
              <li key={item.id} className="py-2">
                <p className="text-sm">{item.prompt}</p>
                <p className="mt-0.5 text-xs text-text-muted">
                  {item.type} · {item.marks} {item.marks === 1 ? "mark" : "marks"} ·{" "}
                  {item.verified ? "Verified" : "Unverified"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Relations({
  title,
  items,
  onOpen,
}: {
  title: string;
  items: ConceptSummary[];
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Section title={title}>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onOpen(item.id)}
              className="inline-flex min-h-11 items-center gap-2 rounded-chip border border-border-subtle bg-surface px-3 text-sm hover:border-border-strong"
            >
              <MasteryRing state={item.mastery.state} size={16} />
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function EvidenceIcon({ correct }: { correct: boolean | null }) {
  if (correct === null) {
    return <Minus aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />;
  }
  return correct ? (
    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-correct" />
  ) : (
    <X aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-incorrect" />
  );
}

function prettyKind(kind: string): string {
  return kind.replace(/^(activity|exam):/, "").replaceAll("_", " ");
}

function daysOverdue(dueAt: number): number {
  return Math.max(1, Math.round((Date.now() - dueAt) / 86_400_000));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

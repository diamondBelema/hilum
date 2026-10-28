import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, GraduationCap, Play, RefreshCw } from "lucide-react";
import { api, type Course, type Dashboard } from "../api.ts";
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

  function load() {
    setLoading(true);
    api
      .dashboard()
      .then(setDashboard)
      .catch((err: unknown) => setError(messageOf(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let cancelled = false;
    api
      .dashboard()
      .then((value) => !cancelled && setDashboard(value))
      .catch((err: unknown) => !cancelled && setError(messageOf(err)))
      .finally(() => !cancelled && setLoading(false));
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "activity" || event.type === "session" || event.type === "graded") load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noteCount = courses.reduce((sum, course) => sum + course.notes, 0);
  const hasTopics = Boolean(dashboard && dashboard.counts.total > 0);
  const due = dashboard?.due ?? [];
  const next = dashboard?.next ?? [];

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
        </>
      )}
    </div>
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { api, type Course, type SessionSummary, type Task } from "../api.ts";
import { Composer } from "../components/Composer.tsx";
import { Link } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";

type EmptySessionProps = {
  courses: Course[];
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onNewSession: (course: Course | null, goal?: string, options?: { goalId?: string; timeBoxMin?: number | null }) => void;
};

export function EmptySession({
  courses,
  sessions,
  onNewSession,
}: EmptySessionProps) {
  const recent = sessions.slice(0, 3);
  const [dueTasks, setDueTasks] = useState<Task[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);

  const loadTasks = useCallback(() => {
    if (courses.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    void Promise.all(courses.map((course) => api.tasks(course.code, "open")))
      .then((lists) => {
        setDueTasks(lists.flat().filter((task) => task.due_date === today));
        setTaskError(null);
      })
      .catch((err: unknown) => setTaskError(err instanceof Error ? err.message : String(err)));
  }, [courses]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);
  const start = useCallback(
    (course: Course, goal: string, options?: { goalId?: string; timeBoxMin?: number | null }) => {
      void onNewSession(course, goal, options);
    },
    [onNewSession],
  );

  return (
    <div className="min-h-0 flex-1 flex-col overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[760px] p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <h1 className="type-title text-text">What do you want to learn?</h1>
          <p className="type-body-sm text-text-muted reading">
            Teach: the agent walks you through a topic with short activities and citations to your
            notes. Practise: banked questions for the topics you choose.
          </p>

          <Composer
            view="home"
            courses={courses}
            onStart={(course, goal, options) => void start(course, goal, options)}
          />

          {dueTasks.length > 0 && (
            <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
              <h2 className="type-heading text-text">Due today</h2>
              <ul className="mt-3 space-y-2">
                {dueTasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 rounded-control border border-border-subtle px-3 py-2">
                    <div className="min-w-0">
                      <p className="type-body-sm truncate text-text">{task.title}</p>
                      <p className="type-meta text-text-muted">{task.course} · {task.kind}</p>
                    </div>
                    <button
                      type="button"
                      className="min-h-11 shrink-0 rounded-control border border-border-strong px-3 type-body-sm font-medium text-text hover:bg-surface-2"
                      onClick={() => {
                        void api.updateTask(task.id, { status: "done" }).then(loadTasks).catch((err: unknown) => {
                          setTaskError(err instanceof Error ? err.message : String(err));
                        });
                      }}
                    >
                      Done
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {taskError && <p className="type-meta mt-2 text-incorrect" role="alert">{taskError}</p>}

          {recent.length > 0 && (
            <section className="mt-6 border-t border-border-subtle pt-4">
              <h2 className="type-heading text-text">Recent sessions</h2>
              <p className="type-body-sm mt-1 text-text-muted">
                Open a recent session to continue where you left off.
              </p>
              <ul className="mt-3 space-y-1">
                {recent.map((session) => {
                  const course = courses.find((item) => item.code === session.course);
                  return (
                    <li key={session.id}>
                      <Link
                        to={`/sessions/${session.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface px-3 py-2 hover:bg-surface-2 hover:border-border-strong"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="type-body-sm truncate font-medium text-text">
                            {session.goal.replace(/^practice:\s*/i, "").trim() || "Untitled session"}
                          </p>
                          <p className="type-meta text-text-muted">
                            {course?.code ?? session.course}
                          </p>
                        </div>
                        <Clock aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

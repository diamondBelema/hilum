import { useCallback } from "react";
import { Clock } from "lucide-react";
import type { Course, SessionSummary } from "../api.ts";
import { Composer } from "../components/Composer.tsx";
import { Link } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";

type EmptySessionProps = {
  courses: Course[];
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onNewSession: (course: Course | null, goal?: string) => void;
};

export function EmptySession({
  courses,
  sessions,
  onNewSession,
}: EmptySessionProps) {
  const recent = sessions.slice(0, 3);
  const start = useCallback(
    (course: Course, goal: string) => {
      void onNewSession(course, goal);
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
            onStart={(course, goal) => void start(course, goal)}
          />

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

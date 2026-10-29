import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, ChevronRight } from "lucide-react";
import type { Course, SessionSummary } from "../api.ts";
import { Composer } from "../components/Composer.tsx";
import { Link } from "../lib/router.ts";
import { relativeTime, sessionTitle } from "../components/Sidebar.tsx";
import {
  chooseInitialCourse,
  readLastCourse,
  writeLastCourse,
} from "../components/CoursePicker.tsx";

type EmptySessionProps = {
  courses: Course[];
  sessions: SessionSummary[];
  activeSessionId: string | null;
  onNewSession: (course: Course | null, goal?: string) => void;
};

export function EmptySession({
  courses,
  sessions,
  activeSessionId,
  onNewSession,
}: EmptySessionProps) {
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const recent = sessions.slice(0, 3);

  useEffect(() => {
    if (selectedCourse || courses.length === 0) return;
    const remembered = chooseInitialCourse(courses, readLastCourse());
    if (remembered) setSelectedCourse(remembered);
  }, [courses, selectedCourse]);

  useEffect(() => {
    if (selectedCourse) writeLastCourse(selectedCourse.code);
  }, [selectedCourse]);

  function chooseCourse(course: Course) {
    setSelectedCourse(course);
    document.getElementById("composer-goal")?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:py-12">
      <h1 className="type-title sm:type-display text-text">What do you want to learn?</h1>
      <p className="type-body mt-2 max-w-[60ch] text-text-muted">
        Pick a course and say what you want to work on. Teaching sessions wait for an agent over MCP;
        practice uses banked questions.
      </p>

      <Composer
        courses={courses}
        selectedCourse={selectedCourse}
        onSelectCourse={setSelectedCourse}
        onStart={(course, goal) => onNewSession(course, goal)}
      />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {recent.length > 0 && (
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="type-heading text-text">
              Recent sessions
            </h2>
            <ul className="mt-3 divide-y divide-border-subtle rounded-panel border border-border-subtle bg-surface">
              {recent.map((session) => (
                <li key={session.id}>
                  <Link
                    to={`/sessions/${session.id}`}
                    aria-current={activeSessionId === session.id ? "page" : undefined}
                    className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="type-body-sm block truncate font-medium text-text">
                        {sessionTitle(session.goal)}
                      </span>
                      <span className="type-meta block truncate text-text-muted">
                        {session.course} · {relativeTime(session.startedAt)}
                      </span>
                    </span>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {courses.length > 0 ? (
          <section aria-labelledby="courses-heading">
            <h2 id="courses-heading" className="type-heading text-text">
              Start from a course
            </h2>
            <ul className="mt-3 divide-y divide-border-subtle rounded-panel border border-border-subtle bg-surface">
              {courses.map((course) => (
                <li key={course.code}>
                  <button
                    type="button"
                    onClick={() => chooseCourse(course)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="type-body-sm block truncate font-medium text-text">
                        {course.title}
                      </span>
                      <span className="type-meta block truncate text-text-muted">
                        {course.code} · {course.notes} {course.notes === 1 ? "note" : "notes"} ·{" "}
                        {course.questions} {course.questions === 1 ? "question" : "questions"}
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section
            aria-labelledby="no-courses-heading"
            className="rounded-panel border border-border-subtle bg-surface p-4"
          >
            <h2 id="no-courses-heading" className="type-heading flex items-center gap-2 text-text">
              <BookOpen aria-hidden="true" className="size-5 text-primary" />
              No courses yet
            </h2>
            <p className="type-body-sm mt-2 max-w-[60ch] text-text-muted">
              Add a course to the vault, then reload. The composer will pick it up here.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

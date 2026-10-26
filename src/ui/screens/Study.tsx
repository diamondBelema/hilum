import { BookOpen, CalendarClock, GraduationCap } from "lucide-react";
import type { Course } from "../api.ts";
import { plural } from "../lib/format.ts";
import { Button } from "../components/Button.tsx";
import { Banner } from "../components/ui.tsx";

export function Study({
  courses,
  openNotes,
}: {
  courses: Course[];
  openNotes: (course: Course) => void;
}) {
  const noteCount = courses.reduce((sum, course) => sum + course.notes, 0);

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Study</h1>
      <p className="reading mt-1 text-sm text-text-muted">
        Read your notes and see what is ready to practise. Everything stays on this device.
      </p>

      <div className="mt-6">
        <Banner tone="info">
          A study plan appears after your first graded practice. For now, open a course and read.
        </Banner>
      </div>

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
            {courses.map((course) => (
              <li key={course.code} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h3 className="text-sm font-semibold text-text">{course.title}</h3>
                    <span className="font-mono text-xs text-text-muted">{course.code}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {course.department ?? "No department"} · {plural(course.notes, "note")} ·{" "}
                    {course.tokens.toLocaleString()} tokens
                  </p>
                </div>
                <Button onClick={() => openNotes(course)} aria-label={`Open notes for ${course.title}`}>
                  <BookOpen aria-hidden="true" className="size-4" />
                  Notes
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="exams-heading" className="mt-8">
        <h2 id="exams-heading" className="text-base font-semibold">
          Exams
        </h2>
        <div className="mt-2 flex items-start gap-3 rounded-panel border border-border-subtle bg-surface p-4">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-5 text-text-muted" />
          <div>
            <p className="text-sm text-text">No exam dates set</p>
            <p className="mt-1 text-sm text-text-muted">
              Add the real paper format and date in the course file to see a countdown here.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

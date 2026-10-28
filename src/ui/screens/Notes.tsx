import { useEffect, useRef } from "react";
import { ArrowLeft, BookOpen, Plus, Search, Trash2 } from "lucide-react";
import type { Course, NoteMeta } from "../api.ts";
import { plural } from "../lib/format.ts";
import { Button } from "../components/Button.tsx";
import { EmptyState, Skeleton } from "../components/ui.tsx";

export function Notes({
  courses,
  course,
  notes,
  results,
  query,
  onQuery,
  onSelectCourse,
  onClearCourse,
  onOpenNote,
  onNewNote,
  onDeleteNote,
  loading,
}: {
  courses: Course[];
  course: Course | null;
  notes: NoteMeta[];
  results: NoteMeta[] | null;
  query: string;
  onQuery: (value: string) => void;
  onSelectCourse: (course: Course) => void;
  onClearCourse: () => void;
  onOpenNote: (path: string) => void;
  onNewNote: (course: Course | null) => void;
  onDeleteNote: (path: string) => void;
  loading: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = results ?? notes;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {course && (
            <Button variant="ghost" className="px-2" onClick={onClearCourse}>
              <ArrowLeft aria-hidden="true" className="size-4" />
              All courses
            </Button>
          )}
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {course ? course.title : "Notes"}
          </h1>
        </div>
        {course && (
          <Button variant="secondary" onClick={() => onNewNote(course)}>
            <Plus aria-hidden="true" className="size-4" />
            New note
          </Button>
        )}
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search notes</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search notes"
            type="search"
            className="min-h-11 w-full rounded-control border border-border-strong bg-surface pr-3 pl-9 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </label>
      </div>

      {course && !results && (
        <p className="mt-1 text-sm text-text-muted">
          {course.code} · {plural(course.notes, "note")} · {course.tokens.toLocaleString()} tokens
          {course.examDate ? ` · exam ${course.examDate}` : ""}
        </p>
      )}

      {loading && <Skeleton lines={5} />}

      {!loading && results && (
        <section className="mt-6" aria-label="Search results">
          <h2 className="text-xs font-semibold text-text-muted">
            {plural(results.length, "result")} for “{query.trim()}”
          </h2>
          <NoteList notes={results} onOpenNote={onOpenNote} onDeleteNote={onDeleteNote} showCourse />
        </section>
      )}

      {!loading && !results && !course && (
        <section className="mt-6" aria-labelledby="all-courses">
          <h2 id="all-courses" className="text-xs font-semibold text-text-muted">
            Courses
          </h2>
          {courses.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No notes yet">
                Convert your slides first. Then the notes appear here, with search and stable anchors.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
              {courses.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => onSelectCourse(item)}
                    className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.title}</span>
                      <span className="mt-0.5 block font-mono text-xs text-text-muted">{item.code}</span>
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">{plural(item.notes, "note")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!loading && !results && course && (
        <section className="mt-6" aria-labelledby="course-notes">
          <h2 id="course-notes" className="text-xs font-semibold text-text-muted">
            Notes
          </h2>
          {list.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No notes indexed for this course">
                Run the converter on this course's folder, or check that the files sit under the course
                directory.
              </EmptyState>
            </div>
          ) : (
            <NoteList notes={list} onOpenNote={onOpenNote} onDeleteNote={onDeleteNote} />
          )}
        </section>
      )}
    </div>
  );
}

function NoteList({
  notes,
  onOpenNote,
  onDeleteNote,
  showCourse = false,
}: {
  notes: NoteMeta[];
  onOpenNote: (path: string) => void;
  onDeleteNote: (path: string) => void;
  showCourse?: boolean;
}) {
  return (
    <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
      {notes.map((note) => (
        <li key={note.path}>
          <div className="flex min-h-11 w-full items-start gap-3 py-3 text-left hover:bg-surface-2">
            <button
              type="button"
              onClick={() => onOpenNote(note.path)}
              className="flex min-w-0 items-start gap-3 py-3 text-left hover:bg-surface-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <BookOpen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{note.title}</span>
                <span className="mt-0.5 block truncate text-sm text-text-muted">
                  {note.summary || note.path}
                </span>
                {showCourse && note.course && (
                  <span className="mt-0.5 block font-mono text-xs text-text-muted">{note.course}</span>
                )}
              </span>
            </button>
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete “${note.title}”?`)) onDeleteNote(note.path);
              }}
              aria-label={`Delete ${note.title}`}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

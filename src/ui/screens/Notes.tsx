import { useEffect, useRef } from "react";
import { ArrowLeft, BookOpen, FolderOpen, Plus, Search, Trash2 } from "lucide-react";
import type { Course, NoteMeta } from "../api.ts";
import { plural } from "../lib/format.ts";
import { Button } from "../components/Button.tsx";
import { Chip, EmptyState, Skeleton } from "../components/ui.tsx";

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
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 truncate type-title">{course ? course.title : "Notes"}</h1>
        {course && (
          <Button variant="secondary" onClick={() => onNewNote(course)}>
            <Plus aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">New note</span>
          </Button>
        )}
      </div>
      {course && (
        <Button variant="ghost" className="-ml-2 mt-1 px-2 text-text-muted" onClick={onClearCourse}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span>All courses</span>
        </Button>
      )}

      <div className="mt-3 relative w-full sm:w-64">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted"
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Search notes"
          type="search"
          className="min-h-11 w-full rounded-control border border-border-strong bg-surface pr-3 pl-10 type-body-sm text-text placeholder:text-text-muted focus:border-primary"
        />
      </div>

      {course && !results && (
        <p className="mt-2 type-meta text-text-muted">
          {course.code} · {plural(course.notes, "note")} · {course.tokens.toLocaleString()} tokens
          {course.examDate ? ` · exam ${course.examDate}` : ""}
        </p>
      )}

      {loading && <Skeleton lines={5} />}

      {!loading && results && (
        <section className="mt-6" aria-label="Search results">
          <h2 className="type-label">
            {plural(results.length, "result")} for <span className="type-body-sm font-medium text-text">“{query.trim()}”</span>
          </h2>
          {results.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No matching notes">Try a different title or phrase.</EmptyState>
            </div>
          ) : (
            <NoteList notes={results} onOpenNote={onOpenNote} onDeleteNote={onDeleteNote} />
          )}
        </section>
      )}

      {!loading && !results && !course && (
        <section className="mt-6" aria-labelledby="all-courses">
          <h2 id="all-courses" className="type-label">Courses</h2>
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
                    className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate type-body-sm font-medium">{item.title}</span>
                      <span className="mt-0.5 block font-mono type-meta">{item.code}</span>
                    </span>
                    <span className="shrink-0 type-meta text-text-muted">
                      {plural(item.notes, "note")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!loading && !results && course && (
        <section className="mt-6" aria-label="Course notes">
          {list.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No notes indexed for this course">
                Run the converter on this course's folder, or check that the files sit under the course directory.
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
}: {
  notes: NoteMeta[];
  onOpenNote: (path: string) => void;
  onDeleteNote: (path: string) => void;
}) {
  const grouped = notes.reduce<Record<string, NoteMeta[]>>((groups, note) => {
    (groups[note.section] ??= []).push(note);
    return groups;
  }, {});

  return (
    <div className="mt-3 space-y-6">
      {Object.entries(grouped).map(([section, sectionNotes]) => (
        <section key={section} aria-labelledby={`notes-section-${section}`}>
          <div className="mb-2 flex items-center gap-2">
            <FolderOpen aria-hidden="true" className="size-4 text-primary" />
            <h3 id={`notes-section-${section}`} className="type-label text-text">
              {section.replaceAll("-", " ")}
            </h3>
            <span className="type-meta text-text-muted">{sectionNotes.length}</span>
          </div>
          <ul className="divide-y divide-border-subtle rounded-panel border border-border-subtle bg-surface">
            {sectionNotes.map((note) => (
              <li key={note.path}>
                <div className="flex min-h-12 w-full items-start gap-3 p-3 text-left hover:bg-surface-2">
                  <button
                    type="button"
                    onClick={() => onOpenNote(note.path)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <BookOpen aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-text-muted" />
                    <span className="min-w-0">
                      <span className="block truncate type-body-sm font-medium">{note.title}</span>
                      <span className="mt-0.5 block truncate type-body-sm text-text-muted">
                        {note.summary || note.path}
                      </span>
                    </span>
                  </button>
                  <Button
                    variant="destructive"
                    size="icon-sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm(`Delete “${note.title}”?`)) onDeleteNote(note.path);
                    }}
                    aria-label={`Delete ${note.title}`}
                  >
                    <Trash2 aria-hidden="true" className="size-5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

import { Suspense, useEffect, useRef, useState } from "react";
import { api, type Course, type NoteMeta } from "../api.ts";
import { chooseInitialCourse, readLastCourse, writeLastCourse } from "../components/CoursePicker.tsx";
import { NotesLazy } from "./lazy.ts";
import { navigate } from "../lib/router.ts";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function NotesRoute({
  courses,
  selectedCourse,
  setSelectedCourse,
}: {
  courses: Course[];
  selectedCourse: Course | null;
  setSelectedCourse: (course: Course | null) => void;
}) {
  const [notes, setNotes] = useState<NoteMeta[] | null>(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMeta[] | null>(null);

  // "All courses" must stick: without this flag the effect below re-selects the remembered course immediately.
  const clearedRef = useRef(false);

  useEffect(() => {
    if (selectedCourse || courses.length === 0 || clearedRef.current) return;
    const remembered = chooseInitialCourse(courses, readLastCourse());
    if (remembered) setSelectedCourse(remembered);
  }, [courses, selectedCourse]);

  useEffect(() => {
    if (!selectedCourse) return;
    let cancelled = false;
    setNotesLoading(true);
    api
      .notes(selectedCourse.code)
      .then((list) => {
        if (!cancelled) {
          setNotes(list);
          setNotesLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(messageOf(err));
          setNotesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .search(trimmed, selectedCourse?.code)
        .then((list) => {
          if (!cancelled) setResults(list);
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(messageOf(err));
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, selectedCourse]);

  async function deleteNote(path: string) {
    if (!window.confirm("Delete this note?")) return;
    try {
      await api.deleteNote(path);
      setNotes((prev) => (prev ? prev.filter((n) => n.path !== path) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (error) {
    return (
      <div className="mt-4 rounded-control border border-incorrect/40 bg-incorrect-soft p-3 type-body-sm text-incorrect">
        {error}
      </div>
    );
  }
  return (
    <NotesLazy
      courses={courses}
      course={selectedCourse}
      notes={notes ?? []}
      results={results}
      query={query}
      onQuery={setQuery}
      onSelectCourse={(course) => {
        clearedRef.current = false;
        writeLastCourse(course.code);
        setSelectedCourse(course);
      }}
      onClearCourse={() => {
        clearedRef.current = true;
        setSelectedCourse(null);
      }}
      onOpenNote={(path) => navigate(`/library/notes?path=${encodeURIComponent(path)}`)}
      onNewNote={(course) => {
        if (!course) return;
        navigate(`/library/notes?edit=1&course=${encodeURIComponent(course.code)}`);
      }}
      onDeleteNote={deleteNote}
      loading={notesLoading}
    />
  );
}

import { useEffect, useState } from "react";
import { api, type Course } from "../api.ts";
import { ReaderLazy } from "./lazy.ts";
import { navigate } from "../lib/router.ts";

export function ReaderRoute({
  path,
  anchor,
  courses,
}: {
  path: string;
  anchor: string | undefined;
  courses: Course[];
}) {
  const [note, setNote] = useState<{ path: string; title: string; summary: string; tags: string[]; frontmatter: Record<string, unknown>; body: string } | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .note(path)
      .then((next) => {
        if (!cancelled) {
          setNote(next);
          setCourse(courses.find((item) => item.code === (next as { course?: string }).course) ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, courses]);

  return (
    <ReaderLazy
      note={note as import("../api.ts").NoteDetail | null}
      course={course}
      onOpenNote={(nextPath: string, nextAnchor: string | undefined) =>
        navigate(`/library/notes?path=${encodeURIComponent(nextPath)}${nextAnchor ? `&anchor=${encodeURIComponent(nextAnchor)}` : ""}`)
      }
      onEditNote={(nextPath) => navigate(`/library/notes?edit=1&path=${encodeURIComponent(nextPath)}`)}
      onDeleteNote={async (nextPath) => {
        if (!window.confirm(`Delete “${note?.title ?? "this note"}”?`)) return;
        await api.deleteNote(nextPath);
        // goBack is not imported here; navigate to library/notes
        navigate("/library/notes");
      }}
    />
  );
}

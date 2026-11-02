import { Suspense, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn.ts";
import { Library, FileUp, FileText, ScrollText, Table2, BarChart3, ClipboardList, Network, ArrowRight } from "lucide-react";
import { api, type Course } from "../api.ts";
import { Link, navigate } from "../lib/router.ts";
import { NotesLazy, ReaderLazy, EditorLazy, PapersLazy, QuestionsLazy, ProgressLazy, GraphLazy, PlanLazy } from "./lazy.ts";
import { NotesRoute } from "./NotesRoute.tsx";
import { ReaderRoute } from "./ReaderRoute.tsx";
import { PapersRoute } from "./PapersRoute.tsx";
import { QuestionsRoute } from "./QuestionsRoute.tsx";
import { ProgressRoute } from "./ProgressRoute.tsx";
import { GraphRoute } from "./GraphRoute.tsx";
import { InboxScreen } from "../screens/Inbox.tsx";

const LIBRARY_SECTIONS = [
  {
    slug: "inbox",
    title: "Inbox",
    description: "Add source files and review where they belong.",
    label: "Content",
    icon: FileUp,
  },
  {
    slug: "notes",
    title: "Notes",
    description: "Read source material, images and cited passages.",
    label: "Reference",
    icon: FileText,
  },
  {
    slug: "exams",
    title: "Exams",
    description: "Build, take and resume timed papers.",
    label: "Assessment",
    icon: ScrollText,
  },
  {
    slug: "questions",
    title: "Questions",
    description: "Practice from the verified question bank.",
    label: "Practice",
    icon: Table2,
  },
  {
    slug: "progress",
    title: "Progress",
    description: "Review mastery, evidence and what is due.",
    label: "Feedback",
    icon: BarChart3,
  },
  {
    slug: "plan",
    title: "Plan",
    description: "Set goals, review proposed plans and track coverage.",
    label: "Direction",
    icon: ClipboardList,
  },
  {
    slug: "graph",
    title: "Graph",
    description: "Explore the relationships between concepts.",
    label: "Map",
    icon: Network,
  },
];

export function LibraryScreen({
  section,
  onNewSession,
}: {
  section: string | null;
  onNewSession?: (course: Course | null, goal?: string) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .courses()
      .then((list) => {
        if (!cancelled) setCourses(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const params = new URLSearchParams(window.location.search);
  const notePath = params.get("path") ?? undefined;
  const noteAnchor = params.get("anchor") ?? undefined;
  const requestedCourse = params.get("course");
  const editing = params.get("edit") === "1";

  const view = (
    <Suspense fallback={<p className="type-body-sm text-text-muted">Loading…</p>}>
      {section === "notes" && editing ? (
        <div className="w-full">
          <EditorLazy
            course={courses.find((item) => item.code === requestedCourse) ?? courses.find((item) => item.code === notePath?.split("/")[1]) ?? selectedCourse}
            notePath={notePath}
            onBack={() => navigate(notePath ? `/library/notes?path=${encodeURIComponent(notePath)}` : "/library/notes")}
          />
        </div>
      ) : section === "notes" && notePath ? (
        <div className="w-full">
          <ReaderRoute
            path={notePath}
            anchor={noteAnchor}
            courses={courses}
          />
        </div>
      ) : section === "notes" ? (
        <div className="w-full">
          <NotesRoute courses={courses} selectedCourse={selectedCourse} setSelectedCourse={setSelectedCourse} />
        </div>
      ) : section === "inbox" ? (
        <div className="w-full">
          <InboxScreen courses={courses} />
        </div>
      ) : section === "exams" ? (
        <div className="w-full">
          <PapersRoute courses={courses} />
        </div>
      ) : section === "questions" ? (
        <div className="w-full">
          <QuestionsRoute courses={courses} />
        </div>
      ) : section === "progress" ? (
        <div className="w-full">
          <ProgressRoute courses={courses} onNewSession={onNewSession} />
        </div>
        ) : section === "plan" ? (
          <div className="w-full">
            <PlanLazy courses={courses} />
          </div>
      ) : section === "graph" ? (
        <div className="h-full w-full">
            <GraphRoute
              courses={courses}
              onStudy={(courseCode, goal) => {
                const course = courses.find((c) => c.code === courseCode);
                if (course && onNewSession) void onNewSession(course, goal);
              }}
            />
        </div>
) : null}
    </Suspense>
  );
  return (
    <div
      className={cn(
        "w-full",
        section
          ? section === "graph"
            ? "h-full p-0"
            : "px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6 lg:px-8 lg:pb-8 lg:pt-8"
          : "mx-auto max-w-6xl p-4 sm:p-6 lg:p-8",
      )}
    >
      {!section ? (
        <div className="flex items-center gap-2">
          <Library aria-hidden="true" className="size-5 text-primary" />
          <h1 className="type-title text-text">Library</h1>
        </div>
      ) : null}

      {section && !LIBRARY_SECTIONS.some((item) => item.slug === section) && section !== "notes" ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
          <h2 className="type-heading text-text">That section does not exist</h2>
          <p className="type-body-sm mt-1 text-text-muted">Choose one of the sections below.</p>
        </div>
      ) : null}

      {section ? view : (
        <>
          <div className="mt-6 max-w-2xl">
            <p className="type-label text-primary">Study workspace</p>
            <h2 className="type-heading mt-1 text-text">Choose where to continue</h2>
            <p className="reading mt-2 text-sm text-text-muted">
              Your sessions do the teaching. These tools hold the source material,
              practice, feedback and map that support the next session.
            </p>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LIBRARY_SECTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.slug}>
                  <Link
                    to={`/library/${item.slug}`}
                    className="group flex min-h-40 flex-col justify-between rounded-panel border border-border-subtle bg-surface p-4 transition-colors hover:border-primary/50 hover:bg-surface-2"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-control bg-primary-soft text-primary">
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <ArrowRight
                        aria-hidden="true"
                        className="size-5 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </span>
                    <span className="mt-6">
                      <span className="type-label text-text-muted">{item.label}</span>
                      <span className="type-heading mt-1 block text-text">{item.title}</span>
                      <span className="type-body-sm mt-1 block text-text-muted">{item.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

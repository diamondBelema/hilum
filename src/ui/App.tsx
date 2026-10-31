import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Check,
  Copy,
  FileText,
  FolderOpen,
  Library,
  Network,
  ScrollText,
  Table2,
} from "lucide-react";
import { api, type Course, type Health, type NoteMeta, type ServerSettings, type SessionSummary } from "./api.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar, type Crumb } from "./components/TopBar.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { Button } from "./components/Button.tsx";
import { subscribeHarnessEvents } from "./lib/events.ts";
import { Dialog } from "./components/Dialog.tsx";
import { SegmentedControl } from "./components/SegmentedControl.tsx";
import { DesignGallery } from "./screens/DesignGallery.tsx";
import { EmptySession } from "./screens/EmptySession.tsx";
import { SessionScreen } from "./screens/SessionScreen.tsx";
import { graphHref, Link, navigate, useRoute, type Route } from "./lib/router.ts";
import { cn } from "./lib/cn.ts";
import { chooseInitialCourse, readLastCourse } from "./components/CoursePicker.tsx";
import { useTheme, type Theme, useReaderPrefs } from "./theme.ts";
import { isDesktopApp, openVaultFolder, pickVaultDirectory } from "./lib/desktop.ts";

const NotesLazy = lazy(() => import("./screens/Notes.tsx").then((mod) => ({ default: mod.Notes }))) as React.ComponentType<{
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
}>;
const ReaderLazy = lazy(() => import("./screens/Reader.tsx").then((mod) => ({ default: mod.Reader }))) as React.ComponentType<{
  note: { path: string; title: string; summary: string; tags: string[]; frontmatter: Record<string, unknown>; body: string } | null;
  course: Course | null;
  onBack: () => void;
  onOpenNote: (path: string, anchor?: string) => void;
  onEditNote?: (path: string) => void;
  onDeleteNote?: (path: string) => void;
}>;
const EditorLazy = lazy(() => import("./screens/Editor.tsx").then((mod) => ({ default: mod.Editor }))) as React.ComponentType<{
  course: Course | null;
  onBack: () => void;
  notePath?: string;
}>;
const PapersLazy = lazy(() => import("./screens/Papers.tsx").then((mod) => ({ default: mod.Papers }))) as React.ComponentType<{
  course: Course;
  onBack: () => void;
}>;
const QuestionsLazy = lazy(() => import("./screens/Questions.tsx").then((mod) => ({ default: mod.Questions }))) as React.ComponentType<{
  courses: Course[];
}>;
const ProgressLazy = lazy(() => import("./screens/Progress.tsx").then((mod) => ({ default: mod.ProgressScreen }))) as React.ComponentType<{
  courses: Course[];
  onStudy: (course: string, conceptId?: string) => void;
  onOpenNote: (path: string, anchor?: string) => void;
  onOpenGraph: (course: string, conceptId: string) => void;
}>;
const GraphLazy = lazy(() => import("./screens/Graph.tsx").then((mod) => ({ default: mod.GraphScreen }))) as React.ComponentType<{
  courses: Course[];
  onStudy: (course: string, goal: string) => void;
}>;

export function App() {
  if (location.pathname === "/_design") return <DesignGallery />;
  return <AppShell />;
}

function AppShell() {
  const route = useRoute();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.courses(), api.sessionHistory()])
      .then(([courseList, sessionList]) => {
        if (cancelled) return;
        setCourses(courseList);
        setSessions(sessionList);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(messageOf(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const routeKey = routeKeyOf(route);
  useEffect(() => {
    setSidebarOpen(false);
  }, [routeKey]);

  const activeSessionId = route.name === "session" ? route.id : null;

  const createSession = useCallback(
    async (course: Course | null, goal?: string) => {
      if (!course) {
        navigate("/");
        return;
      }
      try {
        const created = await api.startSession(course.code, goal ?? "learn");
        setSessions((previous) => [
          {
            id: created.id,
            course: created.course,
            goal: created.goal,
            title: created.title,
            startedAt: created.startedAt,
            endedAt: created.endedAt,
            summary: created.summary,
            notePath: created.notePath,
            status: created.endedAt ? "Ended" : "Agent not connected",
            pendingCount: 0,
            agentConnected: false,
          },
          ...previous,
        ]);
        navigate(`/sessions/${created.id}`);
      } catch (err) {
        const e = err as { status?: number; sessionId?: string };
        if (e.status === 409 && e.sessionId) {
          setConflictSessionId(e.sessionId);
          return;
        }
        setError(messageOf(err));
      }
    },
    [],
  );

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await api.sessionHistory());
    } catch {
      /* keep the list we have */
    }
  }, []);

  const endSession = useCallback(async () => {
    const id = activeSessionId;
    if (!id) return;
    setEndOpen(false);
    try {
      await api.endSession(id, "");
      await refreshSessions();
      setSessionVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [activeSessionId, refreshSessions]);

  const resumeSession = useCallback(async () => {
    const id = activeSessionId;
    if (!id) return;
    await api.reopenSession(id);
    await refreshSessions();
    setSessionVersion((v) => v + 1);
  }, [activeSessionId, refreshSessions]);

  // Keep the sidebar live: refetch on session events, and every 30s so "2m ago" stays honest.
  useEffect(() => {
    const unsubscribe = subscribeHarnessEvents((event) => {
      if (event.type === "session" || event.type === "activity") void refreshSessions();
    });
    const timer = window.setInterval(() => void refreshSessions(), 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [refreshSessions]);

  const sessionTitle =
    route.name === "session"
      ? sessions.find((session) => session.id === route.id)?.goal ?? "Session"
      : null;

  const breadcrumb: Crumb[] =
    route.name === "session"
      ? [{ label: "Sessions", to: "/" }, { label: sessionTitle ?? "Session" }]
      : route.name === "library"
        ? [{ label: "Library", to: "/library" }, { label: libraryTitle(route.section) }]
        : route.name === "settings"
          ? [{ label: "Settings" }]
          : [{ label: "Sessions" }];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg lg:flex-row">
      <a
        href="#main"
        className="type-body-sm fixed left-2 top-2 z-50 inline-flex min-h-11 -translate-y-20 items-center rounded-control bg-primary px-4 font-semibold text-on-primary focus:translate-y-0"
      >
        Skip to content
      </a>

      <div className="hidden shrink-0 border-r border-border-subtle lg:flex lg:w-[288px]">
        <Sidebar
          courses={courses}
          sessions={sessions}
          loading={loading}
          activeSessionId={activeSessionId}
        />
      </div>

      <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="Sessions">
        <Sidebar
          courses={courses}
          sessions={sessions}
          loading={loading}
          activeSessionId={activeSessionId}
          onNavigate={() => setSidebarOpen(false)}
        />
      </Drawer>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          onOpenSidebar={() => setSidebarOpen(true)}
          breadcrumb={breadcrumb}
          sessionId={activeSessionId}
          sessionStatus={
            activeSessionId
              ? (sessions.find((s) => s.id === activeSessionId)?.status === "Ended"
                ? "ended"
                : "open")
              : null
          }
          onEndSession={() => {
            setEndOpen(true);
          }}
          onResumeSession={() => {
            void resumeSession().catch((err) => setError(err instanceof Error ? err.message : String(err)));
          }}
        />

        <main id="main" className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 pt-4">
              <div className="mx-auto max-w-3xl rounded-control border border-incorrect/40 bg-incorrect-soft p-3 type-body-sm text-incorrect">
                {error}
              </div>
            </div>
          )}

          {route.name === "home" && (
            <EmptySession
              courses={courses}
              sessions={sessions}
              activeSessionId={activeSessionId}
              onNewSession={createSession}
            />
          )}
          {route.name === "session" && (
            <SessionScreen
              key={`${route.id}:${sessionVersion}`}
              sessionId={route.id}
              onResume={resumeSession}
              onClose={() => navigate("/")}
              onNewSession={(course) => (course ? void createSession(course) : navigate("/"))}
              onEndSession={() => setEndOpen(true)}
            />
          )}
          {route.name === "library" && (
            <LibraryScreen
              key={window.location.search}
              section={route.section}
              onNewSession={createSession}
            />
          )}
          {route.name === "settings" && <SettingsScreen />}
          {route.name === "not-found" && (
            <div className="mx-auto max-w-3xl p-4 sm:p-6">
              <h1 className="type-title text-text">Page not found</h1>
              <p className="type-body mt-2 text-text-muted">That address is not part of the app.</p>
              <Link to="/" className="type-body-sm mt-4 inline-flex min-h-11 items-center gap-2 font-medium">
                Go to sessions
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          )}
        </main>

        <Dialog
          open={endOpen}
          onClose={() => setEndOpen(false)}
          title="End this session?"
          description="A session note is saved to your vault. You can resume it later."
          variant="sheet"
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={endSession}>
              End session
            </Button>
          </div>
        </Dialog>

        {conflictSessionId && (
          <Dialog
            open
            onClose={() => setConflictSessionId(null)}
            title="Session already open"
            description="A session for this course is already open. Resume it, or start a new session anyway."
            variant="sheet"
          >
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setConflictSessionId(null);
                navigate(`/sessions/${conflictSessionId}`);
              }}>
                Resume open session
              </Button>
              <Button variant="primary" onClick={() => {
                setConflictSessionId(null);
                navigate("/");
              }}>
                Start new session
              </Button>
            </div>
          </Dialog>
        )}
      </div>
    </div>
  );
}

const LIBRARY_SECTIONS = [
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
    slug: "graph",
    title: "Graph",
    description: "Explore the relationships between concepts.",
    label: "Map",
    icon: Network,
  },
];

function LibraryScreen({
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
        <div className="mx-auto max-w-5xl">
          <EditorLazy
            course={courses.find((item) => item.code === requestedCourse) ?? courses.find((item) => item.code === notePath?.split("/")[1]) ?? selectedCourse}
            notePath={notePath}
            onBack={() => navigate(notePath ? `/library/notes?path=${encodeURIComponent(notePath)}` : "/library/notes")}
          />
        </div>
      ) : section === "notes" && notePath ? (
        <div className="mx-auto max-w-5xl">
          <ReaderRoute path={notePath} anchor={noteAnchor} courses={courses} onBack={() => navigate("/library/notes")} />
        </div>
      ) : section === "notes" ? (
        <div className="mx-auto max-w-5xl">
          <NotesRoute courses={courses} selectedCourse={selectedCourse} setSelectedCourse={setSelectedCourse} />
        </div>
      ) : section === "exams" ? (
        <div className="w-full">
          <PapersRoute courses={courses} />
        </div>
      ) : section === "questions" ? (
        <div className="mx-auto max-w-5xl">
          <QuestionsRoute courses={courses} />
        </div>
      ) : section === "progress" ? (
        <div className="mx-auto max-w-5xl">
          <ProgressRoute courses={courses} onNewSession={onNewSession} />
        </div>
      ) : section === "graph" ? (
        <div className="w-full">
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
    <div className={cn("w-full p-4 sm:p-6 lg:p-8", !section && "mx-auto max-w-6xl")}>
      {!section && (
        <div className="flex items-center gap-2">
          <Library aria-hidden="true" className="size-5 text-primary" />
          <div>
            <h1 className="type-title text-text">Library</h1>
            <p className="type-body-sm mt-0.5 text-text-muted">
              Source material, practice, feedback and your concept map.
            </p>
          </div>
        </div>
      )}

      {section && !LIBRARY_SECTIONS.some((item) => item.slug === section) && section !== "notes" ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
          <h2 className="type-heading text-text">That section does not exist</h2>
          <p className="type-body-sm mt-1 text-text-muted">Choose one of the sections below.</p>
        </div>
      ) : null}

      {section ? (
        <>
          {view}
        </>
      ) : (
        <>
          <div className="mt-5 max-w-2xl">
            <p className="type-label text-primary">Study workspace</p>
            <h2 className="type-heading mt-1 text-text">Choose where to continue</h2>
            <p className="reading mt-2 text-sm text-text-muted">
              Your sessions do the teaching. These tools hold the source material,
              practice, feedback and map that support the next session.
            </p>
          </div>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

function NotesRoute({
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

  useEffect(() => {
    if (selectedCourse || courses.length === 0) return;
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
      onSelectCourse={setSelectedCourse}
      onClearCourse={() => setSelectedCourse(null)}
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

function ReaderRoute({
  path,
  anchor,
  courses,
  onBack,
}: {
  path: string;
  anchor: string | undefined;
  courses: Course[];
  onBack: () => void;
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
      note={note as import("./api.ts").NoteDetail | null}
      course={course}
      onBack={onBack}
      onOpenNote={(nextPath: string, nextAnchor: string | undefined) =>
        navigate(`/library/notes?path=${encodeURIComponent(nextPath)}${nextAnchor ? `&anchor=${encodeURIComponent(nextAnchor)}` : ""}`)
      }
      onEditNote={(nextPath) => navigate(`/library/notes?edit=1&path=${encodeURIComponent(nextPath)}`)}
      onDeleteNote={async (nextPath) => {
        if (!window.confirm(`Delete “${note?.title ?? "this note"}”?`)) return;
        await api.deleteNote(nextPath);
        onBack();
      }}
    />
  );
}

function PapersRoute({ courses }: { courses: Course[] }) {
  const course = courses.find((item) => item.questions > 0) ?? courses[0];
  if (!course) return null;
  return <PapersLazy course={course} onBack={() => navigate("/library")} />;
}

function QuestionsRoute({ courses }: { courses: Course[] }) {
  return <QuestionsLazy courses={courses} />;
}

function ProgressRoute({
  courses,
  onNewSession,
}: {
  courses: Course[];
  onNewSession?: (course: Course | null, goal?: string) => void;
}) {
  const course = courses.find((item) => item.concepts > 0) ?? courses[0];
  if (!course) return null;
  return (
    <ProgressLazy
      courses={courses}
      onStudy={(courseCode, conceptId) => {
        const selected = courses.find((item) => item.code === courseCode) ?? course;
        if (selected && onNewSession) {
          void onNewSession(selected, conceptId ?? "review concepts");
        }
      }}
      onOpenNote={(path, anchor) => {
        navigate(`/library/notes?path=${encodeURIComponent(path)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}`);
      }}
      onOpenGraph={(courseCode, conceptId) => {
        navigate(graphHref(courseCode, conceptId));
      }}
    />
  );
}

function GraphRoute({
  courses,
  onStudy,
}: {
  courses: Course[];
  onStudy: (course: string, goal: string) => void;
}) {
  const course = courses.find((item) => item.concepts > 0) ?? courses[0];
  if (!course) return null;
  return <GraphLazy courses={courses} onStudy={onStudy} />;
}

function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const { prefs, setPrefs, size, lineHeight } = useReaderPrefs();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [rescanBusy, setRescanBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [vaultPickerBusy, setVaultPickerBusy] = useState(false);
  const [backups, setBackups] = useState<Array<{
    name: string;
    path: string;
    createdAt: number;
    format: number | null;
    stats: { notes?: number; courses?: number; tokens?: number } | null;
    hasDatabase: boolean;
  }>>([]);
  const [copied, setCopied] = useState<"endpoint" | "token" | false>(false);
  const [tokenShown, setTokenShown] = useState(false);
  const endpoint = `${window.location.origin}/mcp`;

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.health(), api.settings()])
      .then(([nextHealth, nextSettings]) => {
        if (cancelled) return;
        setHealth(nextHealth);
        setSettings(nextSettings);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSettingsError(messageOf(err));
      });
    api.vaultBackups().then((result) => {
      if (!cancelled) setBackups(result.backups);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(text: string, kind: "endpoint" | "token") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function updateLan(enabled: boolean) {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await api.updateSettings({ lan: enabled });
      setSettings(next);
      setSettingsNotice(
        next.restartRequired
          ? "LAN setting saved. Restart Hilum to apply the new bind address."
          : enabled
            ? "LAN access enabled."
            : "LAN access disabled.",
      );
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function regenerateToken() {
    setSettingsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await api.updateSettings({ regenerateToken: true });
      setSettings(next);
      setTokenShown(true);
      setSettingsNotice("MCP token regenerated. Update connected agents.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setSettingsBusy(false);
    }
  }

  async function rescanVault() {
    setRescanBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.rescanVault();
      setSettingsNotice(
        `Vault rescanned: ${result.stats.notes} notes across ${result.stats.courses} courses.`,
      );
      const nextHealth = await api.health();
      setHealth(nextHealth);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setRescanBusy(false);
    }

  }

  async function chooseVault() {
    setVaultPickerBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const selected = await pickVaultDirectory();
      if (!selected) return;
      const next = await api.updateSettings({ vaultPath: selected });
      setSettings(next);
      setSettingsNotice("Vault saved. Restart Hilum to use the selected folder.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setVaultPickerBusy(false);
    }
  }

  async function backupVault() {
    setBackupBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.backupVault();
      setSettingsNotice(`Vault backup created at ${result.destination}.`);
      const latest = await api.vaultBackups();
      setBackups(latest.backups);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setBackupBusy(false);
    }
  }

  async function exportDiagnostics() {
    setDiagnosticsBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const report = await api.diagnostics();
      const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `hilum-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setSettingsNotice("Diagnostics report exported without study content or MCP tokens.");
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function createDemoCourse() {
    setDemoBusy(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const result = await api.createDemoCourse();
      setSettingsNotice(
        result.created ? "Demo course created. Open Notes to explore it." : result.message ?? "Demo course already exists.",
      );
      const [nextHealth, nextSettings] = await Promise.all([api.health(), api.settings()]);
      setHealth(nextHealth);
      setSettings(nextSettings);
    } catch (err) {
      setSettingsError(messageOf(err));
    } finally {
      setDemoBusy(false);
    }
  }

  const displayToken = settings?.mcpToken ?? null;
  const tokenBody = tokenShown || !displayToken ? (displayToken ?? "") : "••••••••";

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="type-title text-text">Settings</h1>
      <p className="type-body mt-2 text-text-muted">
        Appearance applies immediately. Connection and readiness controls are persisted by Hilum.
      </p>

      {(settingsError || settingsNotice) && (
        <div className={cn(
          "mt-4 rounded-control border p-3 type-body-sm",
          settingsError
            ? "border-incorrect/40 bg-incorrect-soft text-incorrect"
            : "border-success/40 bg-success-soft text-success",
        )}>
          {settingsError ?? settingsNotice}
        </div>
      )}

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <div className="flex items-start gap-3">
          {health?.readiness?.setupComplete ? (
            <Check aria-hidden="true" className="mt-0.5 size-5 text-success" />
          ) : (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 text-warning" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="type-heading text-text">
              {health?.readiness?.setupComplete ? "Hilum is ready" : "Finish setup"}
            </h2>
            <p className="type-body-sm mt-1 text-text-muted">
              {health?.readiness?.setupComplete
                ? "Vault, database and course content are available."
                : "Choose a writable vault, add a course, and connect an agent to get the full experience."}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-3">
          {([
            ["Vault", health?.readiness?.vault],
            ["Database", health?.readiness?.database],
            ["Agent", health?.readiness?.agent !== "none"],
          ] as [string, boolean | undefined][]).map(([label, ready]) => (
            <div key={label} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2">
              <dt className="type-meta text-text-muted">{label}</dt>
              <dd className={cn("type-body-sm mt-1 font-medium", ready ? "text-success" : "text-warning")}>
                {ready ? "Ready" : label === "Agent" ? "Not connected" : "Needs attention"}
              </dd>
            </div>
          ))}
        </dl>
        {!health?.readiness?.setupComplete && (
          <ol className="mt-4 space-y-2 border-t border-border-subtle pt-4">
            {[
              {
                label: "Check the vault",
                done: Boolean(health?.readiness?.vault),
                action: (
                  <Button variant="ghost" size="sm" onClick={() => void rescanVault()} disabled={rescanBusy}>
                    {rescanBusy ? "Checking…" : "Rescan"}
                  </Button>
                ),
              },
              {
                label: "Add course material",
                done: Boolean(health?.stats.courses),
                action: (
                  <span className="flex flex-wrap gap-1">
                    <Link
                      to="/library/notes"
                      className="type-body-sm inline-flex min-h-11 items-center rounded-control px-3 font-medium text-primary hover:bg-primary-soft"
                    >
                      Open Notes
                    </Link>
                    <Button variant="ghost" size="sm" onClick={() => void createDemoCourse()} disabled={demoBusy}>
                      {demoBusy ? "Creating…" : "Try demo"}
                    </Button>
                  </span>
                ),
              },
              {
                label: "Connect an MCP agent",
                done: health?.readiness?.agent !== "none",
                action: (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => displayToken && void copy(displayToken, "token")}
                    disabled={!displayToken}
                  >
                    Copy token
                  </Button>
                ),
              },
            ].map((step, index) => (
              <li key={step.label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono type-meta",
                    step.done
                      ? "border-success/50 bg-success-soft text-success"
                      : "border-border-strong text-text-muted",
                  )}
                >
                  {step.done ? <Check aria-hidden="true" className="size-4" /> : index + 1}
                </span>
                <span className={cn("min-w-0 flex-1 type-body-sm", step.done && "text-text-muted line-through")}>
                  {step.label}
                </span>
                {!step.done && step.action}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Appearance</h2>
        <p className="type-body-sm mt-1 text-text-muted">
          Follow the system or pin a theme for late study.
        </p>
        <SegmentedControl<Theme>
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          className="mt-3 w-full sm:w-auto"
        />
        <p className="type-label mt-4 text-text-muted">Reader text size</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={prefs.size === index}
              onClick={() => setPrefs({ ...prefs, size: index })}
              className={cn(
                "type-body-sm min-h-11 shrink-0 rounded-control border px-3 font-medium transition-colors",
                prefs.size === index
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {index === 0 ? "Smaller" : index === 1 ? "Default" : "Larger"}
            </button>
          ))}
        </div>
        <p className="type-label mt-4 text-text-muted">Reader line spacing</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {[0, 1, 2].map((index) => (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={prefs.spacing === index}
              onClick={() => setPrefs({ ...prefs, spacing: index })}
              className={cn(
                "type-body-sm min-h-11 shrink-0 rounded-control border px-3 font-medium transition-colors",
                prefs.spacing === index
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border-subtle text-text-muted hover:bg-surface-2 hover:text-text",
              )}
            >
              {index === 0 ? "Tight" : index === 1 ? "Default" : "Loose"}
            </button>
          ))}
        </div>
        <p className="mt-3 type-body-sm text-text-muted" style={{ fontSize: size, lineHeight }}>
          Example: reader text at your chosen size and spacing.
        </p>
      </section>

      <section className="mt-4 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Connection</h2>
        <p className="type-body-sm mt-1 text-text-muted">The MCP endpoint is how an external agent connects.</p>
        <p className="type-label mt-4 text-text-muted">MCP endpoint</p>
        <div className="mt-2 flex items-end gap-2">
          <code
            className="flex-1 min-w-0 type-code block break-all rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-text"
          >
            {endpoint}
          </code>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void copy(endpoint, "endpoint")}
          >
            {copied === "endpoint" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied === "endpoint" ? "Copied" : "Copy endpoint"}
          </Button>
        </div>
        {settings && (
          <div className="mt-4">
            <p className="type-label text-text-muted">
              {settings.lan ? "LAN addresses" : "Local address"}
            </p>
            <ul className="mt-1 space-y-1">
              {(settings.mcpUrls.length > 0 ? settings.mcpUrls : [`${endpoint}`]).map((url) => (
                <li key={url} className="break-all type-code text-text">
                  {url}
                </li>
              ))}
            </ul>
            <p className="mt-2 type-meta text-text-muted">
              Bound to <span className="font-mono">{settings.bindHost}</span>. MCP clients use the address above.
            </p>
            <p className="mt-2 type-body-sm text-text">
              Agent: <span className="font-medium">{settings.agent.clientName ?? "No client identified"}</span>
              <span className="ml-2 text-text-muted">
                ({settings.agent.state === "none" ? "not connected" : settings.agent.state})
              </span>
            </p>
          </div>
        )}
        {settings && (
          <>
            <p className="type-label mt-4 text-text-muted">Vault path</p>
            <p className="type-code mt-1 break-all text-text">{settings.vault}</p>
            {settings.configuredVault !== settings.vault && (
              <p className="mt-1 type-meta text-warning">
                Pending restart: {settings.configuredVault}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {isDesktopApp() && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={vaultPickerBusy}
                    onClick={() => void chooseVault()}
                  >
                    <FolderOpen aria-hidden="true" className="size-4" />
                    {vaultPickerBusy ? "Choosing…" : "Choose vault"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void openVaultFolder(settings.vault)}
                  >
                    Open folder
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={rescanBusy}
                onClick={() => void rescanVault()}
              >
                {rescanBusy ? "Rescanning…" : "Rescan vault"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={backupBusy}
                onClick={() => void backupVault()}
              >
                {backupBusy ? "Backing up…" : "Create backup"}
              </Button>
              <span className="type-meta text-text-muted">
                Backups are copied beside the database. Native folder actions will be available in the desktop app.
              </span>
            </div>
            {backups.length > 0 && (
              <div className="mt-4 border-t border-border-subtle pt-3">
                <p className="type-label text-text-muted">Recent backups</p>
                <ul className="mt-2 space-y-2">
                  {backups.slice(0, 3).map((backup) => (
                    <li key={backup.name} className="rounded-control border border-border-subtle bg-surface-2 px-3 py-2">
                      <p className="type-body-sm font-medium text-text">
                        {new Date(backup.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-0.5 break-all type-meta text-text-muted">
                        {backup.name} · {backup.hasDatabase ? "vault + database" : "vault only"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={diagnosticsBusy}
                onClick={() => void exportDiagnostics()}
              >
                {diagnosticsBusy ? "Preparing report…" : "Export diagnostics"}
              </Button>
            </div>
            <p className="type-label mt-4 text-text-muted">LAN access</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="type-body-sm text-text">{settings.lan ? "Enabled" : "Disabled"}</p>
              <Button
                variant={settings.lan ? "secondary" : "outline"}
                size="sm"
                disabled={settingsBusy}
                onClick={() => void updateLan(!settings.lan)}
              >
                {settings.lan ? "Disable LAN" : "Enable LAN"}
              </Button>
            </div>
            {settings.lan && (
              <p className="mt-2 type-meta text-warning">
                LAN mode exposes this app and its study data to devices on your local network.
              </p>
            )}
          </>
        )}
        <p className="type-label mt-4 text-text-muted">MCP agent token</p>
        <p className="type-body-sm mt-1 text-text-muted">
          Shown masked by default. Reveal to copy it into an MCP client.
        </p>
        <div className="mt-2 flex items-end gap-2">
          <span className="flex-1 min-w-0 font-mono text-sm text-text break-all truncate">
            {tokenBody}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => setTokenShown((v) => !v)}>
            <span className="font-mono text-xs" aria-hidden="true">
              {tokenShown ? "hide" : "reveal"}
            </span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => displayToken && copy(displayToken, "token")}
            disabled={!displayToken}
          >
            {copied === "token" ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
            {copied === "token" ? "Copied" : "Copy token"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={settingsBusy}
            onClick={() => void regenerateToken()}
          >
            Rotate token
          </Button>
        </div>
      </section>
    </div>
  );
}

function libraryTitle(section: string | null): string {
  if (!section) return "Overview";
  return LIBRARY_SECTIONS.find((item) => item.slug === section)?.title ?? "Unknown section";
}

function routeKeyOf(route: Route): string {
  switch (route.name) {
    case "session":
      return `session:${route.id}`;
    case "library":
      return `library:${route.section ?? ""}`;
    default:
      return route.name;
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

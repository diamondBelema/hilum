import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle, BarChart3, Check, ClipboardList, Copy, FileUp, FileText, FolderOpen, Library, Network, ScrollText, Table2 } from "lucide-react";
import { api, type Course, type Health, type NoteMeta, type ServerSettings, type SessionSummary } from "../api.ts";
import { Sidebar } from "../components/Sidebar.tsx";
import { TopBar, type Crumb } from "../components/TopBar.tsx";
import { Drawer } from "../components/Drawer.tsx";
import { Button } from "../components/Button.tsx";
import { subscribeHarnessEvents } from "../lib/events.ts";
import { Dialog } from "../components/Dialog.tsx";
import { SegmentedControl } from "../components/SegmentedControl.tsx";
import { DesignGallery } from "../screens/DesignGallery.tsx";
import { EmptySession } from "../screens/EmptySession.tsx";
import { SessionScreen } from "../screens/SessionScreen.tsx";
import { InboxScreen } from "../screens/Inbox.tsx";
import { ErrorBoundary } from "../components/ErrorBoundary.tsx";
import { graphHref, Link, navigate, goBack, useRoute, type Route } from "../lib/router.ts";
import { cn } from "../lib/cn.ts";
import { chooseInitialCourse, readLastCourse, writeLastCourse } from "../components/CoursePicker.tsx";
import { useTheme, type Theme, useReaderPrefs } from "../theme.ts";
import { apiUrl, isDesktopApp, openVaultFolder, pickVaultDirectory } from "../lib/desktop.ts";
import { LibraryScreen } from "./LibraryScreen.tsx";
import { SettingsScreen } from "./SettingsScreen.tsx";
import { AgentActivity } from "../screens/AgentActivity.tsx";
import { PracticeScreen } from "../screens/PracticeScreen.tsx";
import { NotesLazy, ReaderLazy, EditorLazy, PapersLazy, QuestionsLazy, ProgressLazy, GraphLazy, PlanLazy } from "./lazy.ts";

export function App() {
  if (location.pathname === "/_design") return <DesignGallery />;
  return <AppShell />;
}

export function libraryTitle(section: string | null): string {
  if (!section) return "Overview";
  const LIBRARY_SECTIONS = [
    { slug: "inbox", title: "Inbox", description: "Add source files and review where they belong.", label: "Content", icon: FileUp },
    { slug: "notes", title: "Notes", description: "Read source material, images and cited passages.", label: "Reference", icon: FileText },
    { slug: "exams", title: "Exams", description: "Build, take and resume timed papers.", label: "Assessment", icon: ScrollText },
    { slug: "questions", title: "Questions", description: "Practice from the verified question bank.", label: "Practice", icon: Table2 },
    { slug: "progress", title: "Progress", description: "Review mastery, evidence and what is due.", label: "Feedback", icon: BarChart3 },
    { slug: "plan", title: "Plan", description: "Set goals, review proposed plans and track coverage.", label: "Direction", icon: ClipboardList },
    { slug: "graph", title: "Graph", description: "Explore the relationships between concepts.", label: "Map", icon: Network },
  ];
  return LIBRARY_SECTIONS.find((item) => item.slug === section)?.title ?? "Unknown section";
}

export function routeKeyOf(route: Route): string {
  switch (route.name) {
    case "session":
      return `session:${route.id}`;
    case "library":
      return `library:${route.section ?? ""}`;
    default:
      return route.name;
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function AppShell() {
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

  const createSession = async (course: Course | null, goal?: string, options?: { goalId?: string; timeBoxMin?: number | null }) => {
    if (!course) {
      navigate("/");
      return;
    }
    try {
      const created = await api.startSession(course.code, goal ?? "learn", options);
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
  };

  const refreshSessions = async () => {
    try {
      setSessions(await api.sessionHistory());
    } catch {
      /* keep the list we have */
    }
  };

  const endSession = async () => {
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
  };

  const resumeSession = async () => {
    const id = activeSessionId;
    if (!id) return;
    await api.reopenSession(id);
    await refreshSessions();
    setSessionVersion((v) => v + 1);
  };

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
          : route.name === "agent"
            ? [{ label: "Settings", to: "/settings" }, { label: "Agent activity" }]
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
            <ErrorBoundary key={`${route.id}:${sessionVersion}`} moduleName="Session">
              <SessionScreen
                sessionId={route.id}
                onResume={resumeSession}
                onEndSession={() => setEndOpen(true)}
              />
            </ErrorBoundary>
          )}
          {route.name === "library" && (
            <LibraryScreen section={route.section} onNewSession={createSession} />
          )}
          {route.name === "settings" && <SettingsScreen />}
          {route.name === "agent" && <AgentActivity />}
          {route.name === "practice" && <PracticeScreen courses={courses} />}
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

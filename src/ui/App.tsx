import { useCallback, useEffect, useState } from "react";
import { api, type Course, type SessionSummary } from "./api.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar } from "./components/TopBar.tsx";
import { Sheet } from "./components/Sheet.tsx";
import { DesignGallery } from "./screens/DesignGallery.tsx";
import { EmptySession } from "./screens/EmptySession.tsx";
import { SessionScreen } from "./screens/SessionScreen.tsx";

export function App() {
  if (location.pathname === "/_design") return <DesignGallery />;
  return <AppShell />;
}

function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [route, setRoute] = useState<"home" | "session">("home");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const match = /^\/sessions\/(.+)$/.exec(location.pathname);
    if (match?.[1]) {
      setSessionId(match[1]);
      setActiveSessionId(match[1]);
      setRoute("session");
      setSidebarOpen(false);
    }
  }, []);

  async function openSession(id: string) {
    setActiveSessionId(id);
    setSessionId(id);
    setRoute("session");
    setSidebarOpen(false);
    window.history.pushState(null, "", `/sessions/${id}`);
  }

  function goHome() {
    setRoute("home");
    setSessionId(null);
    setActiveSessionId(null);
    window.history.pushState(null, "", "/");
  }

  async function createSession(course: Course | null, goal?: string) {
    if (!course) {
      goHome();
      return;
    }
    setSelectedCourse(course);
    try {
      const created = await api.startSession(course.code, goal ?? "learn");
      setSessions((prev) => [created, ...prev]);
      openSession(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="h-dvh overflow-x-hidden overflow-y-auto flex flex-col md:flex-row">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 inline-flex min-h-11 -translate-y-20 items-center rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:translate-y-0"
      >
        Skip to content
      </a>

      <Sidebar
        courses={courses}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onSelectSession={openSession}
        onNewSession={createSession}
        onSettings={() => setSettingsOpen(true)}
        sessions={sessions}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        activeSessionId={activeSessionId}
      />

      <div className="h-full flex-1 min-w-0 flex-col overflow-y-auto">
        <TopBar drag open={sidebarOpen} onToggle={() => setSidebarOpen((prev) => !prev)} course={selectedCourse} sessionTitle={sessionId ? "Session" : null} />

        <main id="main" className="flex-1 min-w-0 overflow-y-auto relative">
          {error && (
            <div className="absolute top-16 left-4 right-4 z-40 max-w-md pointer-events-none">
              <div className="mx-auto max-w-md">
                <div className="rounded-control border border-incorrect/40 bg-incorrect-soft p-3 text-sm text-incorrect">
                  {error}
                </div>
              </div>
            </div>
          )}
          {route === "home" ? (
            <EmptySession
              courses={courses}
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
              activeSessionId={activeSessionId}
              onNewSession={createSession}
            />
          ) : (
            <SessionScreen
              sessionId={sessionId!}
              onClose={goHome}
              onNewSession={createSession}
            />
          )}
        </main>
      </div>

      <Sheet
        open={settingsOpen}
        title="Settings"
        onClose={() => setSettingsOpen(false)}
      >
        <div className="p-4">
          <p className="text-sm text-text-muted">Settings coming soon — vault path, LAN, MCP token, theme.</p>
        </div>
      </Sheet>
    </div>
  );
}

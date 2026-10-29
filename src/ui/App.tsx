import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Library } from "lucide-react";
import { api, type Course, type ServerSettings, type SessionDetail, type SessionSummary } from "./api.ts";
import { Sidebar } from "./components/Sidebar.tsx";
import { TopBar, type Crumb } from "./components/TopBar.tsx";
import { Drawer } from "./components/Drawer.tsx";
import { Button } from "./components/Button.tsx";
import { SegmentedControl } from "./components/SegmentedControl.tsx";
import { DesignGallery } from "./screens/DesignGallery.tsx";
import { EmptySession } from "./screens/EmptySession.tsx";
import { SessionScreen } from "./screens/SessionScreen.tsx";
import { Link, navigate, useRoute, type Route } from "./lib/router.ts";
import { useTheme, type Theme } from "./theme.ts";

export function App() {
  if (location.pathname === "/_design") return <DesignGallery />;
  return <AppShell />;
}

function AppShell() {
  const route = useRoute();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [details, setDetails] = useState<Record<string, SessionDetail>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

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

  useEffect(() => {
    if (sessions.length === 0) return;
    let cancelled = false;
    const targets = sessions.slice(0, 30);
    Promise.all(targets.map((session) => api.session(session.id).catch(() => null))).then((list) => {
      if (cancelled) return;
      setDetails((previous) => {
        const next = { ...previous };
        for (const detail of list) if (detail) next[detail.id] = detail;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sessions]);

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
      setSelectedCourse(course);
      try {
        const created = await api.startSession(course.code, goal ?? "learn");
        setSessions((previous) => [created, ...previous]);
        setDetails((previous) => ({ ...previous, [created.id]: created }));
        navigate(`/sessions/${created.id}`);
      } catch (err) {
        setError(messageOf(err));
      }
    },
    [],
  );

  const sessionTitle =
    route.name === "session"
      ? details[route.id]?.goal ?? sessions.find((session) => session.id === route.id)?.goal ?? "Session"
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

      <div className="hidden shrink-0 border-r border-border-subtle lg:flex lg:w-60">
        <Sidebar
          courses={courses}
          sessions={sessions}
          details={details}
          loading={loading}
          activeSessionId={activeSessionId}
        />
      </div>

      <Drawer open={sidebarOpen} onClose={() => setSidebarOpen(false)} label="Sessions">
        <Sidebar
          courses={courses}
          sessions={sessions}
          details={details}
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
        />

        <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
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
              selectedCourse={selectedCourse}
              setSelectedCourse={setSelectedCourse}
              activeSessionId={activeSessionId}
              onNewSession={createSession}
            />
          )}
          {route.name === "session" && (
            <SessionScreen
              sessionId={route.id}
              onClose={() => navigate("/")}
              onNewSession={(course) => (course ? void createSession(course) : navigate("/"))}
            />
          )}
          {route.name === "library" && <LibraryScreen section={route.section} />}
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
      </div>
    </div>
  );
}

const LIBRARY_SECTIONS = [
  { slug: "notes", title: "Notes", description: "Read a note, its images and the questions that cite it." },
  { slug: "exams", title: "Exams", description: "Build, take and resume a timed paper." },
  { slug: "questions", title: "Questions", description: "Browse the practice bank by course and type." },
  { slug: "progress", title: "Progress", description: "See mastery and what is due for review." },
  { slug: "graph", title: "Graph", description: "Explore how topics connect." },
];

function LibraryScreen({ section }: { section: string | null }) {
  const current = LIBRARY_SECTIONS.find((item) => item.slug === section);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <Library aria-hidden="true" className="size-5 text-primary" />
        <h1 className="type-title text-text">Library</h1>
      </div>
      <p className="type-body mt-2 max-w-[68ch] text-text-muted">
        Notes, exams and progress live here. Sessions stay on the home screen.
      </p>

      {section && !current ? (
        <div className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
          <h2 className="type-heading text-text">That section does not exist</h2>
          <p className="type-body-sm mt-1 text-text-muted">
            Choose one of the sections below.
          </p>
        </div>
      ) : null}

      {current ? (
        <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
          <h2 className="type-heading text-text">{current.title}</h2>
          <p className="type-body-sm mt-1 max-w-[68ch] text-text-muted">{current.description}</p>
          <p className="type-body-sm mt-3 max-w-[68ch] text-text-muted">
            This route is in place. The screen itself is still being rebuilt, so it stays quiet until it
            works.
          </p>
          <Link
            to="/library"
            className="type-body-sm mt-4 inline-flex min-h-11 items-center gap-2 font-medium"
          >
            All library sections
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </section>
      ) : (
        <ul className="mt-6 divide-y divide-border-subtle rounded-panel border border-border-subtle bg-surface">
          {LIBRARY_SECTIONS.map((item) => (
            <li key={item.slug}>
              <Link
                to={`/library/${item.slug}`}
                className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="type-body-sm block font-medium text-text">{item.title}</span>
                  <span className="type-body-sm block text-text-muted">{item.description}</span>
                </span>
                <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const endpoint = `${window.location.origin}/mcp`;

  useEffect(() => {
    let cancelled = false;
    api
      .settings()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <h1 className="type-title text-text">Settings</h1>
      <p className="type-body mt-2 text-text-muted">Theme applies immediately. Connection details are read-only.</p>

      <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Appearance</h2>
        <p className="type-body-sm mt-1 text-text-muted">Follow the system or pin a theme for late study.</p>
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
      </section>

      <section className="mt-4 rounded-panel border border-border-subtle bg-surface p-4">
        <h2 className="type-heading text-text">Connection</h2>
        <p className="type-label mt-3 text-text-muted">MCP endpoint</p>
        <code className="type-code mt-1 block break-all rounded-control border border-border-subtle bg-surface-2 px-3 py-2 text-text">
          {endpoint}
        </code>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? "Copied" : "Copy endpoint"}
        </Button>
        {settings && (
          <>
            <p className="type-label mt-4 text-text-muted">Vault</p>
            <p className="type-code mt-1 break-all text-text">{settings.vault}</p>
          </>
        )}
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

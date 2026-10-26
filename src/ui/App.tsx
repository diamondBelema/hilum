import { useEffect, useState } from "react";
import {
  ClipboardCheck,
  Home,
  NotebookText,
  Settings2,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { api, type Course, type NoteDetail, type NoteMeta } from "./api.ts";
import { IconButton } from "./components/Button.tsx";
import { Banner } from "./components/ui.tsx";
import { Study } from "./screens/Study.tsx";
import { Notes } from "./screens/Notes.tsx";
import { Reader } from "./screens/Reader.tsx";
import { Questions } from "./screens/Questions.tsx";
import { ProgressScreen } from "./screens/Placeholders.tsx";
import { Settings } from "./screens/Settings.tsx";
import { DesignGallery } from "./screens/DesignGallery.tsx";
import { readActiveAttempt } from "./lib/activeAttempt.ts";

type Tab = "study" | "exams" | "notes" | "progress";

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "study", label: "Study", icon: Home },
  { id: "exams", label: "Exams", icon: ClipboardCheck },
  { id: "notes", label: "Notes", icon: NotebookText },
  { id: "progress", label: "Progress", icon: TrendingUp },
];

export function App() {
  if (location.pathname === "/_design") return <DesignGallery />;
  return <Shell />;
}

function Shell() {
  const [tab, setTab] = useState<Tab>("study");
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);

  useEffect(() => {
    api
      .courses()
      .then((list) => {
        setCourses(list);
        const match = /^#note=(.+)$/.exec(location.hash);
        if (match?.[1]) {
          const path = decodeURIComponent(match[1]);
          const owner = list.find((item) => path.startsWith(`courses/${item.code}/`));
          if (owner) {
            setCourse(owner);
            setTab("notes");
          }
          void openNote(path);
        } else if (readActiveAttempt()) {
          setTab("exams");
        }
      })
      .catch((err: unknown) => setError(message(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onHash = () => {
      const match = /^#note=(.+)$/.exec(location.hash);
      const path = match?.[1] ? decodeURIComponent(match[1]) : null;
      if (!path) {
        setNote(null);
        return;
      }
      const owner = courses.find((item) => path.startsWith(`courses/${item.code}/`));
      if (owner) setCourse(owner);
      setTab("notes");
      void openNote(path);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courses]);

  useEffect(() => {
    if (!course) return;
    let cancelled = false;
    api
      .notes(course.code)
      .then((list) => !cancelled && setNotes(list))
      .catch((err: unknown) => !cancelled && setError(message(err)));
    return () => {
      cancelled = true;
    };
  }, [course]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const timer = setTimeout(() => {
      api
        .search(query.trim())
        .then(setResults)
        .catch((err: unknown) => setError(message(err)));
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  async function openNote(path: string, anchor?: string) {
    setError(null);
    try {
      const detail = await api.note(path);
      setNote(detail);
      setTab("notes");
      setQuery("");
      setResults(null);
      history.replaceState(null, "", `#note=${encodeURIComponent(path)}`);
      if (anchor) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" })),
        );
      } else {
        window.scrollTo({ top: 0 });
      }
    } catch (err) {
      setError(message(err));
    }
  }

  function selectTab(next: Tab) {
    setTab(next);
    setNote(null);
    setQuery("");
    setResults(null);
    history.replaceState(null, "", "#");
    window.scrollTo({ top: 0 });
  }

  function openCourse(next: Course) {
    setCourse(next);
    setNote(null);
    setQuery("");
    setResults(null);
    setTab("notes");
    history.replaceState(null, "", "#");
    window.scrollTo({ top: 0 });
  }

  function clearCourse() {
    setCourse(null);
    setNote(null);
    setQuery("");
    setResults(null);
    history.replaceState(null, "", "#");
    window.scrollTo({ top: 0 });
  }

  function closeNote() {
    setNote(null);
    history.replaceState(null, "", "#");
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-on-primary focus:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar)] flex-col border-r border-border-subtle bg-surface lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/icon.svg" alt="" aria-hidden="true" className="size-9 rounded-[10px]" />
          <div>
            <p className="text-base font-semibold tracking-tight">Hilum</p>
            <p className="mt-0.5 text-xs text-text-muted">Local study</p>
          </div>
        </div>
        <nav aria-label="Main" className="px-2">
          {NAV.map((item) => (
            <NavButton key={item.id} item={item} active={tab === item.id} onClick={() => selectTab(item.id)} />
          ))}
        </nav>
        {tab === "notes" && course && courses.length > 0 && (
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-2">
            <h2 className="px-3 py-2 text-xs font-semibold text-text-muted">Courses</h2>
            <ul className="space-y-0.5">
              {courses.map((item) => (
                <li key={item.code}>
                  <button
                    type="button"
                    onClick={() => openCourse(item)}
                    aria-current={course?.code === item.code ? "true" : undefined}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-control px-3 text-left text-sm ${
                      course?.code === item.code
                        ? "bg-primary-soft font-semibold text-text"
                        : "text-text-muted hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 font-mono text-xs text-text-muted">{item.notes}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto p-2">
          <button
            type="button"
            onClick={() => setSettings(true)}
            className="flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <Settings2 aria-hidden="true" className="size-5" />
            Settings
          </button>
        </div>
      </aside>

      <nav
        aria-label="Main"
        className="fixed inset-y-0 left-0 z-20 hidden w-16 flex-col items-center gap-1 border-r border-border-subtle bg-surface py-3 sm:flex lg:hidden"
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => selectTab(item.id)}
              className={`flex size-12 items-center justify-center rounded-control ${
                tab === item.id ? "bg-primary-soft text-text" : "text-text-muted hover:bg-surface-2"
              }`}
            >
              <Icon aria-hidden="true" className="size-5" />
            </button>
          );
        })}
        <button
          type="button"
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettings(true)}
          className="mt-auto flex size-12 items-center justify-center rounded-control text-text-muted hover:bg-surface-2"
        >
          <Settings2 aria-hidden="true" className="size-5" />
        </button>
      </nav>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border-subtle bg-bg px-4 py-2 sm:hidden">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <img src="/icon.svg" alt="" aria-hidden="true" className="size-7 rounded-lg" />
          Hilum
        </span>
        <IconButton label="Settings" onClick={() => setSettings(true)}>
          <Settings2 aria-hidden="true" className="size-5" />
        </IconButton>
      </header>

      <main id="main" className="px-4 pt-6 pb-24 sm:pl-20 sm:pr-6 lg:pl-[calc(var(--sidebar)+2rem)] lg:pb-10">
        {error && (
          <div className="mb-4 max-w-3xl">
            <Banner tone="error">{error}</Banner>
          </div>
        )}

        {note ? (
          <Reader note={note} course={course} onBack={closeNote} onOpenNote={(path, anchor) => void openNote(path, anchor)} />
        ) : tab === "study" ? (
          <Study courses={courses} openNotes={openCourse} />
        ) : tab === "notes" ? (
          <Notes
            courses={courses}
            course={course}
            notes={notes}
            results={results}
            query={query}
            onQuery={setQuery}
            onSelectCourse={openCourse}
            onClearCourse={clearCourse}
            onOpenNote={(path) => void openNote(path)}
            loading={loading}
          />
        ) : tab === "exams" ? (
          <Questions courses={courses} />
        ) : (
          <ProgressScreen />
        )}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => selectTab(item.id)}
                  aria-current={tab === item.id ? "page" : undefined}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-xs ${
                    tab === item.id ? "text-primary" : "text-text-muted"
                  }`}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <Settings open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: { label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-sm ${
        active ? "bg-primary-soft font-semibold text-text" : "text-text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <Icon aria-hidden="true" className="size-5" />
      {item.label}
    </button>
  );
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

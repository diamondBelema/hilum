import { useEffect, useRef, useState } from "react";
import {
  Edit,
  Keyboard,
  ListTree,
  Minus,
  Plus,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import type { Course, NoteDetail } from "../api.ts";
import { Markdown } from "../Markdown.tsx";
import { Button, IconButton } from "../components/Button.tsx";
import { Chip } from "../components/ui.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { parseToc, stripLeadingH1, type TocItem } from "../lib/markdown.ts";
import { useReaderPrefs, useTheme, type Theme } from "../theme.ts";

export function Reader({
  note,
  course,
  onOpenNote,
  onEditNote,
  onDeleteNote,
}: {
  note: NoteDetail;
  course: Course | null;
  onOpenNote: (path: string, anchor?: string) => void;
  onEditNote?: (path: string) => void;
  onDeleteNote?: (path: string) => void;
}) {
  if (!note) return null;
  const { prefs, setPrefs, size, lineHeight } = useReaderPrefs();
  const { theme, setTheme } = useTheme();
  const [tocOpen, setTocOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const toc = parseToc(note.body);

  useEffect(() => {
    setTocOpen(false);
    setPrefsOpen(false);
    window.scrollTo({ top: 0 });
  }, [note.path]);

  return (
    <div className="flex w-full gap-6 px-4 pt-4 pb-24 sm:px-6 lg:px-8">
      <article className="reader-article min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="hidden min-w-0 flex-1 truncate type-body-sm sm:block">
            {course ? `${course.title} / ` : ""}
            <span className="type-body">{note.title}</span>
          </p>
          <Chip className="hidden shrink-0 sm:inline-flex">
            {note.path.split("/").at(-2)?.replaceAll("-", " ") ?? "General"}
          </Chip>
          <Button
            variant="ghost"
            className="ml-auto px-2 xl:hidden"
            onClick={() => setTocOpen(true)}
            aria-haspopup="dialog"
            aria-label="Contents"
          >
            <ListTree aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">Contents</span>
          </Button>
          <Button variant="ghost" className="px-2" onClick={() => setPrefsOpen(true)} aria-haspopup="dialog">
            <span className="font-mono type-body-sm" aria-hidden="true">
              Aa
            </span>
            <span className="sr-only">Reading settings</span>
          </Button>
          {onEditNote && (
            <Button variant="ghost" className="px-2" onClick={() => onEditNote(note.path)}>
              <Edit aria-hidden="true" className="size-5" />
              <span className="sr-only">Edit note</span>
            </Button>
          )}
          {onDeleteNote && (
            <Button variant="destructive" className="px-2" onClick={() => onDeleteNote(note.path)}>
              <Trash2 aria-hidden="true" className="size-5" />
              <span className="sr-only">Delete note</span>
            </Button>
          )}
        </div>

        <div className="mt-4 rounded-panel border border-border-subtle bg-surface p-5 sm:p-6" style={{ fontSize: size, lineHeight }}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle pb-5">
            <div className="min-w-0">
              <h1 className="type-title">{note.title}</h1>
              {note.summary && <p className="mt-2 max-w-3xl type-body-sm text-text-muted">{note.summary}</p>}
            </div>
            {note.tags.length > 0 && (
              <ul className="flex max-w-xl flex-wrap justify-end gap-1.5">
                {note.tags.map((tag) => <li key={tag}><Chip>{tag}</Chip></li>)}
              </ul>
            )}
          </div>
          <div className="mt-6 border-t border-border-subtle pt-3">
            <Markdown
              body={stripLeadingH1(note.body)}
              notePath={note.path}
              onOpenNote={onOpenNote}
              onZoomImage={(src, alt) => setZoom({ src, alt })}
            />
          </div>
        </div>
      </article>

      {toc.length > 0 && (
        <aside className="sticky top-4 hidden w-[320px] shrink-0 self-start xl:block">
          <nav aria-label="On this page">
            <h2 className="type-meta text-text-muted">On this page</h2>
            <Toc items={toc} />
          </nav>
        </aside>
      )}

      <Sheet open={tocOpen} title="Contents" onClose={() => setTocOpen(false)}>
        {toc.length > 0 ? (
          <Toc items={toc} onPick={() => setTocOpen(false)} />
        ) : (
          <p className="type-body-sm text-text-muted">This note has no sections.</p>
        )}
      </Sheet>

      <Sheet open={prefsOpen} title="Reading settings" onClose={() => setPrefsOpen(false)}>
        <div className="space-y-6">
          <PrefRow
            label="Text size"
            value={`${prefs.size === 0 ? "Small" : prefs.size === 1 ? "Medium" : "Large"}`}
            onLess={() => setPrefs((p) => ({ ...p, size: Math.max(0, p.size - 1) }))}
            onMore={() => setPrefs((p) => ({ ...p, size: Math.min(2, p.size + 1) }))}
            lessDisabled={prefs.size === 0}
            moreDisabled={prefs.size === 2}
          />
          <PrefRow
            label="Line spacing"
            value={prefs.spacing === 0 ? "Tight" : prefs.spacing === 1 ? "Normal" : "Loose"}
            onLess={() => setPrefs((p) => ({ ...p, spacing: Math.max(0, p.spacing - 1) }))}
            onMore={() => setPrefs((p) => ({ ...p, spacing: Math.min(2, p.spacing + 1) }))}
            lessDisabled={prefs.spacing === 0}
            moreDisabled={prefs.spacing === 2}
          />
          <div>
            <h3 className="type-label">Theme</h3>
            <ThemeChoice theme={theme} setTheme={setTheme} />
          </div>
          <p className="flex items-center gap-2 type-meta text-text-muted">
            <Keyboard aria-hidden="true" className="size-4" />
            Esc to close.
          </p>
        </div>
      </Sheet>

      <ZoomDialog zoom={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function Toc({ items, onPick }: { items: TocItem[]; onPick?: () => void }) {
  return (
    <ul className="mt-2 space-y-1 pl-2">
      {items.map((item) => (
        <li key={`${item.id}-${item.level}`}>
          <a
            href={`#${item.id}`}
            onClick={(event) => {
              event.preventDefault();
              document.getElementById(item.id)?.scrollIntoView({ block: "start" });
              onPick?.();
            }}
            className={`block min-h-11 border-transparent py-2 pl-3 type-body-sm rounded-control ${
              item.level === 3 ? "pl-6" : ""
            } text-text-muted hover:bg-surface-2 hover:text-text`}
          >
            {item.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function PrefRow({
  label,
  value,
  onLess,
  onMore,
  lessDisabled,
  moreDisabled,
}: {
  label: string;
  value: string;
  onLess: () => void;
  onMore: () => void;
  lessDisabled: boolean;
  moreDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="type-label">{label}</h3>
        <p className="type-body-sm text-text-muted">{value}</p>
      </div>
      <div className="flex gap-2">
        <IconButton label={`Decrease ${label.toLowerCase()}`} onClick={onLess} disabled={lessDisabled}>
          <Minus aria-hidden="true" className="size-5" />
        </IconButton>
        <IconButton label={`Increase ${label.toLowerCase()}`} onClick={onMore} disabled={moreDisabled}>
          <Plus aria-hidden="true" className="size-5" />
        </IconButton>
      </div>
    </div>
  );
}

export function ThemeChoice({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const options: { value: Theme; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div role="group" aria-label="Theme" className="mt-2 flex gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => setTheme(option.value)}
          className={`min-h-11 flex-1 rounded-control border px-3 type-body-sm ${
            theme === option.value
              ? "border-primary bg-primary-soft font-semibold text-text"
              : "border-border-subtle text-text-muted hover:bg-surface-2"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ZoomDialog({ zoom, onClose }: { zoom: { src: string; alt: string } | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (zoom && !dialog.open) dialog.showModal();
    if (!zoom && dialog.open) dialog.close();
  }, [zoom]);

  return (
    <dialog
      ref={ref}
      aria-label={zoom?.alt || "Image"}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="max-h-[95dvh] max-w-[95vw] bg-transparent p-0 text-text backdrop:bg-black/80"
    >
      {zoom && (
        <div className="relative">
          <img src={zoom.src} alt={zoom.alt} className="max-h-[90dvh] max-w-[92vw] object-contain" />
          <div className="absolute top-2 right-2">
            <IconButton
              label="Close image"
              onClick={onClose}
              className="bg-surface/90 text-text hover:bg-surface"
            >
              <X aria-hidden="true" className="size-5" />
            </IconButton>
          </div>
          {zoom.alt && (
            <p className="mt-2 flex items-center gap-2 type-body-sm text-text">
              <ZoomIn aria-hidden="true" className="size-5" />
              {zoom.alt}
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
